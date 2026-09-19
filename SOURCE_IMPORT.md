# Current ActiView UI import

The bundled Studio project is generated from the active local Tkinter launch chain, established from local files only:

`actiview-rpi/services/systemd/actiview_gui.service` → `actiview-rpi/launch_ui.sh` → `actiview-rpi/ui/app.py`

`ui/app.py` imports the active screen classes under `actiview-rpi/ui/screens/`, the shared theme in `ui/theme.py`, and the splash/superellipse/artwork widgets under `ui/widgets/`. The separate `actiview-os-lite` tree, `.codex-backups`, documentation-era prototypes, and unused assets are not import sources.

`scripts/import_current_ui.py` verifies that launch chain, hashes the 20 authoritative source files, and emits `projects/actiview.project.json`. The imported project stores the source file list and digest in its metadata. The previous Studio project is preserved as `projects/actiview-studio-v1-backup.project.json`.

## Reuse and adapters

- Display size, component geometry, text, colors, active screen inventory, navigation, command names, conditional connection state, route overlay, settings confirmations, phone keypad, call overlay, and map behavior come from the active Python source.
- The original generated PNG icons and connection artwork are copied unchanged into `web/assets/rpi-icons/` and `web/assets/ready/`.
- The browser map uses the same Web Mercator tile structure, zoom range, marker, breadcrumb, and route colors. It requests OpenStreetMap tiles directly online and retains the active `MiniTileMap`-style grid fallback when tiles are unavailable.
- Python callbacks are represented as shared runtime actions. `device.js`/`device_server.py` translate those actions to the existing local backend on a future device deployment. Studio's mock adapter changes only simulated state and never performs power, phone, Bluetooth, GPS, or SOS hardware operations.
- Tk's custom superellipse calculation is behaviorally ported to a generated CSS clip polygon using the same exponent values.

The import is verified against local source, not against a running Raspberry Pi. No claim is made that the local checkout exactly matches the files currently installed on a physical device.
