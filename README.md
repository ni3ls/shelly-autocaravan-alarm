# Shelly Alarm - PUBLIC
=======
This project contain the sourcecode needed to run a custom alarm system script for **Shelly Plus 1 Gen3** using Shelly BLU devices (BLU Buttons, BLU Door/Window, BLU Motion, etc).

The project runs entirely on the Shelly device's mJS scripting runtime. No external server required. Cloud notifications via Shelly Smart Control scenes.

This may be used in your Autocaravan. We use it and it works just fine. It may most likely be adapted to meet your needs as well.

These scripts is submitted as Open Source for you to use as you want - Suggestions and corrections are very welcome. Use on your own discression and risk.
=======
FOR A PUBLIC UNEXPLAINED BRANCH SEE https://github.com/ni3ls/autocaravan-alarm-shelly

## Reference diagram

![Image](Shelly_alarm.jpg)


The diagram above shows the overall topology:

- **Shelly Plus 1 Gen3** is wired to a **12V buzzer** via its relay output and a 12V supply (GND + 12V+).
- **WiFi** connects the Shelly device to a **router**, providing internet access for Shelly Cloud scene calls (alarm push, armed/disarmed notifications).
- **BLE** is used to receive events from BLU devices in range:
  - 2 × **Shelly BLU Button 1** (primary user controls: arm/disarm).
  - 1 × **Shelly BLU 4-Button** (v2 only, additional control surface).
  - **Shelly BLU Door/Window** sensor(s) and **Shelly BLU Motion** sensor — the alarm triggers.

There are no wires between the Shelly Plus 1 Gen3 and the BLU devices — all sensor and button events arrive as Bluetooth Low Energy advertisements that the script's BLE scanner picks up and parses (BTHome v2).

The source `.drawio` is editable in [drawio.com](https://app.diagrams.net) if you want to adapt it.

## Repository layout

```
shelly-autocaravan-alarm/
├── README.md
├── Shelly_alarm_drawio.svg        ← reference diagram (above)
├── setup-helper.html              ← KVS configuration UI (open locally in a browser)
├── docs/
│   └── example-kvs-values.md      ← dummy example values for reference
├── v1-simple/
│   └── alarm-v1.3.0.js            ← single-mode alarm
└── v2-advanced/
    └── alarm-v2.1.0.js            ← + sleep mode, + 4-button device
```

The project published here require some programming skills and understanding of how Shelly work, as well as how to design the flows needed. It is published "as is" for you to use.

IF you want assistance in creating and designing a system that match your specific needs as an "out of the box" solution, I would love to create such a system for you.

Pricing for this is 100% transparant and serve only to cover my time for this. See in the end of this description


## Reference diagram

![Image](Shelly_alarm.jpg)

The diagram above shows the overall topology as an example. The number and type of devices may be adjusted to meet your specific needs.

**Here is an explanation of the parts on the diagram:**

...
### GATEWAY
The "brain" in the system is the Shelly PLUS 1 Gen3 (or Gen4) that contain the scripts needed and interconnect between the Wifi, the Cloud and the BLE sensors. It also controll the buzzer (or whatever you want to control)
(https://www.shelly.com/products/shelly-1-gen3)

### SENSORS:

In our case, We wanted all doors and windows to be protected by a Shelly "Door device" (https://www.shelly.com/products/shelly-blu-door-window-zb-white)

We also wanted the rooms in the autocaravan to be protected against movements inside the van (in case someone managed to bypass the door/window devices) - For this we used the Shelly "Motion sense devices" (https://www.shelly.com/products/shelly-blu-motion)

Many other types of sensors could be added as desired, this just reflect a typical need.

...
### CONTROLLERS:

To control the system, we found it useful to have some keyring buttons - one for each member of the family. We used the old "flimsy" version that today is replaced with a sturdy "tough" version: https://www.shelly.com/products/shelly-blu-button-tough-1-ivory

For "Night sleep mode" (Or "Dog home alone mode") we added a 4 button device we already had controlling other stuff (A lamp that is irritating to turn off at night). This simply to be able to turn off an alarm without heving the button within reach as this is reachable from the bed. (https://www.shelly.com/products/shelly-blu-wall-switch-4-stand-alone-bundle)

Any Shelly type controller would be useable to control the system

...
### ACTION / ALERTING:

We desided against using the horn as our experience is that this is not really discouraging any thieves anyway - it does however cause enormous amounts of annoyance in case of misfire or accidental activation.
We added a simple buzzer to inform audible what is going on. Also in case of compromise, this will sound a "quiet" but noticable alarm to inform the thief that they are busted. As we also have a camera system, they will most likely just leave to avoid further problems.

The "Buzzer" may be replaced by a relay controlling whatever you want. I am considering a fog system as people surely will notice a "van on fire covered in smoke" - and the thieves will not be able to see anything.
This is up to you to deside "what to happen" - you WILL be alerted on the phone unless the wifi network is blocked.

...
### CONNECTIVITY:

The Gateway rely on a Wifi connection to alert externally. The system may work autonomously without any network access but we have a router in the van anyway.

The sensors are all connected to the gateway using BLE (Bluetooth). Shelly claim that the coverage distance is up to 75m. We only need 10 :-)

The Gateway (Shelly Plus 1 Gen3 - https://www.shelly.com/products/shelly-1-gen3) require a 12V powersupply. 
It consumes around 1.2 W. That mean that with a 100Ah battery it would last more than a month. Add to that the 10 W our router consume and our 300Ah Lithium would survive at least 10 days without any supporting systems. We have a 120W solar panel and there is no noticable consumption when that is connected (selfsustaining 100%)

...
### WEAK POINTS:
- If someone jam the wifi and BLE frequencies, the system would not work.
- If the thieves found our activation key and hacked the system locally (parked next to us) the system would fail.
- The Shelly system is not "industry grade equipment" and could of cause fail.
- The software running the alarm is not certified ISO27001 and is not bulletproof.

We find it useful anyway.


### SUMMARY OF THE SYSTEM:
- **Shelly Plus 1 Gen3** is wired to a **12V buzzer** via its relay output and a 12V supply (GND + 12V+).
- **WiFi** connects the Shelly device to a **router**, providing internet access for Shelly Cloud scene calls (alarm push, armed/disarmed notifications).
- **BLE** is used to receive events from BLU devices in range:
  - 2 × **Shelly BLU Button 1** (primary user controls: arm/disarm).
  - 1 × **Shelly BLU 4-Button** (v2 only, additional control surface).
  - **Shelly BLU Door/Window** sensor(s) and **Shelly BLU Motion** sensor — the alarm triggers.

There are no wires between the Shelly Plus 1 Gen3 and the BLU devices — all sensor and button events arrive as Bluetooth Low Energy advertisements that the script's BLE scanner picks up and parses (BTHome v2).

### 2 DIFFERENT VERSIONS
There are 2 versions available:
- SIMPLE - Featuring: ARM / DISARM / ALERT - A normal alarm system
- ADVANCED - Featuring: ARM / DISARM / SLEEP / ALERT - Facilitating 2 modes:
    - ARMED - like SIMPLE
    - SLEEP - Reduced set of sensors armed.

The advanced mode is for people with dogs and the need to secure the perimeter while inside the car.

We do not have a dog. Nether are we afraid that someone would climb into our wan while we are asleep. So we use the "Simple" Edition only

### ACTIVATION PATTERNS:
The system is controlled using the buttons in certain patterns.
- SINGLE CLICK SHORT: Activate the alarm
- DOUBLE CLICK SHORT: Deactivate the alarm in any state
- TRIPLE CLICK SHORT: Deactivate the alarm in ARM state - SLEEP mode if disarmed - ADVANCED mode only
- SINGLE CLICK LONG: Deactivate the alarm in any state

To arm the alarm - single short click
To arm in SLEEP mode, triple click is used (when system is disarmed) - ADVANCED mode only
To disarm the alarm when armed - double click, tripple click, long click

This setup is 100% Costumizable but we opted for the pattern above

### ALARM SOUNDS (Buzzer):
If the alarm is armed (single click) - the initial stage is a series of beeps with shorter and shorter delays.
This is per default 10 seconds.
Stage 2 is a long continous warning beeb signalling that the system is almost armed.
After that, the system is armed and silent.

#### ARMING
While armed, if the single click is pressed, the buzzer confirms with a short beep and the system remains armed

#### DISARMED
When deacticated by double, tripple or long click, the buzzer confirm this by a long double beep

#### SLEEP
If the system is in sleep state, the system responds with a single beep if armed

** DOUBLE LONG BEEP ALWAYS CONFIRM DEACTIVATED **

## AVAILABILITY:
As said, the system is open source and if you know how to adapt to your needs, feel free to use it.
If you want a "turn key" system to mount yourself, I will send you a preinstalled system and all the needed devices to install it.
As part of this, I will offer installation assistance (remote) and after sales support in either a subscription model including all needed updates as they become available, or a per hour T&M model.

## PRICE:

### BASE PRICE (SIMPLE)
- 1x Shelly Plus 1 GENx (3 or 4)
- Box with buzzer and 12v connection cable with fuse
- Base setup (Simple)
- Setup Cloud and gateway
    - Predefined Shelly Cloud (free) subscription to hold the scenes and alarms.
    - Preconfigured and up to 1 hour online setup assistance
Price: €100,-

### MODEL 1 - SIMPLE SMALL
- Base box + setup (Simple - see above)
- 2x door sensors for the garage
- 1x Room motion sensor
- 2x Tough buttons
Price: €200,-


### MODEL 2 - SIMPLE MEDIUM
- Base box + setup (Simple - see above)
- 5x door sensors for the garage
- 1x Room motion sensor
- 3x Tough buttons
Price: €300,-

### BASE PRICE (ADVANCED)
- 1x Shelly Plus 1 GENx (3 or 4)
- Box with buzzer and 12v connection cable with fuse
- Base setup (Advanced)
- Setup Cloud and gateway
    - Predefined Shelly Cloud (free) subscription to hold the scenes and alarms.
    - Preconfigured with Advanced setup and up to 1,5 hour online setup assistance
Price: €150,-

### MODEL 3 - ADVANCED SMALL
- Base box + setup (Simple - see above)
- 2x door sensors for the garage
- 1x Room motion sensor
- 2x Tough buttons
Price: €250,-


### MODEL 4 - ADVANCED MEDIUM
- Base box + setup (Simple - see above)
- 5x door sensors for the garage
- 1x Room motion sensor
- 3x Tough buttons
Price: €350,-

### ADDITIONAL DEVICES
If you need more devices (sensors or buttons) than the standard setup's above, here is a price list for these configured and added to your setup:

- 1x door sensor: €25,-
- 1x Room motion sensor: €30,-
- 1x Tough buttons: €25,-
- 1x 4-button: €25,-

### SHIPMENT
The complete set will be configured and shipped using any appropriate agency. Please request a quote


...


## Versions

### `v1-simple/alarm-v1.3.0.js`

Single-mode alarm system.

- Single-press to begin a 2-stage away arming sequence (10s ramp-up beeps + 3s long beep).
- Long / double / triple press to disarm.
- Single press while armed → audible warning beep.
- Sensor while armed → 30s local alarm + priority push notification.
- KVS state mirror for external inspection.

### `v2-advanced/alarm-v2.1.0.js`

Adds to v1.3.0:

- **Sleep mode** for autocamper / overnight use: instant arm with sensor subset (motion + test sensors excluded), 5s entry delay before alarm fires.
- **4-button BLU device** support (`BUTTONS4` list). Single-click on 4-button device is silently ignored; triple / double / long behave like the regular buttons.
- **Context-aware triple-click**: sleep-arm when disarmed, disarm when armed/arming/alarming.
- **Distinct states** for `armed_away` vs `armed_sleep`


## Configuration: KVS soft fallback

Both scripts use a soft-fallback configuration strategy. At startup the script reads its config from the device's **Key-Value Store (KVS)**. If a key is missing, the script falls back to baked-in defaults defined in the script's `DEFAULTS` block.

This lets you keep secrets (cloud auth key, scene IDs) and device-specific MAC addresses on the device itself, rather than in the committed source code.

### KVS keys read at startup

| Key | Type | Purpose | Used by |
|---|---|---|---|
| `cfg.cloud_server` | string | Shelly Cloud hostname (e.g. `shelly-XX-eu.shelly.cloud`) | both |
| `cfg.cloud_auth` | string | Shelly Cloud auth key | both |
| `cfg.scene_alarm` | number | Scene ID for the priority alarm push | both |
| `cfg.scene_armed` | number | Scene ID for "armed" notification push | both |
| `cfg.scene_disarmed` | number | Scene ID for "disarmed" notification push | both |
| `dev.buttons` | string (CSV) | MAC addresses of single BLU Button 1 devices | both |
| `dev.sensors` | string (CSV) | MAC addresses of all alarm-triggering BLU sensors | both |
| `dev.buttons4` | string (CSV) | MAC of the 4-button BLU device | v2 only |
| `dev.sleep_sensors` | string (CSV) | Subset of sensors that remain active in sleep mode | v2 only |

The runtime key `alarm_state` is also written by the script to mirror the current state (`disarmed` / `arming` / `armed` / `armed_away` / `armed_sleep` / `alarming`).

See [docs/example-kvs-values.md](docs/example-kvs-values.md) for concrete dummy examples.

### Setting KVS values

Two options:

**Option A: setup-helper.html (recommended)**

Open `setup-helper.html` in any browser on your local network. Fill in the form fields, click **Generate URLs**, then either tap each URL one by one or use **Run all** to open them in sequence. Each URL writes one KVS key on the device.

The page runs entirely in your browser — it generates URLs, it doesn't send anything anywhere except to your Shelly device when you click a link.

**Option B: manual KVS.Set URLs**

Open these URLs in a browser (one per key), substituting your own values:

```
http://<device-ip>/rpc/KVS.Set?key=cfg.cloud_server&value=shelly-XX-eu.shelly.cloud
http://<device-ip>/rpc/KVS.Set?key=cfg.cloud_auth&value=YOUR_AUTH_KEY
http://<device-ip>/rpc/KVS.Set?key=cfg.scene_alarm&value=1770000000001
http://<device-ip>/rpc/KVS.Set?key=cfg.scene_armed&value=1770000000002
http://<device-ip>/rpc/KVS.Set?key=cfg.scene_disarmed&value=1770000000003
http://<device-ip>/rpc/KVS.Set?key=dev.buttons&value=aa:bb:cc:dd:ee:01,aa:bb:cc:dd:ee:02
http://<device-ip>/rpc/KVS.Set?key=dev.sensors&value=aa:bb:cc:dd:ee:10,aa:bb:cc:dd:ee:11
```

Plus, for v2.1.0:

```
http://<device-ip>/rpc/KVS.Set?key=dev.buttons4&value=aa:bb:cc:dd:ee:20
http://<device-ip>/rpc/KVS.Set?key=dev.sleep_sensors&value=aa:bb:cc:dd:ee:10
```

Each request returns `{"etag":"...", "rev":...}` on success.

## Hardware

See the reference diagram at the top of this README for the physical topology.

- Shelly Plus 1 Gen3 (runs the script, drives the beeper relay)
- 12V buzzer wired to the Shelly's relay output (audible local alarm) - Replase as desired
- Shelly BLU Button 1 — primary user controls (single-click to arm, long/double press to disarm)
- Shelly BLU 4-button (v2 only) — additional control surface OPTIONAL
- BLU sensors (door/window, motion, etc.) — alarm triggers
- BLU Door/Window sensor — kept permanently "closed", required by Shelly's alarm scene UI to satisfy the "scene must have a trigger device" rule

## Cloud setup

Three cloud scenes in the Shelly Smart Control app:

| Scene | Purpose |
|---|---|
| Alarm | Priority push when intruder detected — must have a (dummy) BLU device as its trigger, stays armed (green shield) in the app |
| Armed notification | Informational "system armed" push |
| Disarmed notification | Informational "system disarmed" push |

The script invokes each scene via `/scene/manual_run` over HTTPS. Scene IDs are stored in KVS (see above).

## Remote control endpoints (local network)

```
http://<device-ip>/rpc/Script.Eval?id=<script-id>&code=armRemote()
http://<device-ip>/rpc/Script.Eval?id=<script-id>&code=armSleepRemote()  (v2 only)
http://<device-ip>/rpc/Script.Eval?id=<script-id>&code=disarmRemote()
http://<device-ip>/rpc/Script.Eval?id=<script-id>&code=sendStatus()
http://<device-ip>/rpc/KVS.Get?key=alarm_state
```

These can be bookmarked on phone home screens for one-tap control. If you enable web UI authentication in the device settings, bookmarks need basic-auth credentials embedded.

## Installation

1. Open the Shelly Plus 1 Gen3 web UI (`http://<device-ip>`).
2. Go to *Scripts → Add script*.
3. Paste the contents of `v1-simple/alarm-v1.3.0.js` or `v2-advanced/alarm-v2.1.0.js`.
4. *Save → Start → enable "Run on startup"*.
5. Open `setup-helper.html` and populate the KVS keys for your environment.
6. Restart the script (*Stop → Start*) so it reads the new KVS values.

The script will run with the baked-in defaults if KVS is empty — useful for first install. Once KVS is populated, the script picks up those values on next startup.

## License

Personal use. No warranty.
