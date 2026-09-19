#!/usr/bin/env python3
"""Dependency-free ActiView device runtime server and hardware-data proxy."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional


class DeviceHandler(SimpleHTTPRequestHandler):
    backend = "http://127.0.0.1:8080"

    def do_GET(self) -> None:
        if self.path == "/":
            self.path = "/device.html"
        if self.path == "/device-api/state":
            return self._proxy("GET", "/api/v1/state")
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/device-api/command":
            self.send_error(404)
            return
        try:
            size = min(int(self.headers.get("Content-Length", "0")), 64 * 1024)
            payload = json.loads(self.rfile.read(size) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON")
            return
        command = str(payload.get("command") or "")
        if command == "waypoint.add":
            gps = (payload.get("state") or {}).get("gps") or {}
            body = {"lat": gps.get("lat"), "lon": gps.get("lon"), "name": "Saved from display"}
            return self._proxy("POST", "/api/v1/waypoints", body)
        if command == "sos":
            return self._proxy("POST", "/api/v1/sos", {"source": "display"})
        if command == "trip.toggle":
            return self._proxy("POST", "/api/v1/trips", {"command": "toggle"})
        return self._proxy("POST", "/api/v1/commands", {"type": "ui.command", "command": command})

    def _proxy(self, method: str, path: str, body: Optional[dict] = None) -> None:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.backend + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                content = response.read(1024 * 1024)
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        except (urllib.error.URLError, TimeoutError) as exc:
            content = json.dumps({"ok": False, "error": str(exc)}).encode()
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    def log_message(self, fmt: str, *args: object) -> None:
        print("ActiView runtime:", fmt % args)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent / "web")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--backend", default=os.environ.get("ACTIVEVIEW_BACKEND", "http://127.0.0.1:8080"))
    args = parser.parse_args()
    DeviceHandler.backend = args.backend.rstrip("/")
    mimetypes.add_type("application/javascript", ".js")
    os.chdir(args.root)
    ThreadingHTTPServer((args.host, args.port), DeviceHandler).serve_forever()


if __name__ == "__main__":
    main()
