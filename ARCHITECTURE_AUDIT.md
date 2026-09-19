# Existing ActiView architecture audit

This audit records the source-of-truth facts used for the Studio migration.

## Device and rendering

- The active implementation is Python 3 with Tkinter (`actiview-rpi/ui/app.py`), not the older `actiview-os-lite` package.
- The display constants in `actiview-rpi/ui/theme.py` are 480×320 logical pixels in landscape, with a 50-pixel status/footer region on non-home screens. The UI uses absolute pixel placement and no responsive layout.
- The target is documented as a Waveshare 3.5-inch touchscreen on Raspberry Pi Zero 2 W. Tkinter receives touch as ordinary pointer/button events. The X session and Chromium replacement both use a hidden cursor.
- The Tk UI uses Helvetica, a black background, light surfaces, orange `#ff6600` accent, small SVG-derived icons, Canvas-based superellipses, and cached artwork/tile images.

## Screens and navigation

- `ui/app.py` owns navigation and instantiates Home, Map, Speed, Music, Weather, Status, Trip, Waypoints, Settings, SOS, CarPlay, AirPlay, Phone, Contacts, and Android Auto screens. Home also owns the app-launcher overlay. Splash and phone-pairing states are separate UI states.
- Screen classes receive a navigation callback. Global home/status and incoming-call overlays are owned by the application controller.
- Studio's initial project contains every discovered destination plus splash, pairing, app launcher, and call-overlay behavior. Optional CarPlay/AirPlay and unavailable Android Auto states are identified as such instead of being simulated as working integrations.

## State, phone, and hardware

- `core.databus.DataBus` and the state/storage layer are the device UI's data boundary. BLE supplies small realtime packets; the local Flask service supplies the same normalized `activeview.v1` state, Wi-Fi fallback, GPX/tile upload, outbox commands, trips, and waypoints.
- Studio simulation uses an in-memory mock adapter. The exported production adapter polls the existing local `/api/v1/state` endpoint and submits commands through the existing HTTP/storage path. Mock GPS, weather, phone, battery, music, and call values are not exported.
- No Bluetooth, GPS, music, phone, network, user, password, or SSH implementation was rewritten.

## Boot and deployment

- `actiview_gui.service` starts X with `/opt/actiview/launch_ui.sh`; that script launches `python3 ui/app.py`. The current service is preserved.
- The shared web runtime has a separate `actiview-web.service` template. Studio deployment targets only `/opt/actiview-web`, stages a checksum-validated versioned release, preserves the previous release pointer, and updates `current` atomically. It does not install or enable the new service.
- A one-time owner-approved service switch is required after Chromium availability and physical LCD behavior are verified. Until then, the existing Tkinter boot path remains the rollback path.

## Architecture decision

A small browser renderer is appropriate because Chromium is available on both macOS and Raspberry Pi and allows the exact same DOM/CSS/JavaScript implementation to run in Studio and on the display. The project is declarative only so the visual editor can change ordinary properties; it is not a handoff format requiring a second implementation. Custom runtime component types (map, media, status, battery, navigation) are implemented in the shared renderer.

The previous SwiftUI Mac app is retained but is no longer the recommended simulator because it was a manually synchronized second implementation.

