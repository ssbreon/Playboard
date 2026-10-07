import calendar
import copy
import base64
import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from urllib.parse import quote, urlparse
from uuid import uuid4


LIMITS = {"playbooks": 100, "gamePlans": 100, "plays": 5000, "scoutPlays": 5000}
PRICES = {"individual": {"month": 999, "year": 9990}, "team": {"month": 2999, "year": 29990}}
DEFAULT_PREFERENCES = {"theme": "color", "fieldOrientation": "High School", "timezone": "UTC"}


class AccountError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.status = status


def timestamp():
    return datetime.now(timezone.utc)


def parse_date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def add_months(value, count):
    month_index = value.year * 12 + value.month - 1 + count
    year, month = divmod(month_index, 12)
    month += 1
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def personal_id(user_id):
    return "individual-" + hashlib.sha256(user_id.encode()).hexdigest()[:32]


def membership_id(user_id, workspace_id):
    return hashlib.sha256(f"{user_id}:{workspace_id}".encode()).hexdigest()


def is_mock():
    return os.getenv("BILLING_MODE", "mock" if os.getenv("AUTH_MODE") == "development" else "paddle") == "mock"


def validate_environment(endpoint=None):
    from urllib.parse import urlparse

    development = os.getenv("AUTH_MODE") == "development"
    deployed = bool(os.getenv("WEBSITE_SITE_NAME") or os.getenv("WEBSITE_INSTANCE_ID"))
    environment = os.getenv("APP_ENVIRONMENT", "local" if development and not deployed else "production")
    if (development or is_mock()) and (deployed or environment not in {"local", "test"}):
        raise RuntimeError("Development authentication and mock billing are restricted to local/test runtimes")
    if is_mock() and (not development or (endpoint and urlparse(endpoint).hostname not in {"localhost", "127.0.0.1", "::1", "host.docker.internal"})):
        raise RuntimeError("Mock billing requires development authentication and isolated local storage")


def new_subscription(kind, fixture=False):
    current = timestamp()
    return {
        "status": "active" if fixture else "trialing",
        "interval": "year" if fixture else None,
        "source": "development_fixture" if fixture else "trial",
        "periodEndsAt": add_months(current, 12).isoformat() if fixture else None,
        "trialStartedAt": None,
        "trialEndsAt": None,
        "cancelAtPeriodEnd": False,
        "kind": kind,
    }


def ensure_user(storage, identity):
    user_id = identity["userId"]
    profile = storage.get("profiles", user_id)
    if profile is None:
        profile = storage.save("profiles", {
            "id": user_id, "name": identity["name"], "email": identity.get("email", ""),
            "coachingTitle": "", "preferences": dict(DEFAULT_PREFERENCES),
        })
    workspace_id = personal_id(user_id)
    fixture = is_mock() and user_id == os.getenv("DEV_USER_ID", "local-coach")
    if storage.get("workspaces", workspace_id) is None:
        storage.save("workspaces", {
            "id": workspace_id, "name": "Individual", "kind": "individual", "ownerId": user_id,
            "defaults": {}, "subscription": new_subscription("individual", fixture),
            "createdAt": timestamp().isoformat(),
        })
    if storage.get("memberships", membership_id(user_id, workspace_id)) is None:
        storage.save("memberships", {"id": membership_id(user_id, workspace_id), "userId": user_id, "workspaceId": workspace_id, "role": "owner"})
    if fixture:
        team_id = "local-team-" + hashlib.sha256(user_id.encode()).hexdigest()[:24]
        if storage.get("workspaces", team_id) is None:
            storage.save("workspaces", {
                "id": team_id, "name": "Local Team", "kind": "team", "ownerId": user_id,
                "defaults": {}, "subscription": new_subscription("team", True), "createdAt": timestamp().isoformat(),
            })
            storage.save("memberships", {"id": membership_id(user_id, team_id), "userId": user_id, "workspaceId": team_id, "role": "owner"})
    return profile


def accessible(storage, user_id):
    result = []
    for member in storage.list("memberships"):
        if member["userId"] == user_id:
            workspace = storage.get("workspaces", member["workspaceId"])
            if workspace:
                result.append(summary(storage, workspace, member["role"]))
    return sorted(result, key=lambda workspace: (workspace["kind"] != "individual", workspace["name"]))


def select_workspace(storage, identity, requested=None):
    workspace_id = requested or personal_id(identity["userId"])
    member = storage.get("memberships", membership_id(identity["userId"], workspace_id))
    workspace = copy.deepcopy(storage.get("workspaces", workspace_id))
    if member is None or workspace is None:
        raise AccountError("FORBIDDEN", "You do not have access to this workspace", 403)
    if workspace["subscription"].get("source") == "development_fixture" and not is_mock():
        raise AccountError("FORBIDDEN", "Local fixture access is unavailable in this billing mode", 403)
    return workspace, member["role"]


def can_edit(workspace):
    subscription = workspace["subscription"]
    current = timestamp()
    if subscription["status"] == "trialing":
        end = parse_date(subscription.get("trialEndsAt"))
        return end is not None and current < end
    if subscription["status"] == "active":
        end = parse_date(subscription.get("periodEndsAt"))
        return end is not None and current < end
    if subscription["status"] == "past_due":
        failure = parse_date(subscription.get("paymentFailedAt"))
        return failure is not None and current < failure + timedelta(days=7)
    return False


def retention_deadline(workspace):
    if can_edit(workspace):
        return None
    subscription = workspace["subscription"]
    end = parse_date(subscription.get("readOnlySince") or subscription.get("trialEndsAt") or subscription.get("periodEndsAt"))
    if subscription["status"] == "past_due" and subscription.get("paymentFailedAt"):
        end = parse_date(subscription["paymentFailedAt"]) + timedelta(days=7)
    return add_months(end, 18) if end else None


def can_read(workspace):
    deadline = retention_deadline(workspace)
    return deadline is None or timestamp() < deadline


def require_write(workspace, role, action="edit"):
    if not can_edit(workspace):
        raise AccountError("SUBSCRIPTION_READ_ONLY", "This workspace is read-only until its subscription is active", 403)
    if action in {"delete", "team"} and role not in {"owner", "admin"}:
        raise AccountError("FORBIDDEN", "This action requires an Admin or Owner", 403)
    if action == "billing" and role != "owner":
        raise AccountError("FORBIDDEN", "Only the subscription Owner may manage billing", 403)


def belongs(record, workspace):
    if record.get("workspaceId"):
        return record["workspaceId"] == workspace["id"]
    return workspace["kind"] == "individual" and record.get("ownerId") == workspace["ownerId"]


def summary(storage, workspace, role):
    subscription = dict(workspace["subscription"])
    writable = can_edit(workspace)
    if not writable and (subscription["status"] in {"active", "past_due"} or (subscription["status"] == "trialing" and subscription.get("trialStartedAt"))):
        subscription["status"] = "expired"
    public = {"id": workspace["id"], "name": workspace["name"], "kind": workspace["kind"], "role": role,
              "defaults": workspace.get("defaults", {}), "subscription": subscription,
              "capabilities": {"edit": writable, "delete": writable and role in {"owner", "admin"},
                               "manageTeam": writable and workspace["kind"] == "team" and role in {"owner", "admin"}, "billing": role == "owner"}}
    public["usage"] = {entity: len(storage.list(entity, workspace_id=workspace["id"])) for entity in LIMITS}
    public["limits"] = dict(LIMITS)
    public["seatLimit"] = 10 if workspace["kind"] == "team" else 1
    public["seatsUsed"] = sum(member["workspaceId"] == workspace["id"] for member in storage.list("memberships")) + len(pending_invites(storage, workspace["id"]))
    public["prices"] = dict(PRICES[workspace["kind"]])
    deadline = retention_deadline(workspace)
    public["deletionDueAt"] = deadline.isoformat() if deadline else None
    return public


def enter_workspace(storage, workspace):
    subscription = workspace["subscription"]
    if subscription["status"] == "trialing" and not subscription.get("trialStartedAt"):
        current = timestamp()
        subscription["trialStartedAt"] = current.isoformat()
        subscription["trialEndsAt"] = (current + timedelta(days=14)).isoformat()
        storage.save("workspaces", workspace)


def validate_preferences(payload):
    allowed = {}
    if "theme" in payload:
        if payload["theme"] not in {"color", "printerFriendly", "blackboard"}:
            raise AccountError("VALIDATION_ERROR", "Unknown diagram theme")
        allowed["theme"] = payload["theme"]
    if "fieldOrientation" in payload:
        if payload["fieldOrientation"] not in {"High School", "NCAA", "NFL"}:
            raise AccountError("VALIDATION_ERROR", "Unknown field orientation")
        allowed["fieldOrientation"] = payload["fieldOrientation"]
    if "timezone" in payload:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            if payload["timezone"] != "UTC":
                ZoneInfo(payload["timezone"])
        except (ZoneInfoNotFoundError, TypeError, ValueError):
            raise AccountError("VALIDATION_ERROR", "Unknown timezone") from None
        allowed["timezone"] = payload["timezone"]
    return allowed


def pending_invites(storage, workspace_id):
    return [invite for invite in storage.list("invitations") if invite["workspaceId"] == workspace_id
            and invite["status"] == "pending" and timestamp() < parse_date(invite["expiresAt"])]


def outbox_cipher():
    from cryptography.fernet import Fernet
    key = os.getenv("EMAIL_OUTBOX_KEY")
    if not key and os.getenv("AUTH_MODE") == "development":
        secret = os.getenv("DEV_AUTH_SECRET", "")
        if secret:
            key = base64.urlsafe_b64encode(hashlib.sha256(("local-email:" + secret).encode()).digest()).decode()
    if not key:
        raise AccountError("EMAIL_NOT_CONFIGURED", "Encrypted email outbox is not configured", 503)
    return Fernet(key.encode())


def queue_invitation(storage, identity, workspace, email, role, existing=None):
    cipher = outbox_cipher()
    origin = os.getenv("APP_PUBLIC_URL", "http://localhost:5173" if os.getenv("AUTH_MODE") == "development" else "")
    parsed = urlparse(origin)
    if not parsed.netloc or (parsed.scheme != "https" and not (os.getenv("AUTH_MODE") == "development" and parsed.hostname in {"localhost", "127.0.0.1"})):
        raise AccountError("EMAIL_NOT_CONFIGURED", "A trusted application URL is required", 503)
    current = timestamp()
    token = secrets.token_urlsafe(32)
    invite = {"id": existing["id"] if existing else str(uuid4()), "workspaceId": workspace["id"],
              "email": email, "role": role, "status": "pending", "invitedBy": identity["userId"],
              "createdAt": existing["createdAt"] if existing else current.isoformat(), "lastSentAt": current.isoformat(),
              "expiresAt": (current + timedelta(days=7)).isoformat(), "tokenHash": hashlib.sha256(token.encode()).hexdigest()}
    payload = {"to": email, "subject": f"Invitation to {workspace['name']}", "teamName": workspace["name"],
               "inviterName": identity["name"], "role": role, "expiresAt": invite["expiresAt"],
               "acceptUrl": origin.rstrip("/") + "/#invite=" + quote(token)}
    if existing:
        for message in storage.list("outbox"):
            if message.get("invitationId") == existing["id"]:
                storage.delete("outbox", message["id"])
    storage.save("invitations", invite)
    storage.save("outbox", {"id": str(uuid4()), "workspaceId": workspace["id"], "invitationId": invite["id"],
                           "status": "captured" if os.getenv("AUTH_MODE") == "development" else "pending",
                           "createdAt": current.isoformat(), "payload": cipher.encrypt(json.dumps(payload).encode()).decode()})
    return {key: value for key, value in invite.items() if key != "tokenHash"}


def accept_invitation(storage, identity, payload):
    token = payload.get("token")
    if not isinstance(token, str) or not 20 <= len(token) <= 200:
        raise AccountError("INVALID_INVITATION", "Invitation link is invalid", 400)
    digest = hashlib.sha256(token.encode()).hexdigest()
    invite = next((item for item in storage.list("invitations") if secrets.compare_digest(item.get("tokenHash", ""), digest)), None)
    if not invite:
        raise AccountError("INVALID_INVITATION", "Invitation link is invalid or has been replaced", 400)
    with storage.guard(invite["workspaceId"]):
        invite = storage.get("invitations", invite["id"])
        if not secrets.compare_digest(invite.get("tokenHash", ""), digest) or invite["status"] != "pending" or timestamp() >= parse_date(invite["expiresAt"]):
            raise AccountError("INVITATION_EXPIRED", "Invitation has expired, been revoked, or already been used", 409)
        if not identity.get("emailVerified") or identity.get("email", "").casefold() != invite["email"].casefold():
            raise AccountError("INVITED_EMAIL_REQUIRED", "Sign in with the verified email address that received this invitation", 403)
        workspace = storage.get("workspaces", invite["workspaceId"])
        if not workspace or not can_edit(workspace):
            raise AccountError("SUBSCRIPTION_READ_ONLY", "The Team subscription must be active to accept invitations", 403)
        for member in storage.list("memberships"):
            if member["userId"] == identity["userId"]:
                other = storage.get("workspaces", member["workspaceId"])
                if other and other["kind"] == "team":
                    raise AccountError("TEAM_MEMBERSHIP_EXISTS", "You already belong to a Team", 409)
        active_count = sum(member["workspaceId"] == workspace["id"] for member in storage.list("memberships"))
        if active_count >= 10:
            raise AccountError("SEAT_LIMIT_REACHED", "This Team has no available seats", 409)
        storage.save("memberships", {"id": membership_id(identity["userId"], workspace["id"]),
                                     "userId": identity["userId"], "workspaceId": workspace["id"], "role": invite["role"]})
        invite["status"] = "accepted"
        invite["acceptedAt"] = timestamp().isoformat()
        invite["tokenHash"] = ""
        storage.save("invitations", invite)
        for message in storage.list("outbox"):
            if message.get("invitationId") == invite["id"]:
                storage.delete("outbox", message["id"])
        return summary(storage, workspace, invite["role"]), 200


def account_route(storage, identity, workspace, role, path, method, payload):
    user_id = identity["userId"]
    profile = copy.deepcopy(storage.get("profiles", user_id))
    if path == ["invitations", "accept"] and method == "POST":
        return accept_invitation(storage, identity, payload)
    if path[:2] == ["workspace", "invitations"]:
        if workspace["kind"] != "team" or role not in {"owner", "admin"}:
            raise AccountError("FORBIDDEN", "Only Team Admins may manage invitations", 403)
        if len(path) == 2 and method == "GET":
            items = []
            for invite in storage.list("invitations"):
                if invite["workspaceId"] != workspace["id"]:
                    continue
                item = {key: value for key, value in invite.items() if key != "tokenHash"}
                if item["status"] == "pending" and timestamp() >= parse_date(item["expiresAt"]):
                    item["status"] = "expired"
                if os.getenv("AUTH_MODE") == "development" and item["status"] == "pending":
                    message = next((entry for entry in storage.list("outbox") if entry.get("invitationId") == invite["id"]), None)
                    if message:
                        from cryptography.fernet import InvalidToken
                        try:
                            item["capturedUrl"] = json.loads(outbox_cipher().decrypt(message["payload"].encode()))["acceptUrl"]
                        except InvalidToken:
                            item["captureUnavailable"] = True
                items.append(item)
            return {"items": items, "deliveryMode": "capture" if os.getenv("AUTH_MODE") == "development" else "pending"}, 200
        require_write(workspace, role, "team")
        if len(path) == 2 and method == "POST":
            email = payload.get("email", "")
            if not isinstance(email, str) or len(email) > 254:
                raise AccountError("VALIDATION_ERROR", "A valid email address is required")
            email = email.strip()
            display, address = parseaddr(email)
            if display or address != email or "@" not in email or any(character.isspace() for character in email) or "." not in email.split("@")[-1]:
                raise AccountError("VALIDATION_ERROR", "A valid email address is required")
            assigned_role = payload.get("role", "coach")
            if assigned_role not in {"coach", "admin"}:
                raise AccountError("VALIDATION_ERROR", "Invitation role must be Coach or Admin")
            pending = pending_invites(storage, workspace["id"])
            if any(invite["email"].casefold() == email.casefold() for invite in pending):
                raise AccountError("INVITATION_EXISTS", "An invitation for this email is already pending", 409)
            members = [member for member in storage.list("memberships") if member["workspaceId"] == workspace["id"]]
            if any((storage.get("profiles", member["userId"]) or {}).get("email", "").casefold() == email.casefold() for member in members):
                raise AccountError("MEMBER_EXISTS", "This email already belongs to the Team", 409)
            if len(members) + len(pending) >= 10:
                raise AccountError("SEAT_LIMIT_REACHED", "This Team has reached its ten-seat limit", 409)
            return queue_invitation(storage, identity, workspace, email, assigned_role), 201
        if len(path) == 3:
            invite = storage.get("invitations", path[2])
            if not invite or invite["workspaceId"] != workspace["id"]:
                raise AccountError("NOT_FOUND", "Invitation was not found", 404)
            if method == "DELETE":
                if invite["status"] != "pending":
                    raise AccountError("INVITATION_CLOSED", "Invitation is no longer pending", 409)
                invite.update({"status": "revoked", "tokenHash": ""})
                storage.save("invitations", invite)
                for message in storage.list("outbox"):
                    if message.get("invitationId") == invite["id"]:
                        storage.delete("outbox", message["id"])
                return None, 204
        if len(path) == 4 and path[3] == "resend" and method == "POST":
            invite = storage.get("invitations", path[2])
            if not invite or invite["workspaceId"] != workspace["id"] or invite["status"] != "pending":
                raise AccountError("INVITATION_CLOSED", "Invitation is no longer pending", 409)
            if timestamp() - parse_date(invite["lastSentAt"]) < timedelta(seconds=60):
                raise AccountError("RESEND_THROTTLED", "Wait one minute before resending", 429)
            if timestamp() >= parse_date(invite["expiresAt"]) and len(pending_invites(storage, workspace["id"])) + sum(member["workspaceId"] == workspace["id"] for member in storage.list("memberships")) >= 10:
                raise AccountError("SEAT_LIMIT_REACHED", "This Team has no available seats", 409)
            return queue_invitation(storage, identity, workspace, invite["email"], invite["role"], invite), 200
    if path == ["me"]:
        if method == "GET":
            return {**profile, "userId": user_id, "roles": [role], "workspaces": accessible(storage, user_id)}, 200
        if method == "PATCH":
            for key in ("name", "coachingTitle"):
                if key in payload:
                    value = payload[key]
                    if not isinstance(value, str) or len(value.strip()) > 120 or (key == "name" and not value.strip()):
                        raise AccountError("VALIDATION_ERROR", f"Invalid {key}")
                    profile[key] = value.strip()
            return storage.save("profiles", profile), 200
    if path == ["me", "preferences"] and method == "PATCH":
        profile["preferences"].update(validate_preferences(payload))
        return storage.save("profiles", profile)["preferences"], 200
    if path == ["workspaces"] and method == "GET":
        return {"items": accessible(storage, user_id)}, 200
    if path == ["workspace"]:
        if method == "GET":
            enter_workspace(storage, workspace)
            return summary(storage, workspace, role), 200
        if method == "PATCH":
            require_write(workspace, role, "team")
            if "name" in payload and workspace["kind"] == "team":
                if not isinstance(payload["name"], str) or not 1 <= len(payload["name"].strip()) <= 120:
                    raise AccountError("VALIDATION_ERROR", "Team name is required (maximum 120 characters)")
                workspace["name"] = payload["name"].strip()
            if "defaults" in payload:
                workspace["defaults"].update(validate_preferences(payload["defaults"]))
            storage.save("workspaces", workspace)
            return summary(storage, workspace, role), 200
    if path == ["workspace", "members"] and method == "GET":
        members = []
        for member in storage.list("memberships"):
            if member["workspaceId"] == workspace["id"]:
                member_profile = storage.get("profiles", member["userId"]) or {}
                members.append({"userId": member["userId"], "name": member_profile.get("name", "Coach"), "role": member["role"]})
        return {"items": members}, 200
    if len(path) == 3 and path[:2] == ["workspace", "members"]:
        require_write(workspace, role, "team")
        member = storage.get("memberships", membership_id(path[2], workspace["id"]))
        if not member:
            raise AccountError("NOT_FOUND", "Member was not found", 404)
        if member["role"] == "owner":
            raise AccountError("OWNER_TRANSFER_REQUIRED", "Transfer ownership before removing or demoting the Owner", 409)
        if method == "PATCH":
            if payload.get("role") not in {"coach", "admin"}:
                raise AccountError("VALIDATION_ERROR", "Role must be Coach or Admin")
            member["role"] = payload["role"]
            storage.save("memberships", member)
            return {"userId": member["userId"], "role": member["role"]}, 200
        if method == "DELETE":
            storage.delete("memberships", member["id"])
            return None, 204
    if path == ["workspace", "billing"] and method == "GET":
        if role != "owner":
            return {"managedByTeam": True, "status": summary(storage, workspace, role)["subscription"]["status"]}, 200
        return {"subscription": summary(storage, workspace, role)["subscription"], "prices": PRICES[workspace["kind"]],
                "taxIncluded": True, "provider": "mock" if is_mock() else "paddle", "connected": False}, 200
    if path[:2] == ["workspace", "billing"] and method == "POST":
        if role != "owner":
            raise AccountError("FORBIDDEN", "Only the subscription Owner may manage billing", 403)
        raise AccountError("BILLING_NOT_CONNECTED", "Paddle checkout and portal are not configured for this workspace", 503)
    return None