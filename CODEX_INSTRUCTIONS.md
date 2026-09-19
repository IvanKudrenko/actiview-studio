# CODEX instructions — ActiView UI package

This archive is the authoritative ActiView UI. Do not recreate it from screenshots or translate it into another UI framework.

- Runtime and project format versions are recorded in `manifest.json`.
- The exact target viewport is recorded in `manifest.json` and `project/project.json`.
- Entry point: `./launch_device.sh`.
- Editable source: `project/project.json`.
- Shared renderer: `shared/runtime.js` and `shared/runtime.css`; these exact files are used by Studio simulation and the device.
- Hardware data is fetched through `device_server.py`, which proxies the existing local ActiView `activeview.v1` service at port 8080.
- Studio mock values are not part of this export.

Validate every checksum in `manifest.json` before activation. Install the archive into a new versioned release directory, retain the preceding release, then atomically update the `current` symlink. Do not overwrite the Tkinter application or change Bluetooth, Wi-Fi, SSH, users, passwords, routes, or display configuration.

For first-time setup, copy `systemd/actiview-web.service` to `/etc/systemd/system/`, run `systemctl daemon-reload`, enable it, and stop/disable `actiview_gui.service` only after manually confirming the browser runtime works. That one-time service switch requires explicit owner approval.
