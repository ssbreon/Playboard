import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import Mock, patch
from urllib.parse import urlparse, parse_qs

os.environ["AUTH_MODE"] = "development"
os.environ["DEV_AUTH_SECRET"] = "test-secret"
os.environ["DEV_USER_ID"] = "local-coach"
os.environ["BILLING_MODE"] = "mock"
os.environ["APP_ENVIRONMENT"] = "local"
os.environ.pop("COSMOS_ENDPOINT", None)
os.environ.pop("COSMOSDB_ENDPOINT", None)

import function_app


class FakeRequest:
    def __init__(self, method, path, user_id=None, payload=None):
        self.method = method
        self.route_params = {"path": path}
        self.params = {}
        self.headers = {}
        self.payload = payload
        if user_id:
            self.headers = {
                "X-Dev-User": user_id,
                "X-Dev-Auth-Secret": "test-secret",
            }

    def get_json(self):
        return self.payload


def call_api(method, path, user_id=None, payload=None, workspace_id=None):
    request = FakeRequest(method, path, user_id, payload)
    if workspace_id:
        request.headers["X-Workspace-Id"] = workspace_id
    return function_app.api(request)


def response_json(response):
    return json.loads(response.get_body())


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        function_app.storage = function_app.Storage()

    def test_content_limits_load_from_app_settings(self):
        defaults = {"playbooks": 100, "gamePlans": 100, "plays": 5000, "scoutPlays": 5000}
        self.assertEqual(function_app.accounts.load_limits({}), defaults)
        self.assertEqual(function_app.accounts.load_limits({
            "CONTENT_LIMIT_PLAYBOOKS": "12",
            "CONTENT_LIMIT_GAME_PLANS": "34",
            "CONTENT_LIMIT_PLAYS": "560",
            "CONTENT_LIMIT_SCOUT_PLAYS": "780",
        }), {"playbooks": 12, "gamePlans": 34, "plays": 560, "scoutPlays": 780})
        self.assertEqual(function_app.accounts.load_limits({"CONTENT_LIMIT_PLAYBOOKS": "0"})["playbooks"], 0)
        for invalid in ("many", "-1"):
            with self.subTest(value=invalid), self.assertRaisesRegex(ValueError, "CONTENT_LIMIT_PLAYBOOKS"):
                function_app.accounts.load_limits({"CONTENT_LIMIT_PLAYBOOKS": invalid})

    def test_archive_restore_preserves_content_and_delete_is_permanent(self):
        for collection_path, child_path in (("playbooks", "plays"), ("game-plans", "scout-plays")):
            collection = response_json(call_api("POST", collection_path, "local-coach", {"name": "Collection"}))
            children_path = f"{collection_path}/{collection['id']}/{child_path}"
            child = response_json(call_api("POST", children_path, "local-coach", {"name": "Play", "markers": [{"id": "marker", "x": 20}]}))
            for path, record in ((children_path, child), (collection_path, collection)):
                with self.subTest(path=path):
                    item_path = f"{path}/{record['id']}"
                    self.assertEqual(record["recordStatus"], "Active")
                    for status in ("Archived", "Active", "Archived"):
                        updated = call_api("PATCH", item_path, "local-coach", {"recordStatus": status})
                        self.assertEqual(updated.status_code, 200)
                        stored = response_json(call_api("GET", item_path, "local-coach"))
                        self.assertEqual(stored["recordStatus"], status)
                        for key in ("name", "ownerId", "createdAt", "parentId", "markers"):
                            if key in record:
                                self.assertEqual(stored[key], record[key])
                        listed = response_json(call_api("GET", path, "local-coach"))["items"]
                        self.assertEqual(next(item for item in listed if item["id"] == record["id"])["recordStatus"], status)
                    self.assertEqual(call_api("DELETE", item_path, "local-coach").status_code, 204)
                    self.assertEqual(call_api("GET", item_path, "local-coach").status_code, 404)

    def test_record_status_defaults_legacy_records_and_rejects_invalid_values(self):
        for path in ("playbooks", "game-plans"):
            created = response_json(call_api("POST", path, "local-coach", {"name": "Legacy"}))
            entity_type = "playbooks" if path == "playbooks" else "gamePlans"
            function_app.storage.memory[entity_type][created["id"]].pop("recordStatus")
            item_path = f"{path}/{created['id']}"
            self.assertEqual(response_json(call_api("GET", item_path, "local-coach"))["recordStatus"], "Active")
            self.assertEqual(response_json(call_api("GET", path, "local-coach"))["items"][0]["recordStatus"], "Active")
            for invalid in (None, "Deleted", False, [], {}):
                self.assertEqual(call_api("PATCH", item_path, "local-coach", {"recordStatus": invalid}).status_code, 400)
                self.assertEqual(call_api("POST", path, "local-coach", {"name": "Invalid", "recordStatus": invalid}).status_code, 400)
            self.assertEqual(response_json(call_api("GET", item_path, "local-coach"))["recordStatus"], "Active")

    def test_archiving_collection_preserves_descendants_and_usage(self):
        book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Book"}))
        children_path = f"playbooks/{book['id']}/plays"
        play = response_json(call_api("POST", children_path, "local-coach", {"name": "Play"}))
        slides_path = f"{children_path}/{play['id']}/slides"
        slide = response_json(call_api("POST", slides_path, "local-coach", {"name": "Adjustment"}))
        usage = response_json(call_api("GET", "workspace", "local-coach"))["usage"]
        for path in (f"playbooks/{book['id']}", f"{children_path}/{play['id']}"):
            self.assertEqual(call_api("PATCH", path, "local-coach", {"recordStatus": "Archived"}).status_code, 200)
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach"))["usage"], usage)
        self.assertEqual(call_api("GET", f"{slides_path}/{slide['id']}", "local-coach").status_code, 200)
        self.assertEqual(call_api("DELETE", f"playbooks/{book['id']}", "local-coach").status_code, 204)
        self.assertIsNone(function_app.storage.get("plays", play["id"]))
        self.assertIsNone(function_app.storage.get("slides", slide["id"]))

    def test_archive_restore_enforces_workspace_permissions(self):
        team = self.team_fixture()
        book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Team"}, team["id"]))
        path = f"playbooks/{book['id']}"
        self.assertEqual(call_api("PATCH", path, "coach-b", {"recordStatus": "Archived"}, team["id"]).status_code, 200)
        self.assertEqual(call_api("PATCH", path, "outsider", {"recordStatus": "Active"}, team["id"]).status_code, 403)
        workspace = function_app.storage.get("workspaces", team["id"])
        workspace["subscription"]["periodEndsAt"] = (function_app.accounts.timestamp() - timedelta(seconds=1)).isoformat()
        self.assertEqual(call_api("PATCH", path, "coach-b", {"recordStatus": "Active"}, team["id"]).status_code, 403)
        self.assertEqual(response_json(call_api("GET", path, "local-coach", workspace_id=team["id"]))["recordStatus"], "Archived")

    def test_local_owner_has_independent_annual_workspaces(self):
        user = response_json(call_api("GET", "me", "local-coach"))
        self.assertEqual(len(user["workspaces"]), 2)
        self.assertEqual({item["kind"] for item in user["workspaces"]}, {"individual", "team"})
        for workspace in user["workspaces"]:
            self.assertEqual(workspace["role"], "owner")
            self.assertEqual(workspace["subscription"]["interval"], "year")
            self.assertEqual(workspace["subscription"]["source"], "development_fixture")

    def test_switching_workspace_preserves_private_content(self):
        user = response_json(call_api("GET", "me", "local-coach"))
        individual = next(item for item in user["workspaces"] if item["kind"] == "individual")
        team = next(item for item in user["workspaces"] if item["kind"] == "team")
        book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Private"}))
        self.assertEqual(call_api("GET", f"playbooks/{book['id']}", "local-coach", workspace_id=team["id"]).status_code, 403)
        self.assertEqual(response_json(call_api("GET", "playbooks", "local-coach", workspace_id=team["id"]))["items"], [])
        self.assertEqual(call_api("GET", f"playbooks/{book['id']}", "local-coach", workspace_id=individual["id"]).status_code, 200)

    def test_unrelated_dev_identity_cannot_select_owner_team(self):
        user = response_json(call_api("GET", "me", "local-coach"))
        team = next(item for item in user["workspaces"] if item["kind"] == "team")
        self.assertEqual(call_api("GET", "playbooks", "coach-b", workspace_id=team["id"]).status_code, 403)

    def team_fixture(self, role="coach"):
        user = response_json(call_api("GET", "me", "local-coach"))
        team = next(item for item in user["workspaces"] if item["kind"] == "team")
        call_api("GET", "me", "coach-b")
        function_app.storage.save("memberships", {
            "id": function_app.accounts.membership_id("coach-b", team["id"]),
            "userId": "coach-b", "workspaceId": team["id"], "role": role,
        })
        return team

    def test_staff_members_include_coaching_titles(self):
        team = self.team_fixture()
        updated = call_api("PATCH", "me", "coach-b", {"coachingTitle": "Defensive Coordinator"})
        self.assertEqual(updated.status_code, 200)
        response = call_api("GET", "workspace/members", "local-coach", workspace_id=team["id"])
        self.assertEqual(response.status_code, 200)
        members = {member["userId"]: member for member in response_json(response)["items"]}
        self.assertEqual(members["coach-b"]["coachingTitle"], "Defensive Coordinator")
        self.assertEqual(members["local-coach"]["coachingTitle"], "")
        profile = function_app.storage.get("profiles", "coach-b")
        profile.pop("coachingTitle")
        function_app.storage.save("profiles", profile)
        response = call_api("GET", "workspace/members", "local-coach", workspace_id=team["id"])
        members = {member["userId"]: member for member in response_json(response)["items"]}
        self.assertEqual(members["coach-b"]["coachingTitle"], "")

    def test_coach_edits_shared_content_but_cannot_delete(self):
        team = self.team_fixture()
        created = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Team"}, team["id"]))
        path = f"playbooks/{created['id']}"
        self.assertEqual(call_api("PATCH", path, "coach-b", {"name": "Edited"}, team["id"]).status_code, 200)
        self.assertEqual(call_api("DELETE", path, "coach-b", workspace_id=team["id"]).status_code, 403)
        self.assertEqual(len(response_json(call_api("GET", "playbooks", "coach-b", workspace_id=team["id"]))["items"]), 1)

    def test_admin_can_delete_and_removal_preserves_contributions(self):
        team = self.team_fixture("admin")
        created = response_json(call_api("POST", "playbooks", "coach-b", {"name": "Contribution"}, team["id"]))
        self.assertEqual(call_api("DELETE", "workspace/members/coach-b", "local-coach", workspace_id=team["id"]).status_code, 204)
        self.assertEqual(call_api("GET", f"playbooks/{created['id']}", "coach-b", workspace_id=team["id"]).status_code, 403)
        self.assertEqual(call_api("GET", f"playbooks/{created['id']}", "local-coach", workspace_id=team["id"]).status_code, 200)
        self.assertEqual(call_api("GET", "playbooks", "coach-b").status_code, 200)

    def test_workspace_and_provenance_cannot_be_forged(self):
        team = self.team_fixture()
        created = response_json(call_api("POST", "playbooks", "coach-b", {"name": "Shared", "workspaceId": "forged", "ownerId": "forged"}, team["id"]))
        self.assertEqual(created["workspaceId"], team["id"])
        self.assertEqual(created["ownerId"], "coach-b")
        updated = response_json(call_api("PATCH", f"playbooks/{created['id']}", "coach-b", {"workspaceId": "forged", "createdBy": "forged", "ownerId": "forged"}, team["id"]))
        self.assertEqual(updated["workspaceId"], team["id"])
        self.assertEqual(updated["createdBy"], "coach-b")

    def test_read_only_workspace_blocks_content_changes_but_not_exports(self):
        team = self.team_fixture()
        created = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Team"}, team["id"]))
        workspace = function_app.storage.get("workspaces", team["id"])
        workspace["subscription"]["periodEndsAt"] = (function_app.accounts.timestamp() - timedelta(seconds=1)).isoformat()
        function_app.storage.save("workspaces", workspace)
        for method in ("PATCH", "DELETE"):
            self.assertEqual(call_api(method, f"playbooks/{created['id']}", "local-coach", {"name": "Blocked"}, team["id"]).status_code, 403)
        self.assertEqual(call_api("POST", "playbooks", "local-coach", {"name": "Blocked"}, team["id"]).status_code, 403)
        self.assertEqual(call_api("GET", f"playbooks/{created['id']}", "coach-b", workspace_id=team["id"]).status_code, 200)
        self.assertEqual(call_api("POST", "exports", "coach-b", {"playbookId": created["id"]}, team["id"]).status_code, 202)
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach", workspace_id=team["id"]))["subscription"]["status"], "expired")

    def test_last_quota_slot_is_shared_and_concurrency_safe(self):
        team = self.team_fixture()
        for index in range(99):
            function_app.storage.save("playbooks", {"id": f"quota-{index}", "workspaceId": team["id"], "ownerId": "local-coach", "name": "Book"})
        def create_book(user):
            return call_api("POST", "playbooks", user, {"name": "Last slot"}, team["id"]).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create_book, ["local-coach", "coach-b"]))
        self.assertEqual(sorted(results), [201, 409])
        self.assertEqual(call_api("POST", "playbooks", "local-coach", {"name": "Private allowance"}).status_code, 201)

    def test_caps_apply_to_both_collection_and_play_types(self):
        call_api("GET", "me", "local-coach")
        with patch.dict(function_app.accounts.LIMITS, {"gamePlans": 1, "plays": 1, "scoutPlays": 1}):
            book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Book"}))
            plan = response_json(call_api("POST", "game-plans", "local-coach", {"name": "Plan"}))
            self.assertEqual(call_api("POST", "game-plans", "local-coach", {"name": "Overflow"}).status_code, 409)
            for path in (f"playbooks/{book['id']}/plays", f"game-plans/{plan['id']}/scout-plays"):
                self.assertEqual(call_api("POST", path, "local-coach", {"name": "First"}).status_code, 201)
                self.assertEqual(call_api("POST", path, "local-coach", {"name": "Overflow"}).status_code, 409)

    def test_collection_deletion_removes_descendants_and_frees_quota(self):
        book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Book"}))
        play = response_json(call_api("POST", f"playbooks/{book['id']}/plays", "local-coach", {"name": "Play"}))
        slide = response_json(call_api("POST", f"playbooks/{book['id']}/plays/{play['id']}/slides", "local-coach", {}))
        self.assertEqual(call_api("DELETE", f"playbooks/{book['id']}", "local-coach").status_code, 204)
        self.assertIsNone(function_app.storage.get("plays", play["id"]))
        self.assertIsNone(function_app.storage.get("slides", slide["id"]))

    def test_trial_starts_once_on_entry_and_expires(self):
        user = response_json(call_api("GET", "me", "trial-coach"))
        self.assertIsNone(user["workspaces"][0]["subscription"]["trialStartedAt"])
        first = response_json(call_api("GET", "workspace", "trial-coach"))
        second = response_json(call_api("GET", "workspace", "trial-coach"))
        self.assertEqual(first["subscription"]["trialEndsAt"], second["subscription"]["trialEndsAt"])
        workspace = function_app.storage.get("workspaces", first["id"])
        workspace["subscription"]["trialEndsAt"] = (function_app.accounts.timestamp() - timedelta(seconds=1)).isoformat()
        self.assertEqual(call_api("POST", "playbooks", "trial-coach", {"name": "Blocked"}).status_code, 403)

    def test_owner_cannot_be_demoted_or_removed(self):
        team = self.team_fixture()
        for method in ("PATCH", "DELETE"):
            self.assertEqual(call_api(method, "workspace/members/local-coach", "local-coach", {"role": "coach"}, team["id"]).status_code, 409)

    def test_local_fixture_is_not_reseeded_after_expiry(self):
        first = response_json(call_api("GET", "me", "local-coach"))
        workspace = function_app.storage.get("workspaces", first["workspaces"][0]["id"])
        workspace["subscription"]["periodEndsAt"] = "2020-01-01T00:00:00+00:00"
        call_api("GET", "me", "local-coach")
        self.assertEqual(workspace["subscription"]["periodEndsAt"], "2020-01-01T00:00:00+00:00")

    def test_mock_mode_rejects_remote_storage_and_production(self):
        with self.assertRaises(RuntimeError):
            function_app.accounts.validate_environment("https://example.documents.azure.com")
        with patch.dict(os.environ, {"APP_ENVIRONMENT": "production"}):
            with self.assertRaises(RuntimeError):
                function_app.accounts.validate_environment()

    def test_profile_cannot_change_email_role_or_subscription(self):
        call_api("GET", "me", "local-coach")
        result = response_json(call_api("PATCH", "me", "local-coach", {"name": "New name", "email": "forged@example.com", "role": "admin", "subscription": {"status": "active"}}))
        self.assertEqual(result["name"], "New name")
        self.assertNotEqual(result["email"], "forged@example.com")
        self.assertNotIn("role", result)
        self.assertNotIn("subscription", result)

    def invite_token(self, team_id, email):
        created = response_json(call_api("POST", "workspace/invitations", "local-coach", {"email": email}, team_id))
        invitation = response_json(call_api("GET", "workspace/invitations", "local-coach", workspace_id=team_id))["items"][-1]
        token = parse_qs(urlparse(invitation["capturedUrl"]).fragment)["invite"][0]
        return created, token

    def test_invitation_reserves_a_seat_and_acceptance_keeps_individual(self):
        team = self.team_fixture()
        identity = response_json(call_api("GET", "me", "coach+invite@example.com"))
        private_id = identity["workspaces"][0]["id"]
        invite, token = self.invite_token(team["id"], "coach+invite@example.com")
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach", workspace_id=team["id"]))["seatsUsed"], 3)
        self.assertEqual(call_api("POST", "invitations/accept", "wrong@example.com", {"token": token}).status_code, 403)
        self.assertEqual(call_api("POST", "invitations/accept", "coach+invite@example.com", {"token": token}).status_code, 200)
        workspaces = response_json(call_api("GET", "me", "coach+invite@example.com"))["workspaces"]
        self.assertEqual(len(workspaces), 2)
        self.assertIn(private_id, [item["id"] for item in workspaces])
        self.assertEqual(call_api("POST", "invitations/accept", "coach+invite@example.com", {"token": token}).status_code, 400)
        self.assertNotIn("tokenHash", invite)
        self.assertEqual(function_app.storage.list("outbox"), [])

    def test_revocation_and_expiry_release_reserved_seats(self):
        team = self.team_fixture()
        invite, token = self.invite_token(team["id"], "coach@example.com")
        self.assertEqual(call_api("DELETE", f"workspace/invitations/{invite['id']}", "local-coach", workspace_id=team["id"]).status_code, 204)
        self.assertEqual(call_api("POST", "invitations/accept", "coach@example.com", {"token": token}).status_code, 400)
        expired, token = self.invite_token(team["id"], "expired@example.com")
        stored = function_app.storage.get("invitations", expired["id"])
        stored["expiresAt"] = (function_app.accounts.timestamp() - timedelta(seconds=1)).isoformat()
        self.assertEqual(call_api("POST", "invitations/accept", "expired@example.com", {"token": token}).status_code, 409)
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach", workspace_id=team["id"]))["seatsUsed"], 2)

    def test_resend_invalidates_old_link_and_does_not_add_seat(self):
        team = self.team_fixture()
        invite, token = self.invite_token(team["id"], "coach@example.com")
        path = f"workspace/invitations/{invite['id']}/resend"
        self.assertEqual(call_api("POST", path, "local-coach", {}, team["id"]).status_code, 429)
        function_app.storage.get("invitations", invite["id"])["lastSentAt"] = (function_app.accounts.timestamp() - timedelta(minutes=2)).isoformat()
        self.assertEqual(call_api("POST", path, "local-coach", {}, team["id"]).status_code, 200)
        self.assertEqual(call_api("POST", "invitations/accept", "coach@example.com", {"token": token}).status_code, 400)
        self.assertEqual(len(function_app.storage.list("outbox")), 1)
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach", workspace_id=team["id"]))["seatsUsed"], 3)

    def test_last_invitation_seat_is_concurrency_safe(self):
        team = self.team_fixture()
        for index in range(7):
            self.invite_token(team["id"], f"coach{index}@example.com")
        def invite(email):
            return call_api("POST", "workspace/invitations", "local-coach", {"email": email}, team["id"]).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(invite, ["last1@example.com", "last2@example.com"]))
        self.assertEqual(sorted(results), [201, 409])

    def test_coaches_cannot_invite_or_view_captured_tokens(self):
        team = self.team_fixture()
        self.assertEqual(call_api("POST", "workspace/invitations", "coach-b", {"email": "coach@example.com"}, team["id"]).status_code, 403)
        self.assertEqual(call_api("GET", "workspace/invitations", "coach-b", workspace_id=team["id"]).status_code, 403)

    def test_outbox_does_not_store_plaintext_token(self):
        team = self.team_fixture()
        invite, token = self.invite_token(team["id"], "coach@example.com")
        self.assertNotIn(token, json.dumps(function_app.storage.memory))
        self.assertEqual(function_app.storage.get("invitations", invite["id"])["tokenHash"], function_app.accounts.hashlib.sha256(token.encode()).hexdigest())

    def test_retention_blocks_content_after_eighteen_months(self):
        user = response_json(call_api("GET", "me", "local-coach"))
        workspace = function_app.storage.get("workspaces", user["workspaces"][0]["id"])
        workspace["subscription"]["periodEndsAt"] = "2020-01-31T00:00:00+00:00"
        self.assertEqual(call_api("GET", "playbooks", "local-coach").status_code, 410)
        self.assertEqual(call_api("GET", "workspace", "local-coach").status_code, 200)
        self.assertEqual(response_json(call_api("GET", "workspace", "local-coach"))["deletionDueAt"], "2021-07-31T00:00:00+00:00")

    def test_expired_retention_does_not_block_other_workspace(self):
        user = response_json(call_api("GET", "me", "local-coach"))
        individual = next(item for item in user["workspaces"] if item["kind"] == "individual")
        team = next(item for item in user["workspaces"] if item["kind"] == "team")
        function_app.storage.get("workspaces", individual["id"])["subscription"]["periodEndsAt"] = "2020-01-01T00:00:00+00:00"
        self.assertEqual(call_api("GET", "playbooks", "local-coach", workspace_id=team["id"]).status_code, 200)

    def test_invalid_json_shapes_are_rejected(self):
        self.assertEqual(call_api("POST", "playbooks", "local-coach", ["not", "an", "object"]).status_code, 400)

    def test_preferences_use_supported_field_standards(self):
        result = call_api("PATCH", "me/preferences", "local-coach", {"theme": "printerFriendly", "fieldOrientation": "NCAA", "timezone": "America/New_York"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(response_json(result)["fieldOrientation"], "NCAA")
        self.assertEqual(call_api("PATCH", "me/preferences", "local-coach", {"fieldOrientation": "vertical"}).status_code, 400)

    def test_only_owner_can_start_billing_actions(self):
        team = self.team_fixture("admin")
        self.assertEqual(call_api("POST", "workspace/billing/checkout", "coach-b", {}, team["id"]).status_code, 403)
        self.assertEqual(call_api("POST", "workspace/billing/checkout", "local-coach", {}, team["id"]).status_code, 503)

    def test_storage_updates_use_etags_and_report_conflicts(self):
        store = function_app.Storage()
        store.container = Mock()
        changed = function_app.HttpResponseError("Changed")
        changed.status_code = 412
        store.container.replace_item.side_effect = changed
        with self.assertRaises(function_app.accounts.AccountError) as error:
            store.save("profiles", {"id": "coach", "_etag": "previous-version"})
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(store.container.replace_item.call_args.kwargs["etag"], "previous-version")
        self.assertEqual(store.container.replace_item.call_args.kwargs["match_condition"], function_app.MatchConditions.IfNotModified)
        store.container.replace_item.assert_called_once()
        store.container.create_item.assert_not_called()

    def test_client_cannot_supply_storage_etags_on_creation(self):
        result = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Book", "_etag": "forged"}))
        self.assertNotIn("_etag", result)

    def test_storage_refreshes_etag_after_writes(self):
        store = function_app.Storage()
        store.container = Mock()
        store.container.create_item.return_value = {"id": "coach", "_etag": "new-version"}
        record = {"id": "coach", "name": "Coach"}
        store.save("profiles", record)
        self.assertEqual(record["_etag"], "new-version")

    def test_failed_profile_validation_does_not_change_stored_data(self):
        before = response_json(call_api("GET", "me", "local-coach"))
        result = call_api("PATCH", "me", "local-coach", {"name": "Should not persist", "coachingTitle": []})
        self.assertEqual(result.status_code, 400)
        after = response_json(call_api("GET", "me", "local-coach"))
        self.assertEqual(before["name"], after["name"])

    def test_permissions_are_rechecked_after_acquiring_workspace_lock(self):
        team = self.team_fixture()
        book = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Shared"}, team["id"]))
        workspace = function_app.storage.get("workspaces", team["id"])
        with patch.object(function_app.accounts, "select_workspace", side_effect=[(workspace, "admin"), (workspace, "coach")]):
            self.assertEqual(call_api("DELETE", f"playbooks/{book['id']}", "coach-b", workspace_id=team["id"]).status_code, 403)
        self.assertIsNotNone(function_app.storage.get("playbooks", book["id"]))

    def test_health_is_public(self):
        response = call_api("GET", "health")

        self.assertEqual(response.status_code, 200)

    def test_protected_route_requires_authentication(self):
        response = call_api("GET", "playbooks")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response_json(response)["error"]["code"], "UNAUTHORIZED")

    def test_records_are_owned_and_isolated(self):
        create_response = call_api(
            "POST",
            "playbooks",
            "coach-a",
            {"name": "Defense", "ownerId": "coach-b"},
        )
        created = response_json(create_response)

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(created["ownerId"], "coach-a")
        self.assertEqual(response_json(call_api("GET", "playbooks", "coach-a"))["items"][0]["ownerName"], "coach-a")
        self.assertEqual(response_json(call_api("GET", "playbooks", "coach-b"))["items"], [])
        self.assertEqual(call_api("GET", f"playbooks/{created['id']}", "coach-b").status_code, 403)

    def test_play_and_scout_play_lists_include_owner_name(self):
        call_api("GET", "me", "local-coach")
        playbook = response_json(call_api("POST", "playbooks", "local-coach", {"name": "Book"}))
        game_plan = response_json(call_api("POST", "game-plans", "local-coach", {"name": "Plan"}))
        play_path = f"playbooks/{playbook['id']}/plays"
        scout_play_path = f"game-plans/{game_plan['id']}/scout-plays"
        call_api("POST", play_path, "local-coach", {"name": "Play"})
        call_api("POST", scout_play_path, "local-coach", {"name": "Scout play"})

        self.assertEqual(response_json(call_api("GET", play_path, "local-coach"))["items"][0]["ownerName"], "Local Coach")
        self.assertEqual(response_json(call_api("GET", scout_play_path, "local-coach"))["items"][0]["ownerName"], "Local Coach")

    def test_plays_and_scout_plays_are_paged_and_reorderable(self):
        playbook = response_json(call_api("POST", "playbooks", "coach-a", {"name": "Book"}))
        game_plan = response_json(call_api("POST", "game-plans", "coach-a", {"name": "Plan"}))
        for path in (f"playbooks/{playbook['id']}/plays", f"game-plans/{game_plan['id']}/scout-plays"):
            ids = [response_json(call_api("POST", path, "coach-a", {"name": name, "page": 99}))["id"] for name in ("A", "B", "C")]
            pages = lambda: [(item["name"], item["page"]) for item in response_json(call_api("GET", path, "coach-a"))["items"]]
            self.assertEqual(pages(), [("A", 1), ("B", 2), ("C", 3)])

            self.assertEqual(call_api("POST", f"{path}/reorder", "coach-a", {"ids": ids[:2]}).status_code, 400)
            self.assertEqual(call_api("POST", f"{path}/reorder", "coach-a", {"ids": [ids[2], ids[0], ids[1]]}).status_code, 200)
            self.assertEqual(pages(), [("C", 1), ("A", 2), ("B", 3)])

            call_api("PATCH", f"{path}/{ids[1]}", "coach-a", {"page": 1})
            call_api("DELETE", f"{path}/{ids[2]}", "coach-a")
            self.assertEqual(pages(), [("A", 1), ("B", 2)])

    def test_slides_are_scoped_to_their_play(self):
        playbook = response_json(call_api("POST", "playbooks", "coach-a", {"name": "Defense"}))
        first_play = response_json(
            call_api("POST", f"playbooks/{playbook['id']}/plays", "coach-a", {"name": "Cover 2"})
        )
        second_play = response_json(
            call_api("POST", f"playbooks/{playbook['id']}/plays", "coach-a", {"name": "Cover 3"})
        )

        create_response = call_api(
            "POST",
            f"playbooks/{playbook['id']}/plays/{first_play['id']}/slides",
            "coach-a",
            {"title": "Strong adjustment"},
        )
        slide = response_json(create_response)

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(slide["parentId"], first_play["id"])
        self.assertEqual(
            response_json(call_api("GET", f"playbooks/{playbook['id']}/plays/{first_play['id']}/slides", "coach-a"))["items"],
            [slide],
        )
        self.assertEqual(
            response_json(call_api("GET", f"playbooks/{playbook['id']}/plays/{second_play['id']}/slides", "coach-a"))["items"],
            [],
        )
        self.assertEqual(
            call_api(
                "GET",
                f"playbooks/{playbook['id']}/plays/{second_play['id']}/slides/{slide['id']}",
                "coach-a",
            ).status_code,
            404,
        )
        self.assertEqual(call_api("GET", f"playbooks/{playbook['id']}/slides", "coach-a").status_code, 404)

    def test_play_cannot_have_more_than_three_adjustment_slides(self):
        playbook = response_json(call_api("POST", "playbooks", "coach-a", {"name": "Defense"}))
        play = response_json(
            call_api("POST", f"playbooks/{playbook['id']}/plays", "coach-a", {"name": "Cover 2"})
        )
        slides_path = f"playbooks/{playbook['id']}/plays/{play['id']}/slides"

        for index in range(3):
            response = call_api("POST", slides_path, "coach-a", {"title": f"Adjustment {index + 1}"})
            self.assertEqual(response.status_code, 201)

        limited_response = call_api("POST", slides_path, "coach-a", {"title": "Adjustment 4"})

        self.assertEqual(limited_response.status_code, 409)
        self.assertEqual(response_json(limited_response)["error"]["code"], "SLIDE_LIMIT_REACHED")
        self.assertEqual(len(response_json(call_api("GET", slides_path, "coach-a"))["items"]), 3)


if __name__ == "__main__":
    unittest.main()