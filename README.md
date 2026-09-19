# ActiView Studio

ActiView Studio is the local visual editor, simulator, exporter, and safe deployment client for the 480×320 ActiView touchscreen. It uses no third-party packages and does not need an account, cloud service, API key, or internet connection.

## Launch on macOS

Double-click `launch_studio.command`, or run:

```bash
cd actiview-studio
python3 server.py
```

Studio opens at `http://127.0.0.1:4173`. Chrome, Safari, and Firefox are supported. Browser zoom should remain at 100%; the Scale menu changes preview scale without changing device coordinates.

The same editor is also deployable as a static GitHub Pages site. Online mode needs no Python backend: the bundled project loads from the Pages artifact, **Save** stores the current project in that browser's IndexedDB, and **Download Project** creates the complete portable `.avproject.zip`. Browser storage does not synchronize between browsers or devices; download the project when you need a portable backup.

## Architecture

- `projects/actiview.project.json` is the editable source of truth for screens, elements, navigation, styles, bindings, and the 480×320 display configuration. It is generated from the verified active local Tkinter launch path by `scripts/import_current_ui.py`; see `SOURCE_IMPORT.md`.
- `web/shared/runtime.js` and `runtime.css` are the single UI renderer used in Design, Simulate, exported packages, and the Raspberry Pi browser runtime.
- `web/studio.js` provides selection, drag/resize, pixel fields, component creation, layer ordering, screen management, undo/redo, simulation, persistence, import/export, and deployment controls.
- `device_server.py` is a tiny production adapter. It serves the same runtime and proxies the existing `activeview.v1` state and command APIs. Studio mock data stays separate in the editor and is not exported.
- The current Tkinter UI remains unchanged and available as a rollback implementation.

## Edit and simulate

In **Design**, select a screen and click an element. Drag it, resize from corner handles, move it with arrow keys (Shift = 10 pixels), or edit exact properties. Add elements with the Layers `+`; duplicate/delete in Properties. Screen actions are under the Screens `•••` button. Save writes the editable project atomically.

In **Simulate**, navigation and device actions run through the same renderer. The right panel controls phone/device battery, connection transport, GPS, map zoom, route, speed, weather, music, and incoming-call state. Music, phone, trip, waypoint, pairing, map, power-confirmation, AirPlay, CarPlay, and SOS actions use the isolated mock adapter. Hardware-only actions show their visible simulated result without touching a device.

The imported project contains 21 editable screens and states: splash, current dashboard, both app-launcher pages, map/navigation and route state, speed, music, weather, detailed status, trip recording, waypoints, settings plus both power confirmations, phone dialer, contacts, SOS, AirPlay, CarPlay, Android Auto, and the incoming-call overlay. The dashboard also contains the real disconnected/ready overlay as conditionally visible editable layers.

If an online browser already has a saved project, Studio keeps it. **Load Current UI** opens the newly bundled import without overwriting browser storage; press **Save** only when you want the import to become that browser's saved project. The previous bundled Studio definition is retained locally in `projects/actiview-studio-v1-backup.project.json`.

## Export, import, and deploy

**Export Project** downloads a deterministic `.avproject.zip` with the project, shared runtime, assets, manifest, checksums, hardware adapter, service template, and `CODEX_INSTRUCTIONS.md`. **Open…** accepts either its project JSON or a Studio archive and validates its format/checksum.

In the online edition these controls are named **Download Project** and **Open Project…**. The archive format is compatible in both directions with local Studio. Online Studio intentionally cannot access SSH. Open the downloaded archive in local Studio and use its Deploy mode when you are ready to update a Raspberry Pi.

The **Deploy** panel uses SSH keys already configured on the Mac. It will only target `/opt/actiview-web`, requires that directory to exist and be writable, checks Python and Chromium, uploads to a staging archive, validates every checksum, creates a versioned release, preserves the previous symlink, and atomically activates `current`. It restarts only `actiview-web.service`, and only when that dedicated service was already installed/enabled. It never replaces `actiview_gui.service` or modifies SSH/network settings.

First-time switching from Tkinter to the browser runtime is intentionally manual because it changes the boot UI. Follow the exported `CODEX_INSTRUCTIONS.md` after verifying the exported runtime directly. Chromium is not installed automatically.

## GitHub Pages

`scripts/build_pages.py` assembles a static artifact without adding a frontend framework or package manager. The workflow in `.github/workflows/pages.yml` publishes that artifact from `main`. Relative URLs are used throughout, so the editor works under the `/actiview-studio/` repository base path rather than requiring a root domain.

## Rendering differences

The shared browser renderer eliminates Studio/device layout drift once the web runtime is activated. Font rasterization can still vary slightly between Tk on Raspberry Pi and browser Helvetica/Arial. The browser map uses live OpenStreetMap tiles when available and a deterministic grid fallback otherwise; it preserves the active Web Mercator zoom, GPS marker, breadcrumb, and route rendering model. Optional AirPlay and CarPlay receivers, real calls, Bluetooth, GPS, SOS relay, reboot, and poweroff remain production-adapter responsibilities and are deliberately simulated in Studio.
