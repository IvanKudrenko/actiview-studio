from __future__ import annotations

import hashlib
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class StudioProjectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.project = json.loads(server.PROJECT_FILE.read_text())

    def test_project_and_navigation_targets_are_valid(self) -> None:
        server.validate_project(self.project)
        screens = {screen["id"] for screen in self.project["screens"]}
        self.assertEqual((480, 320), (self.project["display"]["width"], self.project["display"]["height"]))
        for screen in self.project["screens"]:
            for element in screen["elements"]:
                action = element.get("action") or {}
                if action.get("type") == "navigate":
                    self.assertIn(action.get("screen"), screens)

    def test_export_is_deterministic_and_complete(self) -> None:
        first = server.build_zip(self.project)
        second = server.build_zip(self.project)
        self.assertEqual(hashlib.sha256(first).hexdigest(), hashlib.sha256(second).hexdigest())
        with zipfile.ZipFile(io.BytesIO(first)) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            self.assertIn("shared/runtime.js", manifest["requiredFiles"])
            self.assertIn("project/project.json", manifest["requiredFiles"])
            for name, digest in manifest["checksums"].items():
                self.assertEqual(digest, hashlib.sha256(archive.read(name)).hexdigest())

    def test_static_package_sources_match_local_export(self) -> None:
        listing = json.loads((server.WEB / "package-files.json").read_text())
        browser_targets = {item["target"] for item in listing}
        local_targets = set(server.package_files(self.project)) - {"project/project.json", "manifest.json"}
        self.assertEqual(local_targets, browser_targets)

    def test_current_ui_import_and_assets_are_complete(self) -> None:
        expected = {
            "splash", "home", "apps-page-1", "apps-page-2", "map", "speed", "music",
            "weather", "status", "trip", "waypoints", "settings", "confirm-reboot",
            "confirm-poweroff", "phone", "contacts", "sos", "airplay", "carplay",
            "android-auto", "incoming-call",
        }
        self.assertEqual(expected, {screen["id"] for screen in self.project["screens"]})
        self.assertEqual("actiview-rpi/ui/app.py", self.project["source"]["entrypoint"])
        self.assertTrue(self.project["source"]["verifiedFromLocalFiles"])
        self.assertFalse(self.project["source"]["liveDeviceVerified"])
        self.assertEqual(64, next(item for item in self.project["screens"][1]["elements"] if item["id"] == "speed-tile")["faceSize"])
        for screen in self.project["screens"]:
            for item in screen["elements"]:
                for key in ("src", "iconSrc"):
                    value = item.get(key)
                    if value and not value.startswith(("http://", "https://")):
                        self.assertTrue((server.WEB / value).is_file(), f"Missing {value}")

    def test_previous_default_project_is_preserved(self) -> None:
        backup = server.ROOT / "projects" / "actiview-studio-v1-backup.project.json"
        self.assertTrue(backup.is_file())
        previous = json.loads(backup.read_text())
        self.assertEqual("actiview-project", previous.get("format"))


if __name__ == "__main__":
    unittest.main()
