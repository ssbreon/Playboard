import json
import os
from datetime import datetime, timezone
from uuid import uuid4

from azure.cosmos import CosmosClient
import azure.functions as func

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT") or os.getenv("COSMOSDB_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY") or os.getenv("COSMOSDB_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "coaches-playboard")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER", "playboard")


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

    def list(self, entity_type, parent_id=None):
        if self.container:
            query = "SELECT * FROM c WHERE c.entityType = @entityType"
            parameters = [{"name": "@entityType", "value": entity_type}]
            if parent_id:
                query += " AND c.parentId = @parentId"
                parameters.append({"name": "@parentId", "value": parent_id})
            return list(self.container.query_items(query, parameters=parameters, enable_cross_partition_query=True))
        records = list(self.memory[entity_type].values())
        return [record for record in records if not parent_id or record.get("parentId") == parent_id]

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


storage = Storage()


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


def with_child_count(record, entity_type):
    record = dict(record)
    record["playCount"] = len(storage.list(entity_type, record["id"]))
    return record


def create_record(entity_type, payload, parent_id=None):
    item_id = str(uuid4())
    record = {"id": item_id, **payload, "createdAt": now(), "updatedAt": now()}
    if parent_id:
        record["parentId"] = parent_id
    return response(storage.save(entity_type, record), 201)


def update_record(entity_type, item_id, payload):
    record = storage.get(entity_type, item_id)
    if record is None:
        return None
    record.update(payload)
    record["updatedAt"] = now()
    return response(storage.save(entity_type, record))


@app.route(route="{*path}", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
def api(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })

    path = (req.route_params.get("path") or "").strip("/").split("/")
    method = req.method

    if path == ["health"] and method == "GET":
        return response({"status": "ok", "service": "coaches-playboard-api"})

    if path == ["search"] and method == "GET":
        query = (req.params.get("q") or "").lower()
        results = [p for p in storage.list("playbooks") if not query or query in p.get("name", "").lower()]
        return response({"items": results, "query": query})

    if path == ["playbooks"]:
        if method == "GET":
            return response({"items": [with_child_count(p, "plays") for p in storage.list("playbooks")]})
        if method == "POST":
            payload = body(req)
            if not payload.get("name"):
                return response({"error": {"code": "VALIDATION_ERROR", "message": "name is required"}}, 400)
            return create_record("playbooks", payload)

    if path == ["game-plans"]:
        if method == "GET":
            return response({"items": [with_child_count(g, "scoutPlays") for g in storage.list("gamePlans")]})
        if method == "POST":
            payload = body(req)
            if not payload.get("name"):
                return response({"error": {"code": "VALIDATION_ERROR", "message": "name is required"}}, 400)
            return create_record("gamePlans", payload)

    if len(path) >= 2 and path[0] == "game-plans":
        game_plan_id = path[1]
        game_plan = storage.get("gamePlans", game_plan_id)
        if game_plan is None:
            return not_found("Game plan", game_plan_id)
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(game_plan, "scoutPlays"))
            if method == "PATCH":
                return update_record("gamePlans", game_plan_id, body(req))
            if method == "DELETE":
                storage.delete("gamePlans", game_plan_id)
                return func.HttpResponse(status_code=204)

        if len(path) >= 3 and path[2] == "scout-plays":
            entity_type = "scoutPlays"
            if len(path) == 3:
                records = storage.list(entity_type, game_plan_id)
                if method == "GET":
                    return response({"items": records})
                if method == "POST":
                    return create_record(entity_type, body(req), game_plan_id)
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
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(playbook, "plays"))
            if method == "PATCH":
                return update_record("playbooks", playbook_id, body(req))
            if method == "DELETE":
                storage.delete("playbooks", playbook_id)
                return func.HttpResponse(status_code=204)

        if len(path) >= 3 and path[2] in ("plays", "slides"):
            resource = path[2]
            entity_type = "plays" if resource == "plays" else "slides"
            if len(path) == 3:
                records = storage.list(entity_type, playbook_id)
                if method == "GET":
                    return response({"items": records})
                if method == "POST":
                    return create_record(entity_type, body(req), playbook_id)
            if len(path) == 4:
                item_id = path[3]
                record = storage.get(entity_type, item_id)
                if record is None or record.get("parentId") != playbook_id:
                    return not_found(resource[:-1].title(), item_id)
                if method == "GET":
                    return response(record)
                if method == "PATCH":
                    return update_record(entity_type, item_id, body(req))
                if method == "DELETE":
                    storage.delete(entity_type, item_id)
                    return func.HttpResponse(status_code=204)

    if path == ["exports"] and method == "POST":
        record = {"id": str(uuid4()), "status": "queued", "createdAt": now(), **body(req)}
        return response(storage.save("exports", record), 202)

    if len(path) == 2 and path[0] == "exports" and method == "GET":
        record = storage.get("exports", path[1])
        return response(record) if record else not_found("Export", path[1])

    return response({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, 404)
