#!/usr/bin/env python3
"""Generate Studio's editable project from the active Tkinter UI contract.

The launch chain verified by this importer is:
services/systemd/actiview_gui.service -> launch_ui.sh -> ui/app.py.
The geometry below mirrors the active screen classes imported by ui/app.py.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


STUDIO = Path(__file__).resolve().parents[1]
ACTIVE = STUDIO.parent / "actiview-rpi"
OUTPUT = STUDIO / "projects" / "actiview.project.json"
PACKAGE_LIST = STUDIO / "web" / "package-files.json"
SOURCE_FILES = [
    "services/systemd/actiview_gui.service", "launch_ui.sh", "ui/app.py", "ui/theme.py",
    "ui/screens/home.py", "ui/screens/map.py", "ui/screens/music.py", "ui/screens/speed.py",
    "ui/screens/weather_status.py", "ui/screens/status.py", "ui/screens/trip.py",
    "ui/screens/waypoints.py", "ui/screens/settings.py", "ui/screens/phone.py",
    "ui/screens/sos.py", "ui/screens/airplay.py", "ui/screens/carplay.py",
    "ui/screens/android_auto.py", "ui/widgets/splash.py", "ui/widgets/superellipse.py",
]

WHITE = "#ffffff"
BLACK = "#000000"
SURFACE = "#f6f5f2"
TEXT = "#111111"
ORANGE = "#ff6600"
GREEN = "#73ff91"
YELLOW = "#ffd34d"
CYAN = "#00C2FF"


def element(identifier: str, kind: str, x: int, y: int, w: int, h: int, **values):
    return {"id": identifier, "type": kind, "x": x, "y": y, "w": w, "h": h, **values}


def text(identifier: str, x: int, y: int, w: int, h: int, value: str, size: int = 12, color: str = WHITE, weight: int = 400, **values):
    return element(identifier, "text", x, y, w, h, text=value, fontSize=size, color=color, fontWeight=weight, **values)


def button(identifier: str, x: int, y: int, w: int, h: int, label: str, action: dict, bg: str = SURFACE, fg: str = TEXT, size: int = 11, weight: int = 700, **values):
    return element(identifier, "button", x, y, w, h, text=label, action=action, background=bg, color=fg, fontSize=size, fontWeight=weight, **values)


def command(name: str):
    return {"type": "command", "command": name}


def navigate(screen: str):
    return {"type": "navigate", "screen": screen}


def icon_path(name: str, color: str, size: int) -> str:
    return f"assets/rpi-icons/{name}_{color}_{size}.png"


def tile(identifier: str, x: int, y: int, size: int, label: str, icon: str, screen: str, fill: str, icon_color: str = "white", icon_size: int = 44, **values):
    return element(
        identifier, "tile", x, y, size, size + 31, text=label, icon=icon,
        iconSrc=None if icon == "apps" else icon_path(icon, icon_color, icon_size),
        iconSize=icon_size, faceSize=size, exponent=4.8, background=fill, color=WHITE,
        action=navigate(screen), **values,
    )


def nav_overlay() -> list[dict]:
    return [
        text("nav-time", 12, 278, 96, 34, "{{time|--:--}}", 18),
        element("nav-device-battery-icon", "image", 122, 280, 32, 32, src=icon_path("battery", "white", 32), background="transparent"),
        text("nav-device-battery", 160, 282, 54, 28, "{{device.battery_percent|100}}%", 10),
        element("nav-phone-icon", "image", 228, 279, 32, 32, src=icon_path("phone", "white", 32), background="transparent"),
        text("nav-phone-battery", 266, 282, 58, 28, "{{phone.battery_percent|--}}%", 10),
        button("nav-home", 424, 275, 44, 40, "", navigate("home"), "#111111", WHITE, radius=10, shape="superellipse", exponent=4.4, icon="home", iconSrc=icon_path("home", "white", 44), iconSize=24),
    ]


def apps_footer() -> list[dict]:
    return [
        text("apps-time", 24, 276, 96, 32, "{{time|--:--}}", 18),
        element("apps-device-battery", "battery", 132, 283, 86, 20, value="{{device.battery_percent|100}}", color=WHITE),
        element("apps-phone-icon", "image", 244, 275, 32, 32, src=icon_path("phone", "white", 32), background="transparent"),
        text("apps-phone-battery", 286, 278, 54, 28, "{{phone.battery_percent|--}}%", 10),
        button("apps-home", 420, 276, 42, 38, "", navigate("home"), "#111111", WHITE, radius=10, shape="superellipse", exponent=4.4, icon="home", iconSrc=icon_path("home", "white", 44), iconSize=20),
    ]


def make_project() -> dict:
    digest = hashlib.sha256()
    for relative in SOURCE_FILES:
        path = ACTIVE / relative
        if not path.is_file():
            raise SystemExit(f"Active UI source is missing: {path}")
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
    app_source = (ACTIVE / "ui/app.py").read_text()
    service_source = (ACTIVE / "services/systemd/actiview_gui.service").read_text()
    if "exec python3 ui/app.py" not in (ACTIVE / "launch_ui.sh").read_text() or "ActiveViewApp" not in app_source or "/opt/actiview/launch_ui.sh" not in service_source:
        raise SystemExit("The active launch chain no longer matches this importer")

    screens = []
    screens.append({"id":"splash","name":"Splash","background":BLACK,"elements":[
        text("splash-title", 0, 112, 480, 62, "ActiveView", 48, WHITE, 700, align="center"),
        text("splash-subtitle", 0, 168, 480, 32, "Powered by BA", 16, "#888888", align="center"),
    ]})

    home = [
        element("home-map", "map", 0, 0, 210, 320, zoom=15, showCoordinates=False, action=navigate("map")),
        element("speed-tile", "tile", 226, 18, 64, 85, text="Speed", value="{{speedKmh|--}}", detail="km/h", faceSize=64, exponent=4.6, background="#247f96", color=WHITE, action=navigate("speed")),
        element("weather-tile", "tile", 313, 18, 64, 85, text="Weather", icon="weather", iconSrc=icon_path("weather", "white", 24), iconSize=24, value="{{weather.temperature|--}}C", detail="{{weather.description|--}}", faceSize=64, exponent=4.6, background="#3f95cf", color=WHITE, action=navigate("weather")),
        element("phone-tile", "tile", 400, 18, 64, 85, text="Phone", icon="phone", iconSrc=icon_path("phone", "white", 24), iconSize=24, detail="{{phone.battery_percent|--}}%", faceSize=64, exponent=4.6, background="#3d9a61", color=WHITE, action=navigate("status")),
        element("home-music", "media", 222, 108, 246, 72, background=WHITE, color=TEXT, radius=18, shape="superellipse", exponent=5.8, action=navigate("music")),
        element("home-call", "tile", 232, 195, 56, 82, text="Call", icon="phone", iconSrc=icon_path("phone", "white", 44), iconSize=44, faceSize=56, exponent=4.6, background="#3d9a61", color=WHITE, action=navigate("phone")),
        element("home-settings", "tile", 317, 195, 56, 82, text="Settings", icon="settings", iconSrc=icon_path("settings", "white", 44), iconSize=44, faceSize=56, exponent=4.6, background="#343942", color=WHITE, action=navigate("settings")),
        element("home-apps", "tile", 402, 195, 56, 82, text="Apps", icon="apps", iconSize=36, faceSize=56, exponent=4.6, background="#424950", color=WHITE, action=navigate("apps-page-1")),
        text("home-time", 222, 286, 78, 28, "{{time|--:--}}", 16),
        element("home-device-battery", "battery", 322, 291, 64, 20, value="{{device.battery_percent|100}}", color=WHITE),
        text("home-phone-battery", 386, 288, 80, 24, "Phone {{phone.battery_percent|--}}%", 10, WHITE, align="right"),
        element("ready-background", "card", 0, 0, 480, 320, background=BLACK, visibleWhen="!connection.connected", z=100),
        element("ready-phone", "image", 74, 92, 74, 118, src="assets/ready/connect_phone.png", background="transparent", visibleWhen="!connection.connected", z=101),
        text("ready-title", 170, 94, 290, 52, "Ready to connect\nwith phone", 15, ORANGE, 700, verticalAlign="top", visibleWhen="!connection.connected", z=101),
        text("ready-copy", 170, 156, 290, 50, "Open Actiview Companion\nand connect over BLE", 13, WHITE, verticalAlign="top", visibleWhen="!connection.connected", z=101),
        element("ready-logo", "image", 174, 248, 132, 45, src="assets/ready/actiview_horizontal_logo.png", background="transparent", visibleWhen="!connection.connected", z=101),
    ]
    screens.append({"id":"home","name":"Home dashboard","background":BLACK,"elements":home})

    first_apps = [
        ("Maps","map","map","#168a98"),("Music","music","music","#a43e45"),("Phone","phone","phone","#3d9a61"),
        ("Weather","weather","weather","#3f95cf"),("Status","battery","status","#778072"),("Settings","settings","settings","#343942"),
    ]
    second_apps = [
        ("Contacts","phone","contacts","#3d9a61"),("Trip","gps","trip","#4f9370"),("Points","gps","waypoints","#4f9370"),
        ("CarPlay","phone","carplay","#3e434c"),("AirPlay","wifi","airplay","#527e9c"),("Android Auto","phone","android-auto","#3e434c"),
    ]
    for page_id, name, apps, other in [("apps-page-1","Apps · page 1",first_apps,"apps-page-2"),("apps-page-2","Apps · page 2",second_apps,"apps-page-1")]:
        items = []
        for index, (label, icon, target, fill) in enumerate(apps):
            items.append(tile(f"app-{target}", 88 + (index % 3) * 115, 34 + (index // 3) * 112, 74, label, icon, target, fill))
        items += [
            button("apps-previous", 20, 116, 36, 60, "‹", navigate(other), BLACK, WHITE, 42, 400),
            button("apps-next", 424, 116, 36, 60, "›", navigate(other), BLACK, WHITE, 42, 400),
            *apps_footer(),
        ]
        screens.append({"id":page_id,"name":name,"background":BLACK,"elements":items})

    map_items = [
        element("map-surface", "map", 0, 0, 480, 320, zoom=15, showCoordinates=False),
        text("map-speed", 12, 184, 150, 48, "{{speedKmh|--}} km/h", 23, GREEN, 700, background=BLACK, padding=8, borderColor="#222222", borderWidth=1),
        text("map-transport", 12, 236, 74, 16, "{{connection.transport|OFFLINE}}", 9, GREEN, 700),
        text("map-coordinates", 92, 236, 206, 16, "{{gps.lat|--}}, {{gps.lon|--}}  {{gps.heading_deg|--}} deg", 9),
        text("map-weather", 12, 253, 286, 16, "{{weather.summary|No weather}}  |  Phone {{phone.battery_percent|--}}%", 9, "#cfcfcf"),
        text("map-feedback", 12, 253, 286, 16, "{{map.feedback|}}", 9, YELLOW, visibleWhen="map.feedback", z=5),
        button("map-recenter", 302, 190, 78, 32, "Recenter", command("map.recenter"), SURFACE, TEXT, 9, 700, shape="superellipse", exponent=4.2),
        button("map-save", 388, 190, 78, 32, "Save", command("waypoint.add"), SURFACE, TEXT, 9, 700, shape="superellipse", exponent=4.2),
        button("map-trackback", 302, 229, 78, 32, "Track", command("route.trackback"), SURFACE, TEXT, 9, 700, shape="superellipse", exponent=4.2),
        button("map-trip", 388, 229, 78, 32, "Trip", navigate("trip"), SURFACE, TEXT, 9, 700, shape="superellipse", exponent=4.2),
        element("route-background", "card", 0, 0, 480, 50, background=BLACK, visibleWhen="route.active", z=10),
        text("route-summary", 12, 4, 340, 42, "{{route.destination|Route}}  {{route.eta|--}}  {{route.distance|--}}\n{{route.next_turn|Follow highlighted route}}", 11, WHITE, 700, visibleWhen="route.active", z=11),
        button("route-stop", 374, 8, 82, 32, "Stop", command("route.stop"), "#351414", "#ff8b8b", 10, 700, visibleWhen="route.active", z=11),
        *nav_overlay(),
    ]
    screens.append({"id":"map","name":"Map & navigation","background":"#050505","elements":map_items})

    screens.append({"id":"speed","name":"Speed","background":BLACK,"elements":[
        text("speed-title",24,18,160,30,"Speed",17,WHITE,700),
        element("speed-icon","image",218,38,44,44,src=icon_path("speed","orange",44),background="transparent"),
        text("speed-value",0,76,480,100,"{{speedKmh|—}}",82,GREEN,700,align="center"),
        text("speed-unit",0,178,480,34,"{{system.unitLabel|km/h}}",24,WHITE,700,align="center"),
        button("speed-unit-toggle",164,222,152,38,"change unit",command("settings.unit.toggle"),SURFACE,TEXT,11,700),
        *nav_overlay(),
    ]})

    screens.append({"id":"music","name":"Music","background":BLACK,"elements":[
        element("music-art-tile","shape",16,18,86,86,background=WHITE,exponent=4.6),
        element("music-art-icon","image",27,22,64,64,src=icon_path("music","black",64),background="transparent"),
        text("music-art-label",16,78,86,20,"Music",9,"#777777",align="center"),
        text("music-title",120,22,328,52,"{{music.title|No Song}}",18,WHITE,700,verticalAlign="top"),
        text("music-artist",120,76,328,28,"{{music.artist|}}",13,"#d7d7d7",verticalAlign="top"),
        text("music-source",120,98,328,22,"Source  {{music.source|--}}",9,CYAN,verticalAlign="top"),
        text("music-volume-label",16,122,62,24,"Volume",9,"#777777"),
        button("volume-down",64,112,44,44,"−",command("music.volume_down"),WHITE,TEXT,24,700,shape="superellipse",exponent=4.2),
        element("volume-track","card",132,132,214,4,background="#303030"),
        element("volume-level","card",132,132,92,4,background=CYAN),
        element("volume-thumb","shape",213,122,20,20,background=WHITE,exponent=2),
        button("volume-up",368,112,44,44,"+",command("music.volume_up"),WHITE,TEXT,24,700,shape="superellipse",exponent=4.2),
        button("music-previous",108,178,60,56,"◀◀",command("music.prev"),"#111111",WHITE,18,700,shape="superellipse",exponent=4.2,borderColor="#2a2a2a"),
        button("music-play",206,172,68,68,"{{music.playing|▶}}",{"type":"togglePlayback"},WHITE,TEXT,28,700,shape="superellipse",exponent=4.6),
        button("music-next",312,178,60,56,"▶▶",command("music.next"),"#111111",WHITE,18,700,shape="superellipse",exponent=4.2,borderColor="#2a2a2a"),
        *nav_overlay(),
    ]})

    screens.append({"id":"weather","name":"Weather & phone","background":BLACK,"elements":[
        text("weather-title",24,18,180,30,"Weather",17,WHITE,700),
        element("weather-card","card",28,62,196,184,background=SURFACE),
        element("weather-icon","image",94,78,64,64,src=icon_path("weather","orange",64),background="transparent"),
        text("weather-label",28,142,196,30,"Weather",20,TEXT,700,align="center"),
        text("weather-value",40,180,172,50,"{{weather.summary|No data}}",13,"#555555",align="center"),
        element("weather-phone-card","card",256,62,196,184,background=SURFACE),
        element("weather-phone-icon","image",322,78,64,64,src=icon_path("phone","orange",64),background="transparent"),
        text("weather-phone-label",256,142,196,30,"Phone",20,TEXT,700,align="center"),
        text("weather-phone-name",268,178,172,24,"{{phone.phone_name|Unknown}}",13,"#555555",align="center"),
        text("weather-phone-battery",268,205,172,28,"{{phone.battery_percent|—}}%",15,TEXT,700,align="center"),
        *nav_overlay(),
    ]})

    status_items=[text("status-title",24,18,160,30,"Status",17,WHITE,700)]
    status_rows=[("phone","Phone Battery","{{phone.battery_percent|--}}%"),("charging","Charging","{{phone.charging|--}}"),("actiview","ActiView Battery","{{device.battery_percent|--}}%"),("earbuds","Earbuds Battery","--"),("bluetooth","Bluetooth","{{phone.connection|Disconnected}}")]
    for index,(key,label,value) in enumerate(status_rows):
        y=58+index*36;status_items += [text(f"status-{key}-label",24,y,220,30,label,12,TEXT,700,background=SURFACE,padding=6),text(f"status-{key}-value",250,y,206,30,value,12,TEXT,align="right",background=SURFACE,padding=6)]
    status_items += [button("status-ring",24,228,132,36,"Ring Phone",command("phone.find"),"#2a2410",ORANGE),button("status-phone",172,228,132,36,"Phone",navigate("phone")),button("status-settings",320,228,136,36,"Settings",navigate("settings")),*nav_overlay()]
    screens.append({"id":"status","name":"Device & phone status","background":BLACK,"elements":status_items})

    trip_items=[
        text("trip-title",24,18,120,30,"Trip",17,WHITE,700),element("trip-icon","image",264,14,44,44,src=icon_path("gps","orange",44),background="transparent"),
        button("trip-trackback",320,18,136,34,"TrackBack",{"type":"command","command":"route.trackback","screen":"map"},"#17301d",GREEN),
        text("trip-summary",24,58,432,44,"{{trip.status|No active trip}}",13,TEXT,700,background=SURFACE,padding=8,verticalAlign="top"),
    ]
    metrics=[("speed","Speed","{{speedKmh|--}} km/h"),("max","Max","{{trip.max|--}}"),("avg","Avg","{{trip.avg|--}}"),("distance","Distance","{{trip.distance|--}}"),("time","Moving","{{trip.moving|--}}"),("compass","Compass","{{gps.heading_deg|--}} deg"),("altitude","Altitude","{{gps.altitude_m|--}} m")]
    for index,(key,label,value) in enumerate(metrics):
        x=24+(index%3)*146;y=112+(index//3)*48;trip_items += [text(f"trip-{key}-label",x,y,136,16,label,9,"#555555",700,background=SURFACE,align="center"),text(f"trip-{key}-value",x,y+16,136,28,value,14,TEXT,700,background=SURFACE,align="center")]
    for index,(label,cmd) in enumerate([("Start","trip.start"),("Pause","trip.pause"),("Resume","trip.resume"),("Reset","trip.reset")]):trip_items.append(button(f"trip-{label.lower()}",27+index*108,218,102,34,label,command(cmd),SURFACE,TEXT,10))
    trip_items += nav_overlay();screens.append({"id":"trip","name":"Trip recording","background":BLACK,"elements":trip_items})

    screens.append({"id":"waypoints","name":"Waypoints","background":BLACK,"elements":[
        text("waypoints-title",24,18,220,30,"Waypoints",17,WHITE,700),element("waypoints-icon","image",412,14,44,44,src=icon_path("gps","orange",44),background="transparent"),
        button("waypoints-save",24,64,432,44,"Save Current Location",command("waypoint.add")),text("waypoints-message",24,116,432,22,"{{waypointMessage|}}",11,GREEN,700,align="center"),
        text("waypoints-list",24,146,432,118,"{{waypointsText|No saved waypoints.}}",10,TEXT,background=SURFACE,padding=8,verticalAlign="top"),*nav_overlay(),
    ]})

    settings=[
        text("settings-title",24,18,200,30,"Settings",17,WHITE,700),element("settings-icon","image",412,14,44,44,src=icon_path("settings","orange",44),background="transparent"),
        text("settings-status",24,64,432,118,"Connection  {{connection.message|Disconnected}}\nPhone       {{phone.phone_name|iPhone}}  {{phone.battery_percent|--}}%\nWeather: {{weather.summary|No weather}}\nGPS: {{gps.lat|--}}, {{gps.lon|--}}\nSpeed      {{system.unit|kmh}}\nRoutes     1\nWaypoints  1",11,TEXT,background=SURFACE,padding=8,verticalAlign="top"),
        button("settings-kmh",24,196,100,38,"km/h",command("settings.unit.kmh")),button("settings-ms",136,196,100,38,"m/s",command("settings.unit.ms")),
        button("settings-reboot",252,196,92,38,"Reboot",navigate("confirm-reboot"),"#2a2410",YELLOW),button("settings-poweroff",356,196,100,38,"Power Off",navigate("confirm-poweroff"),"#351414","#ff8b8b"),
        text("settings-feedback",24,238,360,28,"{{system.message|}}",10,YELLOW),*nav_overlay(),
    ];screens.append({"id":"settings","name":"Settings & power","background":BLACK,"elements":settings})

    for screen_id,title,label,cmd,bg,fg in [
        ("confirm-reboot","Reboot ActiView?","Reboot","system.reboot","#2a2410",YELLOW),
        ("confirm-poweroff","Power off ActiView?","Power Off","system.poweroff","#351414","#ff8b8b"),
    ]:
        screens.append({"id":screen_id,"name":title,"background":BLACK,"elements":[
            element("confirm-panel","card",74,82,332,156,background="#050505",borderColor="#2a2a2a",borderWidth=1),text("confirm-title",74,104,332,34,title,18,WHITE,700,align="center"),
            text("confirm-copy",74,143,332,26,"Any active connection will close.",11,"#b8b8b8",align="center"),button("confirm-cancel",112,186,116,38,"Cancel",navigate("settings"),"#202020",WHITE),button("confirm-action",252,186,116,38,label,{"type":"command","command":cmd,"screen":"settings"},bg,fg),
        ]})

    phone=[text("phone-title",24,18,180,30,"Phone",17,WHITE,700),text("favorites-title",20,54,216,20,"Favorites",10,"#777777",700)]
    for index in range(4):phone.append(button(f"favorite-{index}",20,76+index*40,216,34,f"{{{{contacts.{index}.name|Contact}}}}",command(f"phone.call.{index}"),SURFACE,TEXT,12))
    phone += [text("dial-number",252,54,208,34,"{{dialNumber|Enter number}}",14,WHITE,700,align="center",background="#171717")]
    keys=["1","2","3","4","5","6","7","8","9","*","0","#"]
    for index,key in enumerate(keys):phone.append(button(f"dial-{index}",252+(index%3)*70,90+(index//3)*28,62,24,key,command(f"phone.digit.{key}"),SURFACE,TEXT,13))
    phone += [button("dial-call",252,202,96,28,"Call",command("phone.dial"),"#17301d",GREEN),button("dial-clear",364,202,96,28,"Clear",command("phone.clear")),button("phone-ring",24,230,132,34,"Ring Phone",command("phone.find"),"#2a2410",ORANGE),button("phone-contacts",172,230,132,34,"Contacts",navigate("contacts")),button("phone-accept",320,230,64,34,"Accept",command("phone.accept"),"#17301d",GREEN),button("phone-decline",392,230,68,34,"Decline",command("phone.decline"),"#351414","#ff8b8b"),text("phone-feedback",24,264,360,20,"{{phoneFeedback|}}",9,YELLOW),*nav_overlay()]
    screens.append({"id":"phone","name":"Phone & calls","background":BLACK,"elements":phone})

    contacts=[text("contacts-title",24,18,220,30,"Contacts",17,WHITE,700)]
    for index in range(6):contacts.append(button(f"contact-{index}",24+(index%2)*222,60+(index//2)*62,210,52,f"{{{{contacts.{index}.name|Contact}}}}\n{{{{contacts.{index}.number|}}}}",command(f"phone.call.{index}"),SURFACE,TEXT,11))
    contacts += nav_overlay();screens.append({"id":"contacts","name":"Contacts","background":BLACK,"elements":contacts})

    screens.append({"id":"sos","name":"SOS","background":BLACK,"elements":[
        text("sos-title",0,34,480,56,"SOS",44,"#ff4d4d",700,align="center"),text("sos-copy",0,92,480,30,"Relay emergency message through iPhone",13,WHITE,align="center"),
        button("sos-send",112,134,256,66,"SEND SOS",command("sos"),"#b51515",WHITE,24),text("sos-message",30,210,420,46,"{{sos.message|}}",11,"#ffcc00",align="center"),*nav_overlay(),
    ]})

    screens.append({"id":"airplay","name":"AirPlay","background":BLACK,"elements":[
        text("airplay-title",26,34,240,38,"AirPlay",24,WHITE,700),text("airplay-subtitle",28,70,240,24,"screen mirroring",12,ORANGE,700),
        text("airplay-status",28,108,424,96,"{{airplay.status}}",15,TEXT,background=SURFACE,padding=12,verticalAlign="top"),button("airplay-launch",28,222,132,40,"Launch",command("airplay.launch")),button("airplay-stop",178,222,132,40,"Stop",command("airplay.stop")),button("airplay-back",328,222,124,40,"Back",{"type":"command","command":"airplay.stop","screen":"home"}),*nav_overlay(),
    ]})
    screens.append({"id":"carplay","name":"CarPlay","background":BLACK,"elements":[
        text("carplay-title",26,34,240,38,"CarPlay",24,WHITE,700),text("carplay-subtitle",28,70,240,24,"optional app",12,ORANGE,700),
        text("carplay-status",28,108,424,96,"{{carplay.status}}",15,TEXT,background=SURFACE,padding=12,verticalAlign="top"),button("carplay-launch",28,222,132,40,"Launch",command("carplay.launch")),button("carplay-back",178,222,132,40,"Back",navigate("home")),*nav_overlay(),
    ]})
    screens.append({"id":"android-auto","name":"Android Auto","background":BLACK,"elements":[
        text("android-title",26,34,300,38,"Android Auto",24,WHITE,700),text("android-subtitle",28,72,240,24,"coming later",12,ORANGE,700),
        text("android-status",28,112,424,104,"Android Auto is not configured on this build.\nActiView's own dashboard stays available.",15,TEXT,background=SURFACE,padding=18,verticalAlign="top"),button("android-back",174,234,132,40,"Back",navigate("home")),*nav_overlay(),
    ]})

    screens.append({"id":"incoming-call","name":"Incoming call overlay","background":BLACK,"elements":[
        text("incoming-kind",0,34,480,32,"Incoming Call",18,ORANGE,700,align="center"),text("incoming-name",24,88,432,50,"{{call.name|Unknown}}",30,WHITE,700,align="center"),text("incoming-number",24,142,432,34,"{{call.number|}}",17,"#bbbbbb",align="center"),
        button("incoming-accept",54,218,160,56,"Accept",command("phone.accept"),"#17301d",GREEN,17,700,radius=0),button("incoming-decline",266,218,160,56,"Decline",command("phone.decline"),"#351414","#ff8b8b",17,700,radius=0),
    ]})

    return {
        "format":"actiview-project", "formatVersion":1, "runtimeVersion":"1.1.0",
        "name":"ActiView Current UI · 2026-05-24", "projectVersion":"2026.05.24-local-import",
        "sourceRevision":digest.hexdigest(),
        "source":{"kind":"active-local-tkinter","entrypoint":"actiview-rpi/ui/app.py","launch":"actiview-rpi/launch_ui.sh","displayService":"actiview-rpi/services/systemd/actiview_gui.service","verifiedFromLocalFiles":True,"liveDeviceVerified":False,"files":SOURCE_FILES},
        "display":{"width":480,"height":320,"orientation":"landscape","pixelRatio":1,"safeArea":{"top":0,"right":0,"bottom":0,"left":0}},
        "theme":{"background":BLACK,"surface":SURFACE,"surface2":"#e9e8e3","text":TEXT,"muted":"#777777","accent":ORANGE,"positive":GREEN,"danger":"#ff4d4d","fontFamily":"Helvetica, Arial, sans-serif"},
        "startScreen":"home", "screens":screens,
    }


def main() -> None:
    project = make_project()
    OUTPUT.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n")
    package = [
        {"source":"device.html","target":"device.html"},
        {"source":"device.js","target":"device.js"},
        {"source":"shared/runtime.js","target":"shared/runtime.js"},
        {"source":"shared/runtime.css","target":"shared/runtime.css"},
        {"source":"package-source/device_server.py","target":"device_server.py"},
        {"source":"package-source/launch_device.sh","target":"launch_device.sh"},
        {"source":"package-source/CODEX_INSTRUCTIONS.md","target":"CODEX_INSTRUCTIONS.md"},
        {"source":"package-source/SOURCE_IMPORT.md","target":"SOURCE_IMPORT.md"},
        {"source":"package-source/actiview-web.service","target":"systemd/actiview-web.service"},
    ]
    for path in sorted(item for item in (STUDIO / "web" / "assets").rglob("*") if item.is_file()):
        relative = path.relative_to(STUDIO / "web").as_posix()
        package.append({"source":relative,"target":relative})
    PACKAGE_LIST.write_text(json.dumps(package, separators=(",", ":")) + "\n")
    print(f"Imported {len(project['screens'])} editable screens from {len(SOURCE_FILES)} active UI files")
    print(f"Source revision: {project['sourceRevision']}")


if __name__ == "__main__":
    main()
