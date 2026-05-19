// Shelly Plus 1 Gen3 - Alarm Beeper for Shelly BLU devices
// VERSION 1.3.0 (KVS Soft-Fallback Config)
//
// CONFIG STRATEGY:
//   Sensitive values (cloud auth, scene IDs) and device MAC lists can be
//   stored in the device's KVS so they don't have to live in the source code.
//   At startup the script reads KVS values; if a key is missing, it falls
//   back to the baked-in DEFAULTS below. This means the script always runs,
//   even on a fresh device with empty KVS, using the defaults.
//
//   To populate KVS, open setup-helper.html in a browser and run the URLs.
//
// FIXES IN THIS VERSION:
// - Replaced hasOwnProperty with typeof check for BTHOME_FIELD_LEN
// - Comma-separated print() arguments for safety
// - var declarations for MJS compatibility
// - Updated ALARM scene ID

// ==================================================================
// DEFAULTS (used as soft fallback when KVS keys are absent)
// EDIT THESE for your environment before installing.
// ==================================================================
var DEFAULTS = {
  CLOUD: {
    SERVER: "shelly-XX-eu.shelly.cloud",
    AUTH: "PASTE_YOUR_AUTH_KEY_HERE",
    SCENES: {
      ALARM:    0,   // your "intruder alarm" scene ID
      ARMED:    0,   // your "armed notification" scene ID
      DISARMED: 0    // your "disarmed notification" scene ID
    }
  },
  DEVICES: {
    BUTTONS: [
      // "aa:bb:cc:dd:ee:01"
    ],
    SENSORS: [
      // "aa:bb:cc:dd:ee:10"
    ]
  }
};

// ---- Active config (populated from KVS + defaults at startup) ----
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
    BUTTONS: DEFAULTS.DEVICES.BUTTONS,
    SENSORS: DEFAULTS.DEVICES.SENSORS
  },
  TIMING: {
    BEEP_MS: 500,
    GAP_MS: 500,
    ALARM_ON_MS: 500,
    ALARM_OFF_MS: 500,
    ALARM_TIMEOUT_MS: 30000,
    ARM_DELAY_MS: 10000,
    FINAL_DELAY_MS: 3000,
    RAMP_END_FACTOR: 0.25,
    DISARM_BEEP_DELAY: 300
  }
};

// ---- State Variables ----
var armed = false;
var armPending = false;
var armPendingHandle = null;
var armStageStartMs = 0;
var armStage = 0;

var alarming = false;
var alarmTimeoutHandle = null;
var alarmTickHandle = null;
var alarmRelayState = false;

var lastPid = {};

var configReady = false;
var pendingKvsLoads = 0;

// ---- Constants ----
var STAGE_NONE = 0;
var STAGE_1 = 1;
var STAGE_2 = 2;

var STATE_DISARMED = "disarmed";
var STATE_ARMING = "arming";
var STATE_ARMED = "armed";
var STATE_ALARMING = "alarming";

// ---- BTHome Field Length Lookup Table ----
var BTHOME_FIELD_LEN = {
  0x00: 1, 0x01: 1, 0x02: 2, 0x03: 2, 0x05: 3, 0x08: 2, 0x0A: 3,
  0x0C: 2, 0x10: 1, 0x11: 1, 0x15: 1, 0x1A: 1, 0x1F: 1, 0x20: 1,
  0x21: 1, 0x23: 1, 0x2D: 1, 0x3A: 1, 0x3C: 2, 0x3F: 2, 0x45: 2,
  0x51: 2, 0x58: 1
};

// ---- Helper Functions ----

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
  if (alarming) return STATE_ALARMING;
  if (armed) return STATE_ARMED;
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
  print("Auth set:", CONFIG.CLOUD.AUTH !== "PASTE_YOUR_AUTH_KEY_HERE" ? "yes" : "NO (using placeholder!)");
  print("Scenes: alarm=", CONFIG.CLOUD.SCENES.ALARM,
        " armed=", CONFIG.CLOUD.SCENES.ARMED,
        " disarmed=", CONFIG.CLOUD.SCENES.DISARMED);
  print("Buttons:", JSON.stringify(CONFIG.DEVICES.BUTTONS));
  print("Sensors:", JSON.stringify(CONFIG.DEVICES.SENSORS));
  print("-----------------------------------");

  BLE.Scanner.Subscribe(onScan);
  BLE.Scanner.Start({ duration_ms: BLE.Scanner.INFINITE_SCAN, active: false });
  updateStateKvs();
  print("Beeper script v1.3.0 ready.");
}

// ---- Cloud Functions ----

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

function fireCloudAlarm() { fireCloudScene(CONFIG.CLOUD.SCENES.ALARM, "ALARM"); }
function notifyArmed() { fireCloudScene(CONFIG.CLOUD.SCENES.ARMED, "ARMED notify"); }
function notifyDisarmed() { fireCloudScene(CONFIG.CLOUD.SCENES.DISARMED, "DISARMED notify"); }

function sendStatus() {
  var s = currentState();
  print("Status query -> state:", s);
  if (s === STATE_DISARMED) {
    notifyDisarmed();
  } else {
    notifyArmed();
  }
  return s;
}

// ---- Remote Control Functions ----

function armRemote() {
  print("REMOTE ARM requested");
  if (armed) { print("Already armed - ignored"); return "already_armed"; }
  if (armPending) { print("Already arming - ignored"); return "already_arming"; }

  print("ARMING (remote) -> stage 1:", CONFIG.TIMING.ARM_DELAY_MS / 1000, "s, stage 2:", CONFIG.TIMING.FINAL_DELAY_MS / 1000, "s");
  startArmingSequence();
  return "arming_started";
}

function disarmRemote() {
  print("REMOTE DISARM requested");
  var didDisarm = performDisarm("REMOTE");
  if (!didDisarm) {
    print("Already disarmed - long confirmation beep");
    doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
    return "already_disarmed";
  }
  return "disarmed";
}

// ---- Relay & Audio Functions ----

function relayOn() { Shelly.call("Switch.Set", { id: 0, on: true }); }
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

// ---- Arming Sequence Logic ----

function startArmingSequence() {
  armPending = true;
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
  else relayOff();

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
    print("ARMED (stage 2 elapsed) -> system live + armed push");
    notifyArmed();
    updateStateKvs();
  });
}

// ---- Alarm Logic ----

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

  print("ALARM by", sourceMac, "-> beeping for", CONFIG.TIMING.ALARM_TIMEOUT_MS / 1000, "s + cloud push");
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
  if (alarmTickHandle !== null) { Timer.clear(alarmTickHandle); alarmTickHandle = null; }
  if (alarmTimeoutHandle !== null) { Timer.clear(alarmTimeoutHandle); alarmTimeoutHandle = null; }
  relayOff();
}

// ---- Disarm Logic ----

function performDisarm(sourceMac) {
  var didSomething = false;

  if (armPendingHandle !== null) {
    Timer.clear(armPendingHandle);
    armPendingHandle = null;
    didSomething = true;
    print("Arming cancelled by", sourceMac);
  }

  if (alarming) {
    stopAlarm();
    didSomething = true;
    print("Alarm stopped by", sourceMac);
  }

  var wasArmed = armed;
  armed = false;
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

// ---- Event Handlers ----

function handleClick(clickType, sourceMac) {
  var label;
  if (clickType === 1) {
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

    print("ARMING by", sourceMac, "-> stage 1:", CONFIG.TIMING.ARM_DELAY_MS / 1000, "s, stage 2:", CONFIG.TIMING.FINAL_DELAY_MS / 1000, "s");
    startArmingSequence();

  } else if (clickType === 2 || clickType === 3 || clickType === 4) {
    label = (clickType === 4 ? "long" : (clickType === 2 ? "double" : "triple"));
    print("Click type", label, "from", sourceMac);

    var didDisarm = performDisarm(sourceMac);
    if (!didDisarm) {
      print("Already disarmed - double long confirmation beep");
      doubleLongBeep(CONFIG.TIMING.BEEP_MS * 3);
    }
  }
}

function handleSensor(data, sourceMac) {
  var triggered = false;
  var reason = "";

  if (!armed) return;
  if (alarming) return;

  if (data.motion === 1) { triggered = true; reason = "motion"; }
  else if (data.door === 1) { triggered = true; reason = "door open"; }
  else if (data.window === 1) { triggered = true; reason = "window open"; }

  if (!triggered) return;

  print("SENSOR triggered by", sourceMac, "(" + reason + ") -> alarm immediately");
  startAlarm(sourceMac);
}

// ---- BTHome Parser ----

function bthomeFieldLen(id) {
  var v = BTHOME_FIELD_LEN[id];
  if (typeof v === "undefined") return -1;
  return v;
}

function parseBTHome(serviceData, sourceMac) {
  var i, id, len, header, out;
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

    if (id === 0x00) out.pid = serviceData.at(i);
    else if (id === 0x01) out.battery = serviceData.at(i);
    else if (id === 0x21) out.motion = serviceData.at(i);
    else if (id === 0x2D) out.window = serviceData.at(i);
    else if (id === 0x1A) out.door = serviceData.at(i);
    else if (id === 0x3A) out.button = serviceData.at(i);

    i += len;
  }
  return out;
}

// ---- BLE Scan Callback ----

function onScan(ev, res) {
  var svc, data, mac;
  if (ev !== BLE.Scanner.SCAN_RESULT) return;
  if (!res || !res.addr || !res.service_data) return;

  svc = res.service_data["fcd2"];
  if (!svc) return;

  data = parseBTHome(svc, res.addr);
  if (!data) return;

  mac = res.addr;

  if (typeof data.pid !== "undefined") {
    if (lastPid[mac] === data.pid) return;
    lastPid[mac] = data.pid;
  }

  if (inList(mac, CONFIG.DEVICES.BUTTONS)) {
    if (typeof data.button === "undefined") return;
    handleClick(data.button, mac);
  }
  else if (inList(mac, CONFIG.DEVICES.SENSORS)) {
    handleSensor(data, mac);
  }
}

// ---- Initialization ----

print("Beeper script v1.3.0 starting - loading config from KVS...");

// Each load is async; finishConfigLoad() runs once all complete.
loadKvsString("cfg.cloud_server",   CONFIG.CLOUD,        "SERVER");
loadKvsString("cfg.cloud_auth",     CONFIG.CLOUD,        "AUTH");
loadKvsNumber("cfg.scene_alarm",    CONFIG.CLOUD.SCENES, "ALARM");
loadKvsNumber("cfg.scene_armed",    CONFIG.CLOUD.SCENES, "ARMED");
loadKvsNumber("cfg.scene_disarmed", CONFIG.CLOUD.SCENES, "DISARMED");
loadKvsMacList("dev.buttons",       CONFIG.DEVICES,      "BUTTONS");
loadKvsMacList("dev.sensors",       CONFIG.DEVICES,      "SENSORS");
