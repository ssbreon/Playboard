import json
import os
import unittest

os.environ["AUTH_MODE"] = "development"
os.environ["DEV_AUTH_SECRET"] = "test-secret"
os.environ["DEV_USER_ID"] = "local-coach"
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


def call_api(method, path, user_id=None, payload=None):
    return function_app.api(FakeRequest(method, path, user_id, payload))


def response_json(response):
    return json.loads(response.get_body())


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        function_app.storage = function_app.Storage()

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
        self.assertEqual(response_json(call_api("GET", "playbooks", "coach-b"))["items"], [])
        self.assertEqual(call_api("GET", f"playbooks/{created['id']}", "coach-b").status_code, 403)

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