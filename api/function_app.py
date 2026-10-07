import json
import os
import secrets
import hashlib
import threading
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4

from azure.core import MatchConditions
from azure.core.exceptions import HttpResponseError, ResourceExistsError, ResourceNotFoundError
from azure.cosmos import CosmosClient
import azure.functions as func
import accounts

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT") or os.getenv("COSMOSDB_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY") or os.getenv("COSMOSDB_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "coaches-playboard")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER", "playboard")
AUTH_MODE = os.getenv("AUTH_MODE", "").lower()
DEV_AUTH_SECRET = os.getenv("DEV_AUTH_SECRET", "")
DEV_USER_ID = os.getenv("DEV_USER_ID", "local-coach")
DEV_USER_NAME = os.getenv("DEV_USER_NAME", "Local Coach")
CONTENT_TYPES = ("playbooks", "plays", "slides", "exports", "gamePlans", "scoutPlays")
request_workspace = ContextVar("request_workspace", default=None)
accounts.validate_environment(COSMOS_ENDPOINT)


class Storage:
    def __init__(self):
        self.memory = {entity: {} for entity in (*CONTENT_TYPES, "profiles", "workspaces", "memberships", "invitations", "outbox")}
        self.usage = {}
        self.lock = threading.RLock()
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

    def list(self, entity_type, parent_id=None, category=None, name_prefix=None, owner_id=None, workspace_id=None):
        scope = workspace_id or (request_workspace.get()["id"] if owner_id and request_workspace.get() else None)
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
            if owner_id and not scope:
                query += " AND c.ownerId = @ownerId"
                parameters.append({"name": "@ownerId", "value": owner_id})
            records = list(self.container.query_items(query, parameters=parameters, enable_cross_partition_query=True))
        else:
            records = list(self.memory[entity_type].values())
        workspace = self.get("workspaces", scope) if scope else None
        return [record for record in records if (not parent_id or record.get("parentId") == parent_id)
                and (category is None or record.get("category") == category)
                and (not name_prefix or (record.get("name") or "").casefold().startswith(name_prefix.casefold()))
                and (accounts.belongs(record, workspace) if workspace else (not scope and (not owner_id or record.get("ownerId") == owner_id)))]

    def get(self, entity_type, item_id):
        if self.container:
            try:
                return self.container.read_item(item=item_id, partition_key=entity_type)
            except ResourceNotFoundError:
                return None
        return self.memory[entity_type].get(item_id)

    def save(self, entity_type, record):
        record["entityType"] = entity_type
        record["partitionKey"] = entity_type
        if self.container:
            try:
                if record.get("_etag"):
                    saved = self.container.replace_item(item=record["id"], body=record, etag=record["_etag"], match_condition=MatchConditions.IfNotModified)
                else:
                    saved = self.container.create_item(record)
                record.update(saved)
                return record
            except HttpResponseError as error:
                if isinstance(error, ResourceExistsError) or error.status_code == 412:
                    raise accounts.AccountError("RECORD_CHANGED", "This record changed during the operation; reload and retry", 409) from None
                raise
        self.memory[entity_type][record["id"]] = record
        return record

    def delete(self, entity_type, item_id):
        workspace = request_workspace.get()
        counted = workspace and entity_type in accounts.LIMITS and self.get(entity_type, item_id) is not None
        if counted:
            self.usage_counts(workspace)
        if self.container:
            self.container.delete_item(item=item_id, partition_key=entity_type)
        else:
            self.memory[entity_type].pop(item_id, None)
        if counted:
            self.adjust_usage(workspace, entity_type, -1)

    def usage_counts(self, workspace):
        workspace_id = workspace["id"]
        if self.container:
            try:
                return self.container.read_item(item="usage", partition_key=workspace_id)
            except ResourceNotFoundError:
                counts = {entity: len(self.list(entity, workspace_id=workspace_id)) for entity in accounts.LIMITS}
                return self.container.create_item({"id": "usage", "entityType": "workspaceUsage", "partitionKey": workspace_id, "counts": counts})
        if workspace_id not in self.usage:
            self.usage[workspace_id] = {"counts": {entity: len(self.list(entity, workspace_id=workspace_id)) for entity in accounts.LIMITS}}
        return self.usage[workspace_id]

    def adjust_usage(self, workspace, entity_type, delta):
        ledger = self.usage_counts(workspace)
        current = ledger["counts"].get(entity_type, 0)
        if delta > 0 and current >= accounts.LIMITS[entity_type]:
            raise accounts.AccountError("CONTENT_LIMIT_REACHED", f"This workspace has reached its {accounts.LIMITS[entity_type]} {entity_type} limit", 409)
        ledger["counts"][entity_type] = max(0, current + delta)
        if self.container:
            self.container.replace_item(item="usage", body=ledger, etag=ledger["_etag"], match_condition=MatchConditions.IfNotModified)

    def delete_tree(self, entity_type, item_id):
        child_type = {"playbooks": "plays", "plays": "slides", "gamePlans": "scoutPlays"}.get(entity_type)
        if child_type:
            for child in self.list(child_type, parent_id=item_id, workspace_id=request_workspace.get()["id"]):
                self.delete_tree(child_type, child["id"])
        self.delete(entity_type, item_id)

    def claim_legacy_records(self, owner_id):
        for entity_type in CONTENT_TYPES:
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

    @contextmanager
    def guard(self, scope):
        with self.lock:
            if not self.container:
                yield
                return
            lock_id = "lock-" + hashlib.sha256(scope.encode()).hexdigest()
            try:
                lease = self.container.create_item({"id": lock_id, "partitionKey": scope, "entityType": "operations", "scope": scope, "createdAt": now()})
            except ResourceExistsError:
                raise accounts.AccountError("WORKSPACE_BUSY", "Another workspace operation is in progress; retry shortly", 409) from None
            try:
                yield
            finally:
                self.container.delete_item(lock_id, partition_key=scope, etag=lease["_etag"], match_condition=MatchConditions.IfNotModified)


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
        payload = req.get_json()
    except ValueError:
        raise accounts.AccountError("VALIDATION_ERROR", "Request body must be a JSON object") from None
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise accounts.AccountError("VALIDATION_ERROR", "Request body must be a JSON object")
    return payload


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
        "email": os.getenv("DEV_USER_EMAIL", "") if supplied_user_id == DEV_USER_ID else (supplied_user_id if "@" in supplied_user_id else ""),
        "emailVerified": True,
        "roles": [],
    }, None


def with_child_count(record, entity_type, owner_id):
    record = dict(record)
    record["playCount"] = len(storage.list(entity_type, record["id"], owner_id=owner_id))
    return record


def create_record(entity_type, payload, owner_id, parent_id=None):
    payload = {key: value for key, value in payload.items() if key not in {"_etag", "_rid", "_self", "_ts", "_attachments"}}
    workspace = request_workspace.get()
    if workspace and entity_type in accounts.LIMITS:
        storage.adjust_usage(workspace, entity_type, 1)
    item_id = str(uuid4())
    record = {**payload, "id": item_id, "ownerId": owner_id, "createdAt": now(), "updatedAt": now()}
    if workspace:
        record["workspaceId"] = workspace["id"]
        record["createdBy"] = owner_id
    if parent_id:
        record["parentId"] = parent_id
    return response(storage.save(entity_type, record), 201)


def update_record(entity_type, item_id, payload):
    record = storage.get(entity_type, item_id)
    if record is None:
        return None
    immutable_fields = {"id", "ownerId", "workspaceId", "createdBy", "parentId", "entityType", "partitionKey", "createdAt", "_etag", "_rid", "_self", "_ts", "_attachments"}
    record.update({key: value for key, value in payload.items() if key not in immutable_fields})
    record["updatedAt"] = now()
    return response(storage.save(entity_type, record))


@app.route(route="{*path}", methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"])
def api(req: func.HttpRequest) -> func.HttpResponse:
    path = (req.route_params.get("path") or "").strip("/").split("/")
    if req.method == "OPTIONS" or (path == ["health"] and req.method == "GET"):
        return dispatch(req, None, None, None)
    user, auth_error = authenticate_request(req)
    if auth_error:
        return auth_error
    try:
        with storage.guard("user:" + user["userId"]):
            accounts.ensure_user(storage, user)
        global_route = path[0] in {"me", "workspaces", "invitations"}
        workspace, role = accounts.select_workspace(storage, user, None if global_route else req.headers.get("X-Workspace-Id"))
        token = request_workspace.set(workspace)
        try:
            with storage.guard("user:" + user["userId"] if global_route else workspace["id"]):
                workspace, role = accounts.select_workspace(storage, user, None if global_route else req.headers.get("X-Workspace-Id"))
                request_workspace.set(workspace)
                if path[0] in {"playbooks", "game-plans", "search", "exports", "workspace"}:
                    accounts.enter_workspace(storage, workspace)
                return dispatch(req, user, workspace, role)
        finally:
            request_workspace.reset(token)
    except accounts.AccountError as error:
        return response({"error": {"code": error.code, "message": str(error)}}, error.status)


def dispatch(req, user, workspace, role):
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Dev-Auth-Secret,X-Dev-User,X-Workspace-Id",
        })

    path = (req.route_params.get("path") or "").strip("/").split("/")
    method = req.method

    if path == ["health"] and method == "GET":
        return response({"status": "ok", "service": "coaches-playboard-api"})

    owner_id = user["userId"]

    account_result = accounts.account_route(storage, user, workspace, role, path, method, body(req) if method in {"POST", "PATCH"} else {})
    if account_result is not None:
        payload, status = account_result
        return response(payload, status) if status != 204 else func.HttpResponse(status_code=204)
    if not accounts.can_read(workspace):
        raise accounts.AccountError("CONTENT_RETENTION_ENDED", "This workspace's eighteen-month content retention period has ended", 410)
    if method in {"POST", "PATCH", "DELETE"} and path != ["exports"]:
        accounts.require_write(workspace, role, "delete" if method == "DELETE" else "edit")

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
        if not accounts.belongs(game_plan, workspace):
            return forbidden()
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(game_plan, "scoutPlays", owner_id))
            if method == "PATCH":
                return update_record("gamePlans", game_plan_id, body(req))
            if method == "DELETE":
                storage.delete_tree("gamePlans", game_plan_id)
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
                if record is None or record.get("parentId") != game_plan_id or not accounts.belongs(record, workspace):
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
        if not accounts.belongs(playbook, workspace):
            return forbidden()
        if len(path) == 2:
            if method == "GET":
                return response(with_child_count(playbook, "plays", owner_id))
            if method == "PATCH":
                return update_record("playbooks", playbook_id, body(req))
            if method == "DELETE":
                storage.delete_tree("playbooks", playbook_id)
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
                if play is None or play.get("parentId") != playbook_id or not accounts.belongs(play, workspace):
                    return not_found("Play", play_id)
                if len(path) == 4:
                    if method == "GET":
                        return response(play)
                    if method == "PATCH":
                        return update_record("plays", play_id, body(req))
                    if method == "DELETE":
                        storage.delete_tree("plays", play_id)
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
                        if slide is None or slide.get("parentId") != play_id or not accounts.belongs(slide, workspace):
                            return not_found("Slide", slide_id)
                        if method == "GET":
                            return response(slide)
                        if method == "PATCH":
                            return update_record("slides", slide_id, body(req))
                        if method == "DELETE":
                            storage.delete("slides", slide_id)
                            return func.HttpResponse(status_code=204)

    if path == ["exports"] and method == "POST":
        payload = body(req)
        for key, entity in {"playbookId": "playbooks", "gamePlanId": "gamePlans", "playId": "plays", "scoutPlayId": "scoutPlays"}.items():
            if payload.get(key):
                referenced = storage.get(entity, payload[key])
                if not referenced or not accounts.belongs(referenced, workspace):
                    return forbidden()
        record = {**payload, "id": str(uuid4()), "ownerId": owner_id, "workspaceId": workspace["id"], "status": "queued", "createdAt": now()}
        return response(storage.save("exports", record), 202)

    if len(path) == 2 and path[0] == "exports" and method == "GET":
        record = storage.get("exports", path[1])
        if not record:
            return not_found("Export", path[1])
        return response(record) if accounts.belongs(record, workspace) else forbidden()

    return response({"error": {"code": "NOT_FOUND", "message": "Route not found"}}, 404)
