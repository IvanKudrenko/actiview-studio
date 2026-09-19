#!/usr/bin/env python3
"""Assemble the dependency-free GitHub Pages artifact."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "_site"


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(ROOT / "web", OUTPUT)
    (OUTPUT / "project").mkdir()
    shutil.copy2(ROOT / "projects" / "actiview.project.json", OUTPUT / "project" / "project.json")
    source = OUTPUT / "package-source"
    source.mkdir()
    for path in (ROOT / "device_server.py", ROOT / "launch_device.sh", ROOT / "CODEX_INSTRUCTIONS.md", ROOT / "SOURCE_IMPORT.md"):
        shutil.copy2(path, source / path.name)
    shutil.copy2(ROOT / "deployment" / "actiview-web.service", source / "actiview-web.service")
    (OUTPUT / ".nojekyll").write_text("")
    required = ["index.html", "studio.js", "platform.js", "shared/runtime.js", "project/project.json", "package-files.json"]
    missing = [name for name in required if not (OUTPUT / name).is_file()]
    if missing:
        raise SystemExit("Pages artifact is incomplete: " + ", ".join(missing))
    project = json.loads((OUTPUT / "project" / "project.json").read_text())
    if project.get("format") != "actiview-project" or project.get("formatVersion") != 1:
        raise SystemExit("Pages project format is invalid")
    print(f"Built ActiView Studio Pages artifact at {OUTPUT}")


if __name__ == "__main__":
    main()
