// Shelly Plus 1 Gen3 - Alarm Beeper for Shelly BLU devices
// VERSION 2.1.0 (KVS Soft-Fallback Config)
//
// FEATURES:
//   - Two arming modes: AWAY (2-stage ramp+long beep) and SLEEP (instant)
//   - Sleep mode uses a sensor subset (excludes motion + test sensors)
//   - Sleep mode has entry delay before alarm fires
//   - 4-button BLU device support (single-click ignored, triple/double/long handled)
//   - Context-aware triple-click (sleep arm when disarmed, disarm otherwise)
//   - Cloud notifications for arm/disarm/alarm via Shelly Cloud scenes
//   - Remote control via Script.Eval HTTP endpoints
//
// CONFIG STRATEGY:
//   Config values are loaded from KVS at startup with soft fallback to the
//   DEFAULTS block below. Empty/unset KVS keys leave the defaults in place.
//   Use setup-helper.html to populate KVS without editing the script.

// ==================================================================
// DEBUG: Set to true to dump raw BLE packets from 4-button device.
// ==================================================================
var DEBUG_4BUTTON = false;

// ==================================================================
// DEFAULTS (used as soft fallback when KVS keys are absent)
// ==================================================================
var DEFAULTS = {
  CLOUD: {
    SERVER: "shelly-XX-eu.shelly.cloud",
    AUTH: "PASTE_YOUR_AUTH_KEY_HERE",
    SCENES: {
      ALARM:    0,
      ARMED:    0,
      DISARMED: 0
    }
  },
  DEVICES: {
    BUTTONS: [],
    BUTTONS4: [],
    SENSORS: [],
    SLEEP_SENSORS: []
  }
};

// ---- Active config ----
var CONFIG = {
  CLOUD: {
    SERVER: DEFAULTS.CLOUD.SERVER,
    AUTH:   DEFAULTS.CLOUD.AUTH,
    SCENES: {
      ALARM:    DEFAULTS.CLOUD.SCENES.ALARM,
      ARMED:    DEFAULTS.CLOUD.SCENES.ARMED,
      DISARMED: DEFAULTS.CLOUD.SCENES.DISARMED
    }
  },
  DEVICES: {
    BUTTONS:       DEFAULTS.DEVICES.BUTTONS,
    BUTTONS4:      DEFAULTS.DEVICES.BUTTONS4,
    SENSORS:       DEFAULTS.DEVICES.SENSORS,
    SLEEP_SENSORS: DEFAULTS.DEVICES.SLEEP_SENSORS
  },
  TIMING: {
    BEEP_MS: 500,
    GAP_MS: 500,
    ALARM_ON_MS: 500,
    ALARM_OFF_MS: 500,
    ALARM_TIMEOUT_MS: 30000,
    ARM_DELAY_MS: 10000,
    FINAL_DELAY_MS: 3000,
    SLEEP_ENTRY_DELAY_MS: 5000,
    RAMP_END_FACTOR: 0.25,
    DISARM_BEEP_DELAY: 300
  }
};

// ---- Constants ----
var STAGE_NONE = 0;
var STAGE_1 = 1;
var STAGE_2 = 2;

var MODE_NONE  = "none";
var MODE_AWAY  = "away";
var MODE_SLEEP = "sleep";

var STATE_DISARMED    = "disarmed";
var STATE_ARMING      = "arming";
var STATE_ARMED_AWAY  = "armed_away";
var STATE_ARMED_SLEEP = "armed_sleep";
var STATE_ALARMING    = "alarming";

// ---- State ----
var armed = false;
var armMode = MODE_NONE;
var armPending = false;
var armPendingHandle = null;
var armStageStartMs = 0;
var armStage = STAGE_NONE;

var alarming = false;
var alarmTimeoutHandle = null;
var alarmTickHandle = null;
var alarmRelayState = false;

var entryPending = false;
var entryPendingHandle = null;
var entrySourceMac = null;

var lastPid = {};

var configReady = false;
var pendingKvsLoads = 0;

// ---- BTHome Field Length Lookup Table ----
var BTHOME_FIELD_LEN = {
  0x00: 1, 0x01: 1, 0x02: 2, 0x03: 2, 0x05: 3, 0x08: 2, 0x0A: 3,
  0x0C: 2, 0x10: 1, 0x11: 1, 0x15: 1, 0x1A: 1, 0x1F: 1, 0x20: 1,
  0x21: 1, 0x23: 1, 0x2D: 1, 0x3A: 1, 0x3C: 2, 0x3F: 2, 0x45: 2,
  0x51: 2, 0x58: 1
};

// ---- Helpers ----

function inList(mac, list) {
  var i;
  if (!list) return false;
  for (i = 0; i < list.length; i++) {
    if (list[i] === mac) return true;
  }
  return false;
}

function nowMs() {
  return Shelly.getUptimeMs ? Shelly.getUptimeMs() : Date.now();
}

function currentState() {
  if (alarming)   return STATE_ALARMING;
  if (armed)      return (armMode === MODE_SLEEP) ? STATE_ARMED_SLEEP : STATE_ARMED_AWAY;
  if (armPending) return STATE_ARMING;
  return STATE_DISARMED;
}

function updateStateKvs() {
  var s = currentState();
  Shelly.call("KVS.Set", { key: "alarm_state", value: s }, function (res, err, msg) {
    if (err !== 0) print("KVS.Set failed:", err, msg);
  });
}

function trimStr(s) {
  while (s.length > 0 && (s.at(0) === 0x20 || s.at(0) === 0x09)) s = s.slice(1);
  while (s.length > 0 && (s.at(s.length - 1) === 0x20 || s.at(s.length - 1) === 0x09)) s = s.slice(0, s.length - 1);
  return s;
}

function parseMacList(str) {
  if (!str || typeof str !== "string") return [];
  var parts = str.split(",");
  var out = [];
  var i, t;
  for (i = 0; i < parts.length; i++) {
    t = trimStr(parts[i]);
    if (t.length > 0) out.push(t);
  }
  return out;
}

// ---- KVS Config Loader (soft fallback) ----

function loadKvsString(key, target, field) {
  pendingKvsLoads++;
  Shelly.call("KVS.Get", { key: key }, function (res, err, msg) {
    pendingKvsLoads--;
    if (err === 0 && res && typeof res.value !== "undefined") {
      target[field] = res.value;
      print("KVS loaded", key, "=", (key.indexOf("auth") >= 0 ? "***" : res.value));
    } else {
      print("KVS", key, "not set - using default");
    }
    if (pendingKvsLoads === 0) finishConfigLoad();
  });
}

function loadKvsNumber(key, target, field) {
  pendingKvsLoads++;
  Shelly.call("KVS.Get", { key: key }, function (res, err, msg) {
    pendingKvsLoads--;
    if (err === 0 && res && typeof res.value !== "undefined") {
      target[field] = parseInt(res.value);
      print("KVS loaded", key, "=", target[field]);
    } else {
      print("KVS", key, "not set - using default");
    }
    if (pendingKvsLoads === 0) finishConfigLoad();
  });
}

function loadKvsMacList(key, target, field) {
  pendingKvsLoads++;
  Shelly.call("KVS.Get", { key: key }, function (res, err, msg) {
    pendingKvsLoads--;
    if (err === 0 && res && typeof res.value !== "undefined") {
      target[field] = parseMacList(res.value);
      print("KVS loaded", key, "=", target[field].length, "MAC(s)");
    } else {
      print("KVS", key, "not set - using default (", target[field].length, "MAC(s))");
    }
    if (pendingKvsLoads === 0) finishConfigLoad();
  });
}

function finishConfigLoad() {
  configReady = true;
  print("---------- Config loaded ----------");
  print("Cloud server:", CONFIG.CLOUD.SERVER);
  print("Auth set:", CONFIG.CLOUD.AUTH !== "PASTE_YOUR_AUTH_KEY_HERE" ? "yes" : "NO (placeholder)");
  print("Scenes: alarm=", CONFIG.CLOUD.SCENES.ALARM,
        " armed=", CONFIG.CLOUD.SCENES.ARMED,
        " disarmed=", CONFIG.CLOUD.SCENES.DISARMED);
  print("Buttons:", CONFIG.DEVICES.BUTTONS.length, JSON.stringify(CONFIG.DEVICES.BUTTONS));
  print("4-button device:", CONFIG.DEVICES.BUTTONS4.length, JSON.stringify(CONFIG.DEVICES.BUTTONS4));
  print("Sensors:", CONFIG.DEVICES.SENSORS.length);
  print("Sleep sensors:", CONFIG.DEVICES.SLEEP_SENSORS.length);
  print("DEBUG_4BUTTON:", DEBUG_4BUTTON);
  print("-----------------------------------");

  BLE.Scanner.Subscribe(onScan);
  BLE.Scanner.Start({ duration_ms: BLE.Scanner.INFINITE_SCAN, active: false });
  updateStateKvs();
  print("Beeper script v2.1.0 ready.");
}

// ---- Cloud ----

function fireCloudScene(sceneId, label) {
  if (!sceneId) {
    print("Cloud", label, "skipped - scene ID is 0 (not configured)");
    return;
  }
  var url = "https://" + CONFIG.CLOUD.SERVER + "/scene/manual_run" +
            "?auth_key=" + CONFIG.CLOUD.AUTH +
            "&id=" + JSON.stringify(sceneId);

  Shelly.call("HTTP.GET", { url: url, timeout: 10 }, function (res, err, msg) {
    if (err !== 0) print("Cloud", label, "FAILED, err=", err, "msg=", msg);
    else print("Cloud", label, "fired, HTTP", res.code);
  });
}

function fireCloudAlarm()    { fireCloudScene(CONFIG.CLOUD.SCENES.ALARM, "ALARM"); }
function notifyArmed()       { fireCloudScene(CONFIG.CLOUD.SCENES.ARMED, "ARMED notify"); }
function notifyDisarmed()    { fireCloudScene(CONFIG.CLOUD.SCENES.DISARMED, "DISARMED notify"); }

// ---- Status / remote control ----

function sendStatus() {
  var s = currentState();
  print("Status query -> state:", s);
  if (s === STATE_DISARMED) notifyDisarmed();
  else                      notifyArmed();
  return s;
}

function armRemote() {
  print("REMOTE ARM (away) requested");
  if (armed || armPending) {
    print("Already armed or arming - ignored");
    return "already_armed_or_arming";
  }
  print("ARMING (remote) -> stage 1:", CONFIG.TIMING.ARM_DELAY_MS / 1000,
        "s, stage 2:", CONFIG.TIMING.FINAL_DELAY_MS / 1000, "s");
  startAwayArming();
  return "arming_started_away";
}

function armSleepRemote() {
  print("REMOTE ARM (sleep) requested");
  if (armed || armPending) {
    print("Already armed or arming - ignored");
    return "already_armed_or_arming";
  }
  startSleepArming("REMOTE");
  return "armed_sleep";
}

function disarmRemote() {
  print("REMOTE DISARM requested");
  var didDisarm = performDisarm("REMOTE");
  if (!didDisarm) {
    print("Already disarmed - double long confirmation beep");
    doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
    return "already_disarmed";
  }
  return "disarmed";
}

// ---- Relay & Audio ----

function relayOn()  { Shelly.call("Switch.Set", { id: 0, on: true  }); }
function relayOff() { Shelly.call("Switch.Set", { id: 0, on: false }); }

function singleBeep() {
  if (alarming) return;
  relayOn();
  Timer.set(CONFIG.TIMING.BEEP_MS, false, relayOff);
}

function longBeep(duration) {
  if (alarming && duration < CONFIG.TIMING.ALARM_TIMEOUT_MS) return;
  relayOn();
  Timer.set(duration, false, relayOff);
}

function doubleLongBeep(duration) {
  if (alarming && duration < CONFIG.TIMING.ALARM_TIMEOUT_MS) return;
  relayOn();
  Timer.set(duration, false, function () {
    relayOff();
    Timer.set(CONFIG.TIMING.GAP_MS, false, function () {
      relayOn();
      Timer.set(duration, false, relayOff);
    });
  });
}

// ---- Away Mode Arming ----

function startAwayArming() {
  armPending = true;
  armMode = MODE_NONE;
  armStage = STAGE_1;
  armStageStartMs = nowMs();
  updateStateKvs();
  stage1Tick(true);
}

function stage1Tick(beepOn) {
  if (!armPending || armStage !== STAGE_1) {
    print("Stage 1 cancelled or skipped");
    relayOff();
    return;
  }

  var elapsed = nowMs() - armStageStartMs;
  if (elapsed >= CONFIG.TIMING.ARM_DELAY_MS) {
    relayOff();
    print("Stage 1 elapsed -> stage 2 (one long beep)");
    advanceToStage2();
    return;
  }

  var progress = elapsed / CONFIG.TIMING.ARM_DELAY_MS;
  var factor = 1.0 - progress * (1.0 - CONFIG.TIMING.RAMP_END_FACTOR);
  var dur = beepOn ? (CONFIG.TIMING.BEEP_MS * factor) : (CONFIG.TIMING.GAP_MS * factor);
  if (dur < 30) dur = 30;

  if (beepOn) relayOn();
  else        relayOff();

  armPendingHandle = Timer.set(dur, false, function () { stage1Tick(!beepOn); });
}

function advanceToStage2() {
  if (armPendingHandle !== null) {
    Timer.clear(armPendingHandle);
    armPendingHandle = null;
  }
  relayOff();
  armStage = STAGE_2;
  armStageStartMs = nowMs();
  stage2Start();
}

function stage2Start() {
  if (!armPending || armStage !== STAGE_2) {
    print("Stage 2 cancelled");
    relayOff();
    return;
  }
  relayOn();
  armPendingHandle = Timer.set(CONFIG.TIMING.FINAL_DELAY_MS, false, function () {
    relayOff();
    if (!armPending || armStage !== STAGE_2) {
      print("Stage 2 finished but arming was cancelled - aborting");
      return;
    }
    armPendingHandle = null;
    armPending = false;
    armStage = STAGE_NONE;
    armed = true;
    armMode = MODE_AWAY;
    print("ARMED AWAY (stage 2 elapsed) -> system live + armed push");
    notifyArmed();
    updateStateKvs();
  });
}

// ---- Sleep Mode Arming ----

function startSleepArming(sourceMac) {
  print("ARMING SLEEP by", sourceMac, "-> instant arm");
  armed = true;
  armMode = MODE_SLEEP;
  armPending = false;
  armStage = STAGE_NONE;
  singleBeep();
  notifyArmed();
  updateStateKvs();
}

// ---- Alarm ----

function alarmTick() {
  alarmRelayState = !alarmRelayState;
  if (alarmRelayState) {
    relayOn();
    alarmTickHandle = Timer.set(CONFIG.TIMING.ALARM_ON_MS, false, alarmTick);
  } else {
    relayOff();
    alarmTickHandle = Timer.set(CONFIG.TIMING.ALARM_OFF_MS, false, alarmTick);
  }
}

function startAlarm(sourceMac) {
  if (!armed) {
    print("startAlarm called but not armed - aborting (push suppressed)");
    return;
  }
  if (alarming) return;

  print("ALARM by", sourceMac, "(mode:", armMode + ") -> beeping for",
        CONFIG.TIMING.ALARM_TIMEOUT_MS / 1000, "s + cloud push");
  fireCloudAlarm();

  alarming = true;
  alarmRelayState = false;
  alarmTick();
  updateStateKvs();

  alarmTimeoutHandle = Timer.set(CONFIG.TIMING.ALARM_TIMEOUT_MS, false, function () {
    print("Alarm timeout reached, stopping.");
    stopAlarm();
    updateStateKvs();
  });
}

function stopAlarm() {
  if (!alarming) return;
  alarming = false;
  if (alarmTickHandle    !== null) { Timer.clear(alarmTickHandle);    alarmTickHandle    = null; }
  if (alarmTimeoutHandle !== null) { Timer.clear(alarmTimeoutHandle); alarmTimeoutHandle = null; }
  relayOff();
}

// ---- Disarm ----

function performDisarm(sourceMac) {
  var didSomething = false;

  if (armPendingHandle !== null) {
    Timer.clear(armPendingHandle);
    armPendingHandle = null;
    didSomething = true;
    print("Arming cancelled by", sourceMac);
  }

  if (entryPendingHandle !== null) {
    Timer.clear(entryPendingHandle);
    entryPendingHandle = null;
    entryPending = false;
    entrySourceMac = null;
    didSomething = true;
    print("Entry delay cancelled by", sourceMac);
  }

  if (alarming) {
    stopAlarm();
    didSomething = true;
    print("Alarm stopped by", sourceMac);
  }

  var wasArmed = armed;
  armed = false;
  armMode = MODE_NONE;
  armPending = false;
  armStage = STAGE_NONE;
  relayOff();

  if (wasArmed || didSomething) {
    print("DISARMED by", sourceMac, "-> double long beep + disarmed push");
    notifyDisarmed();
    updateStateKvs();
    Timer.set(CONFIG.TIMING.DISARM_BEEP_DELAY, false, function () {
      doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
    });
    return true;
  }
  return false;
}

// ---- Click Handler ----

function handleClick(clickType, sourceMac, fromButton) {
  var label;
  var didDisarm;

  if (clickType === 1) {
    if (!fromButton) {
      print("Single click on 4-button device", sourceMac, "- ignored by script");
      return;
    }

    if (armed) {
      print("Single click while ARMED by", sourceMac, "-> warning beep");
      singleBeep();
      return;
    }

    if (armPending && armStage === STAGE_1) {
      print("Single click during STAGE 1 by", sourceMac, "-> skip to stage 2");
      advanceToStage2();
      return;
    }

    if (armPending) {
      print("Already arming in stage 2 (from", sourceMac + ") - ignored");
      return;
    }

    print("ARMING AWAY by", sourceMac, "-> stage 1:", CONFIG.TIMING.ARM_DELAY_MS / 1000,
          "s, stage 2:", CONFIG.TIMING.FINAL_DELAY_MS / 1000, "s");
    startAwayArming();

  } else if (clickType === 3) {
    print("Triple click from", sourceMac);

    if (armed || armPending || alarming) {
      didDisarm = performDisarm(sourceMac);
      if (!didDisarm) {
        doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
      }
    } else {
      startSleepArming(sourceMac);
    }

  } else if (clickType === 2 || clickType === 4) {
    label = (clickType === 4 ? "long" : "double");
    print("Click type", label, "from", sourceMac);

    didDisarm = performDisarm(sourceMac);
    if (!didDisarm) {
      print("Already disarmed - double long confirmation beep");
      doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
    }
  }
}

// ---- Sensor Handler ----

function handleSensor(data, sourceMac) {
  var triggered = false;
  var reason = "";

  if (!armed) return;
  if (alarming) return;

  if (armMode === MODE_SLEEP && !inList(sourceMac, CONFIG.DEVICES.SLEEP_SENSORS)) {
    return;
  }

  if (data.motion === 1) { triggered = true; reason = "motion"; }
  else if (data.door === 1) { triggered = true; reason = "door open"; }
  else if (data.window === 1) { triggered = true; reason = "window open"; }

  if (!triggered) return;

  if (armMode === MODE_SLEEP) {
    if (entryPending) return;

    print("SENSOR triggered by", sourceMac, "(" + reason + ") -> entry delay",
          CONFIG.TIMING.SLEEP_ENTRY_DELAY_MS / 1000, "s");
    entryPending = true;
    entrySourceMac = sourceMac;
    entryPendingHandle = Timer.set(CONFIG.TIMING.SLEEP_ENTRY_DELAY_MS, false, function () {
      entryPendingHandle = null;
      var src = entrySourceMac;
      entryPending = false;
      entrySourceMac = null;
      if (!armed) return;
      print("Entry delay elapsed -> alarm");
      startAlarm(src);
    });
  } else {
    print("SENSOR triggered by", sourceMac, "(" + reason + ") -> alarm immediately");
    startAlarm(sourceMac);
  }
}

// ---- BTHome Parser ----

function bthomeFieldLen(id) {
  var v = BTHOME_FIELD_LEN[id];
  if (typeof v === "undefined") return -1;
  return v;
}

function parseBTHome(serviceData, sourceMac) {
  var i, id, len, header, out;
  var buttonEvents = [];

  if (typeof serviceData !== "string" || serviceData.length < 3) return null;
  header = serviceData.at(0);
  if (header !== 0x40 && header !== 0x44) return null;

  i = 1;
  out = {};
  while (i < serviceData.length) {
    id = serviceData.at(i); i++;
    len = bthomeFieldLen(id);

    if (len < 0) {
      print("Unknown BTHome field id 0x" + id.toString(16), "from", sourceMac, "- stopping parse");
      break;
    }

    if (i + len > serviceData.length) break;

    if      (id === 0x00) out.pid     = serviceData.at(i);
    else if (id === 0x01) out.battery = serviceData.at(i);
    else if (id === 0x21) out.motion  = serviceData.at(i);
    else if (id === 0x2D) out.window  = serviceData.at(i);
    else if (id === 0x1A) out.door    = serviceData.at(i);
    else if (id === 0x3A) buttonEvents.push(serviceData.at(i));

    i += len;
  }

  if (buttonEvents.length === 1) {
    out.button = buttonEvents[0];
  } else if (buttonEvents.length > 1) {
    out.buttons = buttonEvents;
  }
  return out;
}

function extractMultiButtonEvent(buttons) {
  var i;
  if (!buttons) return 0;
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i] > 0) return buttons[i];
  }
  return 0;
}

// ---- BLE Scan Callback ----

function onScan(ev, res) {
  var svc, data, mac, evt, i, hex, b;

  if (ev !== BLE.Scanner.SCAN_RESULT) return;
  if (!res || !res.addr || !res.service_data) return;

  svc = res.service_data["fcd2"];
  if (!svc) return;

  if (DEBUG_4BUTTON && inList(res.addr, CONFIG.DEVICES.BUTTONS4)) {
    hex = "";
    for (i = 0; i < svc.length; i++) {
      b = svc.at(i);
      hex += (b < 16 ? "0" : "") + b.toString(16) + " ";
    }
    print("4-BUTTON RAW [" + res.addr + "]:", hex);
  }

  data = parseBTHome(svc, res.addr);
  if (!data) return;

  mac = res.addr;

  if (typeof data.pid !== "undefined") {
    if (lastPid[mac] === data.pid) return;
    lastPid[mac] = data.pid;
  }

  if (inList(mac, CONFIG.DEVICES.BUTTONS)) {
    if (typeof data.button === "undefined") return;
    if (data.button === 0) return;
    handleClick(data.button, mac, true);
  }
  else if (inList(mac, CONFIG.DEVICES.BUTTONS4)) {
    evt = extractMultiButtonEvent(data.buttons);
    if (evt === 0) {
      if (typeof data.button !== "undefined" && data.button > 0) {
        evt = data.button;
      }
    }
    if (evt === 0) return;
    if (DEBUG_4BUTTON) print("4-BUTTON event:", evt, "from", mac);
    handleClick(evt, mac, false);
  }
  else if (inList(mac, CONFIG.DEVICES.SENSORS)) {
    handleSensor(data, mac);
  }
}

// ---- Initialization ----

print("Beeper script v2.1.0 starting - loading config from KVS...");

loadKvsString("cfg.cloud_server",    CONFIG.CLOUD,        "SERVER");
loadKvsString("cfg.cloud_auth",      CONFIG.CLOUD,        "AUTH");
loadKvsNumber("cfg.scene_alarm",     CONFIG.CLOUD.SCENES, "ALARM");
loadKvsNumber("cfg.scene_armed",     CONFIG.CLOUD.SCENES, "ARMED");
loadKvsNumber("cfg.scene_disarmed",  CONFIG.CLOUD.SCENES, "DISARMED");
loadKvsMacList("dev.buttons",        CONFIG.DEVICES,      "BUTTONS");
loadKvsMacList("dev.buttons4",       CONFIG.DEVICES,      "BUTTONS4");
loadKvsMacList("dev.sensors",        CONFIG.DEVICES,      "SENSORS");
loadKvsMacList("dev.sleep_sensors",  CONFIG.DEVICES,      "SLEEP_SENSORS");
