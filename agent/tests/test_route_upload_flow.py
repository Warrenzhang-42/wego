import json
import unittest
from unittest.mock import patch

from tools.upload_route import upload_route
from tools.confirm_route_upload import confirm_route_upload


class RouteUploadFlowTest(unittest.TestCase):
    def test_upload_route_success_with_complete_json(self):
        payload = {
            "title": "大栅栏漫游",
            "spots": [
                {
                    "name": "前门大街",
                    "lat": 39.8973,
                    "lng": 116.3976,
                    "estimated_stay_min": 30,
                    "sort_order": 0,
                    "tags": ["文化"],
                }
            ],
        }
        result = upload_route.invoke(
            {
                "file_content": json.dumps(payload, ensure_ascii=False),
                "file_type": "json",
                "session_id": "11111111-1111-1111-1111-111111111111",
            }
        )
        parsed = json.loads(result)
        self.assertEqual(parsed["status"], "success")
        self.assertIn("route_preview", parsed)
        self.assertEqual(parsed["route_preview"]["route_name"], "大栅栏漫游")

    def test_upload_route_has_gaps_for_txt(self):
        result = upload_route.invoke(
            {
                "file_content": "前门大街\n杨梅竹斜街",
                "file_type": "txt",
                "session_id": "22222222-2222-2222-2222-222222222222",
            }
        )
        parsed = json.loads(result)
        self.assertEqual(parsed["status"], "has_gaps")
        self.assertGreater(len(parsed.get("gaps", [])), 0)

    @patch("tools.confirm_route_upload._upsert_routes_and_spots")
    @patch("tools.confirm_route_upload._get_draft")
    def test_confirm_route_upload_confirmed(self, mock_get_draft, mock_upsert):
        mock_get_draft.return_value = {
            "session_id": "33333333-3333-3333-3333-333333333333",
            "parsed_data": {
                "route_name": "测试路线",
                "spots": [
                    {
                        "name": "前门大街",
                        "lat": 39.8973,
                        "lng": 116.3976,
                        "sort_order": 0,
                        "estimated_stay_min": 30,
                    }
                ],
            },
            "user_overrides": [],
        }
        mock_upsert.return_value = {"route_id": "r1", "spot_ids": ["s1"], "errors": []}

        result = confirm_route_upload.invoke(
            {
                "session_id": "33333333-3333-3333-3333-333333333333",
                "confirmed": True,
                "overrides": [],
            }
        )
        parsed = json.loads(result)
        self.assertEqual(parsed["status"], "confirmed")
        self.assertEqual(parsed["import_report"]["route_id"], "r1")


if __name__ == "__main__":
    unittest.main()
