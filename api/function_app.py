import json
import os
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from azure.cosmos import CosmosClient
import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT") or os.getenv("COSMOSDB_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY") or os.getenv("COSMOSDB_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "coaches-playboard")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER", "playboard")
AUTH_MODE = os.getenv("AUTH_MODE", "").lower()
DEV_AUTH_SECRET = os.getenv("DEV_AUTH_SECRET", "")
DEV_USER_ID = os.getenv("DEV_USER_ID", "local-coach")
DEV_USER_NAME = os.getenv("DEV_USER_NAME", "Local Coach")


class Storage:
    def __init__(self):
        self.memory = {"playbooks": {}, "plays": {}, "slides": {}, "exports": {}, "gamePlans": {}, "scoutPlays": {}}
        self.container = None
        if COSMOS_ENDPOINT and COSMOS_KEY:
            # Disable endpoint discovery: the emulator advertises its internal
            # container IP, which isn't reachable from the host.
            client = CosmosClient(
                COSMOS_ENDPOINT,
                COSMOS_KEY,
                connection_verify=False,
                enable_endpoint_discovery=False,
            )
            database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
            self.container = database.create_container_if_not_exists(
                id=COSMOS_CONTAINER,
                partition_key={"paths": ["/partitionKey"], "kind": "Hash"},
            )

    def list(self, entity_type, parent_id=None, category=None, name_prefix=None, owner_id=None):
        if self.container:
            query = "SELECT * FROM c WHERE c.entityType = @entityType"
            parameters = [{"name": "@entityType", "value": entity_type}]
            if parent_id:
                query += " AND c.parentId = @parentId"
                parameters.append({"name": "@parentId", "value": parent_id})
            if category is not None:
                query += " AND c.category = @category"
                parameters.append({"name": "@category", "value": category})
            if name_prefix:
                query += " AND STARTSWITH(c.name, @namePrefix, true)"
                parameters.append({"name": "@namePrefix", "value": name_prefix})
            if owner_id:
                query += " AND c.ownerId = @ownerId"
                parameters.append({"name": "@ownerId", "value": owner_id})
            return list(self.container.query_items(query, parameters=parameters, enable_cross_partition_query=True))
        records = list(self.memory[entity_type].values())
        return [record for record in records if (not parent_id or record.get("parentId") == parent_id)
                and (category is None or record.get("category") == category)
                and (not name_prefix or (record.get("name") or "").casefold().startswith(name_prefix.casefold()))
                and (not owner_id or record.get("ownerId") == owner_id)]

    def get(self, entity_type, item_id):
        if self.container:
            try:
                return self.container.read_item(item=item_id, partition_key=entity_type)
            except Exception:
                return None
        return self.memory[entity_type].get(item_id)

    def save(self, entity_type, record):
        record["entityType"] = entity_type
        record["partitionKey"] = entity_type
        if self.container:
            return self.container.upsert_item(record)
        self.memory[entity_type][record["id"]] = record
        return record

    def delete(self, entity_type, item_id):
        if self.container:
            self.container.delete_item(item=item_id, partition_key=entity_type)
        else:
            self.memory[entity_type].pop(item_id, None)

    def claim_legacy_records(self, owner_id):
        for entity_type in self.memory:
            if self.container:
                records = self.container.query_items(
                    "SELECT * FROM c WHERE c.entityType = @entityType AND NOT IS_DEFINED(c.ownerId)",
                    parameters=[{"name": "@entityType", "value": entity_type}],
                    enable_cross_partition_query=True,
                )
            else:
                records = self.memory[entity_type].values()
            for record in list(records):
                if not record.get("ownerId"):
                    record["ownerId"] = owner_id
                    self.save(entity_type, record)


storage = Storage()

if AUTH_MODE == "development":
    storage.claim_legacy_records(DEV_USER_ID)


def response(payload, status=200):
    return func.HttpResponse(
        json.dumps(payload),
        status_code=status,
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )


def body(req):
    try:
        return req.get_json() or {}
    except ValueError:
        return {}


def now():
    return datetime.now(timezone.utc).isoformat()


def not_found(kind, item_id):
    return response({"error": {"code": "NOT_FOUND", "message": f"{kind} {item_id} was not found"}}, 404)


def forbidden():
    return response({"error": {"code": "FORBIDDEN", "message": "You do not have access to this resource"}}, 403)


def authenticate_request(req):
    if AUTH_MODE != "development":
        return None, response({"error": {
            "code": "AUTH_NOT_CONFIGURED",
            "message": "A supported authentication provider is not configured",
        }}, 503)

    supplied_secret = req.headers.get("X-Dev-Auth-Secret", "")
    supplied_user_id = req.headers.get("X-Dev-User", "").strip()
    if not DEV_AUTH_SECRET or not supplied_user_id or not secrets.compare_digest(supplied_secret, DEV_AUTH_SECRET):
        return None, response({"error": {"code": "UNAUTHORIZED", "message": "Authentication is required"}}, 401)

    return {
        "userId": supplied_user_id,
        "name": DEV_USER_NAME if supplied_user_id == DEV_USER_ID else supplied_user_id,
        "roles": ["coordinator"],
    }, None


def with_child_count(record, entity_type, owner_id):
    record = dict(record)
    record["playCount"] = len(storage.list(entity_type, record["id"], owner_id=owner_id))
    return record


def create_record(entity_type, payload, owner_id, parent_id=None):
    item_id = str(uuid4())
    record = {**payload, "id": item_id, "ownerId": owner_id, "createdAt": now(), "updatedAt": now()}
    if parent_id:
        record["parentId"] = parent_id
    return response(storage.save(entity_type, record), 201)


def update_record(entity_type, item_id, payload):
    record = storage.get(entity_type, item_id)
    if record is None:
        return None
    immutable_fields = {"id", "ownerId", "parentId", "entityType", "partitionKey", "createdAt"}
    record.update({key: value for key, value in payload.items() if key not in immutable_fields})
    record["updatedAt"] = now()
    return response(storage.save(entity_type, record))


@app.route(route="{*path}", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
def api(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Dev-Auth-Secret,X-Dev-User",
        })

    path = (req.route_params.get("path") or "").strip("/").split("/")
    method = req.method

    if path == ["health"] and method == "GET":
        return response({"status": "ok", "service": "coaches-playboard-api"})

    user, auth_error = authenticate_request(req)
    if auth_error:
        return auth_error
    owner_id = user["userId"]

    if path == ["me"] and method == "GET":
        return response(user)

    if path == ["search"] and method == "GET":
        query = (req.params.get("q") or "").lower()
        results = [p for p in storage.list("playbooks", owner_id=owner_id) if not query or query in p.get("name", "").lower()]
        return response({"items": results, "query": query})

    if path == ["playbooks"]:
        if method == "GET":
            records = storage.list("playbooks", category=req.params.get("category"), name_prefix=req.params.get("namePrefix"), owner_id=owner_id)
            return response({"items": [with_child_count(record, "plays", owner_id) for record in records]})
        if method == "POST":
            payload = body(req)
            if not payload.get("name"):
                return response({"error": {"code": "VALIDATION_ERROR", "message": "name is required"}}, 400)
            return create_record("playbooks", payload, owner_id)

    if path == ["game-plans"]:
        if method == "GET":
            records = storage.list("gamePlans", category=req.params.get("category"), name_prefix=req.params.get("namePrefix"), owner_id=owner_id)
            return response({"items": [with_child_count(record, "scoutPlays", owner_id) for record in records]})
        if method == "POST":
            payload = body(req)
            if not payload.get("name"):
                return response({"error": {"code": "VALIDATION_ERROR", "message": "name is required"}}, 400)
            return create_record("gamePlans", payload, owner_id)

    if len(path) >= 2 and path[0] == "game-plans":
        game_plan_id = path[1]
        game_plan = storage.get("gamePlans", game_plan_id)
        if game_plan is None:
            return not_found("Game plan", game_plan_id)
        if game_plan.get("ownerId") != owner_id:
            return forbidden()
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(game_plan, "scoutPlays", owner_id))
            if method == "PATCH":
                return update_record("gamePlans", game_plan_id, body(req))
            if method == "DELETE":
                storage.delete("gamePlans", game_plan_id)
                return func.HttpResponse(status_code=204)

        if len(path) >= 3 and path[2] == "scout-plays":
            entity_type = "scoutPlays"
            if len(path) == 3:
                records = storage.list(entity_type, game_plan_id, req.params.get("category"), req.params.get("namePrefix"), owner_id)
                if method == "GET":
                    return response({"items": records})
                if method == "POST":
                    return create_record(entity_type, body(req), owner_id, game_plan_id)
            if len(path) == 4:
                item_id = path[3]
                record = storage.get(entity_type, item_id)
                if record is None or record.get("parentId") != game_plan_id:
                    return not_found("Scout play", item_id)
                if method == "GET":
                    return response(record)
                if method == "PATCH":
                    return update_record(entity_type, item_id, body(req))
                if method == "DELETE":
                    storage.delete(entity_type, item_id)
                    return func.HttpResponse(status_code=204)

    if len(path) >= 2 and path[0] == "playbooks":
        playbook_id = path[1]
        playbook = storage.get("playbooks", playbook_id)
        if playbook is None:
            return not_found("Playbook", playbook_id)
        if playbook.get("ownerId") != owner_id:
            return forbidden()
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(playbook, "plays", owner_id))
            if method == "PATCH":
                return update_record("playbooks", playbook_id, body(req))
            if method == "DELETE":
                storage.delete("playbooks", playbook_id)
                return func.HttpResponse(status_code=204)

        if len(path) >= 3 and path[2] == "plays":
            if len(path) == 3:
                records = storage.list(
                    "plays", playbook_id, req.params.get("category"), req.params.get("namePrefix"), owner_id
                )
                if method == "GET":
                    return response({"items": records})
                if method == "POST":
                    return create_record("plays", body(req), owner_id, playbook_id)

            if len(path) >= 4:
                play_id = path[3]
                play = storage.get("plays", play_id)
                if play is None or play.get("parentId") != playbook_id:
                    return not_found("Play", play_id)
                if len(path) == 4:
                    if method == "GET":
                        return response(play)
                    if method == "PATCH":
                        return update_record("plays", play_id, body(req))
                    if method == "DELETE":
                        storage.delete("plays", play_id)
                        return func.HttpResponse(status_code=204)

                if len(path) >= 5 and path[4] == "slides":
                    if len(path) == 5:
                        records = storage.list("slides", play_id, owner_id=owner_id)
                        if method == "GET":
                            return response({"items": records})
                        if method == "POST":
                            if len(records) >= 3:
                                return response({
                                    "error": {
                                        "code": "SLIDE_LIMIT_REACHED",
                                        "message": "A play can have at most 3 adjustment slides",
                                    }
                                }, 409)
                            return create_record("slides", body(req), owner_id, play_id)
                    if len(path) == 6:
                        slide_id = path[5]
                        slide = storage.get("slides", slide_id)
                        if slide is None or slide.get("parentId") != play_id:
                            return not_found("Slide", slide_id)
                        if method == "GET":
                            return response(slide)
                        if method == "PATCH":
                            return update_record("slides", slide_id, body(req))
                        if method == "DELETE":
                            storage.delete("slides", slide_id)
                            return func.HttpResponse(status_code=204)

    if path == ["exports"] and method == "POST":
        record = {**body(req), "id": str(uuid4()), "ownerId": owner_id, "status": "queued", "createdAt": now()}
        return response(storage.save("exports", record), 202)

    if len(path) == 2 and path[0] == "exports" and method == "GET":
        record = storage.get("exports", path[1])
        if not record:
            return not_found("Export", path[1])
        return response(record) if record.get("ownerId") == owner_id else forbidden()

    return response({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, 404)
