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


if __name__ == "__main__":
    unittest.main()
