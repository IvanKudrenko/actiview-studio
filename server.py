#!/usr/bin/env python3
"""Local, dependency-free server for ActiView Studio."""

from __future__ import annotations

import argparse
import cgi
import hashlib
import io
import json
import mimetypes
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import webbrowser
import zipfile
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional


ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PROJECT_FILE = ROOT / "projects" / "actiview.project.json"
REPO = ROOT.parent
ICON_DIR = WEB / "assets" / "icons"
ASSET_DIR = WEB / "assets"
RUNTIME_VERSION = "1.1.0"
HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
USER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")


def validate_project(project: Any) -> dict:
    if not isinstance(project, dict) or project.get("format") != "actiview-project" or project.get("formatVersion") != 1:
        raise ValueError("Unsupported ActiView project format")
    display = project.get("display") or {}
    if not isinstance(display.get("width"), int) or not isinstance(display.get("height"), int):
        raise ValueError("Project display dimensions are missing")
    screens = project.get("screens")
    if not isinstance(screens, list) or not screens:
        raise ValueError("Project must contain at least one screen")
    screen_ids: set[str] = set()
    for screen in screens:
        screen_id = screen.get("id") if isinstance(screen, dict) else None
        if not screen_id or screen_id in screen_ids or not isinstance(screen.get("elements"), list):
            raise ValueError("Screens need unique IDs and element lists")
        screen_ids.add(screen_id)
        element_ids: set[str] = set()
        for element in screen["elements"]:
            element_id = element.get("id") if isinstance(element, dict) else None
            if not element_id or element_id in element_ids:
                raise ValueError(f"Screen {screen_id} has duplicate or missing element IDs")
            element_ids.add(element_id)
    return project


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def package_files(project: dict) -> dict[str, bytes]:
    project_data = canonical_json(validate_project(project))
    files: dict[str, bytes] = {
        "project/project.json": project_data,
        "device.html": (WEB / "device.html").read_bytes(),
        "device.js": (WEB / "device.js").read_bytes(),
        "shared/runtime.js": (WEB / "shared" / "runtime.js").read_bytes(),
        "shared/runtime.css": (WEB / "shared" / "runtime.css").read_bytes(),
        "device_server.py": (ROOT / "device_server.py").read_bytes(),
        "launch_device.sh": (ROOT / "launch_device.sh").read_bytes(),
        "CODEX_INSTRUCTIONS.md": (ROOT / "CODEX_INSTRUCTIONS.md").read_bytes(),
        "SOURCE_IMPORT.md": (ROOT / "SOURCE_IMPORT.md").read_bytes(),
        "systemd/actiview-web.service": (ROOT / "deployment" / "actiview-web.service").read_bytes(),
    }
    if ASSET_DIR.exists():
        for path in sorted(item for item in ASSET_DIR.rglob("*") if item.is_file()):
            files[path.relative_to(WEB).as_posix()] = path.read_bytes()
    manifest = {
        "format": "actiview-export",
        "formatVersion": 1,
        "runtimeVersion": RUNTIME_VERSION,
        "createdBy": "ActiView Studio",
        "target": {"platform": "raspberry-pi", "display": project["display"], "backend": "activeview.v1"},
        "entrypoint": "launch_device.sh",
        "requiredFiles": sorted(files),
        "checksums": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
    }
    files["manifest.json"] = canonical_json(manifest)
    return files


def build_zip(project: dict) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(package_files(project).items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if name.endswith(".sh") or name.endswith(".py") else 0o644) << 16
            archive.writestr(info, data)
    return output.getvalue()


class StudioHandler(SimpleHTTPRequestHandler):
    server_version = "ActiViewStudio/1.0"

    def translate_path(self, path: str) -> str:
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/assets/icons/"):
            return str(ICON_DIR / Path(clean).name)
        if clean.startswith("/package-source/"):
            sources = {
                "device_server.py": ROOT / "device_server.py",
                "launch_device.sh": ROOT / "launch_device.sh",
                "CODEX_INSTRUCTIONS.md": ROOT / "CODEX_INSTRUCTIONS.md",
                "SOURCE_IMPORT.md": ROOT / "SOURCE_IMPORT.md",
                "actiview-web.service": ROOT / "deployment" / "actiview-web.service",
            }
            return str(sources.get(Path(clean).name, WEB / "missing"))
        return str(WEB / clean.lstrip("/"))

    def do_GET(self) -> None:
        if self.path == "/":
            self.path = "/index.html"
        if self.path == "/api/project":
            return self.send_json(json.loads(PROJECT_FILE.read_text()))
        if self.path == "/project/project.json":
            return self.send_json(json.loads(PROJECT_FILE.read_text()))
        if self.path == "/api/health":
            return self.send_json({"ok": True, "studioVersion": RUNTIME_VERSION})
        super().do_GET()

    def do_PUT(self) -> None:
        if self.path != "/api/project":
            return self.send_error(404)
        try:
            project = validate_project(self.read_json())
            temp = PROJECT_FILE.with_suffix(".tmp")
            temp.write_bytes(canonical_json(project))
            temp.replace(PROJECT_FILE)
            self.send_json({"ok": True})
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self.send_json({"ok": False, "message": str(exc)}, 400)

    def do_POST(self) -> None:
        try:
            if self.path == "/api/export":
                data = build_zip(validate_project(self.read_json()))
                return self.send_bytes(data, "application/zip", "actiview.avproject.zip")
            if self.path == "/api/import":
                return self.import_zip()
            if self.path in ("/api/deploy/check", "/api/deploy/activate"):
                payload = self.read_json()
                result = deploy(payload, activate=self.path.endswith("activate"))
                return self.send_json(result, 200 if result["ok"] else 400)
            self.send_error(404)
        except (ValueError, OSError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
            self.send_json({"ok": False, "message": str(exc)}, 400)

    def import_zip(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        _, params = cgi.parse_header(content_type)
        if not content_type.startswith("multipart/form-data") or "boundary" not in params:
            raise ValueError("Expected a zip upload")
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type})
        item = form["file"]
        data = item.file.read(20 * 1024 * 1024 + 1)
        if len(data) > 20 * 1024 * 1024:
            raise ValueError("Project archive is too large")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
            if "manifest.json" not in names or "project/project.json" not in names:
                raise ValueError("Archive is missing manifest.json or project/project.json")
            if any(name.startswith("/") or ".." in Path(name).parts for name in names):
                raise ValueError("Unsafe archive path")
            manifest = json.loads(archive.read("manifest.json"))
            project_data = archive.read("project/project.json")
            expected = manifest.get("checksums", {}).get("project/project.json")
            if expected != hashlib.sha256(project_data).hexdigest():
                raise ValueError("Project checksum does not match the manifest")
            return self.send_json(validate_project(json.loads(project_data)))

    def read_json(self) -> Any:
        size = int(self.headers.get("Content-Length", "0"))
        if size > 10 * 1024 * 1024:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(size) or b"{}")

    def send_json(self, value: Any, status: int = 200) -> None:
        self.send_bytes(canonical_json(value), "application/json", status=status)

    def send_bytes(self, data: bytes, content_type: str, filename: Optional[str] = None, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt: str, *args: object) -> None:
        print("Studio:", fmt % args)


def ssh_args(payload: dict) -> tuple[list[str], str, str]:
    host, user = str(payload.get("host") or ""), str(payload.get("user") or "")
    port = int(payload.get("port") or 22)
    if not HOST_RE.fullmatch(host) or not USER_RE.fullmatch(user) or not 1 <= port <= 65535:
        raise ValueError("Invalid SSH host, user, or port")
    target = str(payload.get("target") or "/opt/actiview-web")
    if target != "/opt/actiview-web":
        raise ValueError("Deployment target must be /opt/actiview-web")
    args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=7", "-p", str(port)]
    identity = str(payload.get("identity") or "").strip()
    if identity:
        path = Path(identity).expanduser().resolve()
        if not path.is_file():
            raise ValueError("SSH identity file does not exist")
        args += ["-i", str(path)]
    return args, f"{user}@{host}", target


def deploy(payload: dict, activate: bool) -> dict:
    args, remote, target = ssh_args(payload)
    check_script = f"test -d {shlex.quote(target)} && test -w {shlex.quote(target)} && command -v python3 >/dev/null && (command -v chromium-browser >/dev/null || command -v chromium >/dev/null || command -v google-chrome >/dev/null); printf 'service='; systemctl is-enabled actiview-web.service 2>/dev/null || true"
    check = subprocess.run(args + [remote, check_script], text=True, capture_output=True, timeout=12)
    if check.returncode != 0:
        return {"ok": False, "message": "Connection worked, but the target is not ready.", "details": "Ensure /opt/actiview-web exists and is writable by the SSH user, and install Chromium. No files were changed.\n" + (check.stderr.strip() or check.stdout.strip())}
    if not activate:
        return {"ok": True, "message": "SSH and runtime compatibility checks passed.", "details": check.stdout.strip() or "Python and Chromium are available; target is writable."}
    if not payload.get("confirm"):
        raise ValueError("Activation confirmation is required")
    project = validate_project(payload.get("project"))
    release_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + hashlib.sha256(canonical_json(project)).hexdigest()[:8]
    with tempfile.TemporaryDirectory(prefix="actiview-deploy-") as temp_name:
        archive = Path(temp_name) / f"{release_id}.zip"
        archive.write_bytes(build_zip(project))
        scp = ["scp", "-P", args[args.index("-p") + 1]]
        if "-i" in args:
            scp += ["-i", args[args.index("-i") + 1]]
        upload = subprocess.run(scp + [str(archive), f"{remote}:{target}/staging-{release_id}.zip"], text=True, capture_output=True, timeout=60)
        if upload.returncode != 0:
            return {"ok": False, "message": "Upload failed; the active UI was not changed.", "details": upload.stderr.strip()}
    remote_archive = f"{target}/staging-{release_id}.zip"
    script = (
        "set -eu; "
        f"release={shlex.quote(target + '/releases/' + release_id)}; archive={shlex.quote(remote_archive)}; "
        'mkdir -p "$release"; python3 - "$archive" "$release" <<\'PY\'\n'
        "import hashlib,json,pathlib,sys,zipfile\n"
        "archive,path=sys.argv[1],pathlib.Path(sys.argv[2])\n"
        "with zipfile.ZipFile(archive) as z:\n"
        " names=set(z.namelist()); assert 'manifest.json' in names\n"
        " assert all(not n.startswith('/') and '..' not in pathlib.PurePosixPath(n).parts for n in names)\n"
        " z.extractall(path)\n"
        " manifest=json.loads((path/'manifest.json').read_text())\n"
        " for name,digest in manifest['checksums'].items():\n"
        "  assert hashlib.sha256((path/name).read_bytes()).hexdigest()==digest, name\n"
        "PY\n"
        'chmod +x "$release/launch_device.sh" "$release/device_server.py"; '
        f'if test -L {shlex.quote(target + "/current")}; then readlink {shlex.quote(target + "/current")} > {shlex.quote(target + "/previous")}; fi; '
        f'ln -sfn "$release" {shlex.quote(target + "/current.next")}; mv -Tf {shlex.quote(target + "/current.next")} {shlex.quote(target + "/current")}; rm -f "$archive"; '
        "if systemctl is-enabled actiview-web.service >/dev/null 2>&1; then sudo -n systemctl restart actiview-web.service; echo restarted; else echo staged-only-service-not-enabled; fi"
    )
    activation = subprocess.run(args + [remote, script], text=True, capture_output=True, timeout=35)
    if activation.returncode != 0:
        return {"ok": False, "message": "Validation or activation failed; inspect the release before retrying.", "details": activation.stderr.strip() or activation.stdout.strip()}
    restarted = "restarted" in activation.stdout
    message = "Release validated and activated." if restarted else "Release validated and staged; the web UI service is not enabled yet."
    details = f"Release: {release_id}\n" + activation.stdout.strip()
    if not restarted:
        details += "\nFollow CODEX_INSTRUCTIONS.md for the one-time, explicitly approved service switch. The existing Tkinter UI remains active."
    return {"ok": True, "message": message, "details": details}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ActiView Studio locally")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    mimetypes.add_type("application/javascript", ".js")
    server = ThreadingHTTPServer((args.host, args.port), StudioHandler)
    url = f"http://{args.host}:{args.port}"
    print(f"ActiView Studio running at {url}")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
