"""
device.py - the virtual THEO Box.

What it is: one script that pretends to be three smart home energy boxes
(each = house + solar + an EV with a 60 kWh battery). Each device runs as a
thread with its OWN X.509 certificate and its OWN MQTT connection to AWS IoT Core.

What it does, per device:
  * every 10 real seconds  -> publishes telemetry   to theo/<id>/telemetry
  * on a plug in/out       -> publishes an event    to theo/<id>/event
  * listens on theo/<id>/control   for {"cmd": "plug_in"} / {"cmd": "plug_out"}
  * listens on theo/<id>/schedule  for the optimizer's plan, and OBEYS it

Why it exists: there is no real hardware. This gives the cloud a realistic stream
of data and something that reacts to the schedules the optimizer sends back.

SIMULATED CLOCK: TIME_SCALE=60 means 1 real second = 1 simulated minute, so a
whole day plays out in 24 real minutes. Everything inside the simulation (load
curve, solar, schedule slots, timestamps) uses simulated time. The simulated day
starts at START_HOUR (default 17:00 UTC) on the day the script starts.

Metrics for Prometheus are served on port 8000.
"""

import json
import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone

from awscrt import mqtt
from awsiot import mqtt_connection_builder
from prometheus_client import Counter, Gauge, start_http_server

# ---------------------------------------------------------------- settings
ENDPOINT = os.environ["IOT_ENDPOINT"]  # the account's IoT data endpoint
CERT_DIR = os.environ.get("CERT_DIR", "/opt/theo/certs")
DEVICE_IDS = os.environ.get("DEVICE_IDS", "device-1,device-2,device-3").split(",")
TIME_SCALE = float(os.environ.get("TIME_SCALE", "60"))  # simulated seconds per real second
START_HOUR = int(os.environ.get("START_HOUR", "17"))
METRICS_PORT = int(os.environ.get("METRICS_PORT", "8000"))

TELEMETRY_EVERY_S = 10  # real seconds between telemetry messages
TICK_S = 1.0  # real seconds per simulation step (= 1 simulated minute at TIME_SCALE 60)
BATTERY_KWH = 60.0
EFFICIENCY = 0.90  # 90% when charging AND 90% when discharging
PLUG_IN_SOC = 0.50  # a car arrives half full

# Hardcoded household load in kW for each hour of the day (index = hour).
HOUSE_LOAD_KW = [
    0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.8, 1.2, 1.0, 0.7, 0.6, 0.6,
    0.7, 0.6, 0.6, 0.7, 0.9, 1.4, 1.9, 2.0, 1.8, 1.4, 0.9, 0.5,
]

# ----------------------------------------------------------------- metrics
MESSAGES = Counter("theo_sim_messages_published_total", "MQTT messages published", ["device_id"])
SOC = Gauge("theo_sim_soc", "Battery state of charge, 0 to 1", ["device_id"])
DEVICE_COUNT = Gauge("theo_sim_devices", "Number of virtual devices running")

# ------------------------------------------------------- the simulated clock
REAL_START = time.time()
_today = datetime.now(timezone.utc).replace(hour=START_HOUR, minute=0, second=0, microsecond=0)


def sim_now():
    """Current simulated time (a timezone-aware datetime)."""
    return _today + timedelta(seconds=(time.time() - REAL_START) * TIME_SCALE)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def slot_key(dt):
    """The 15-minute slot a moment falls in, as the string used in schedules."""
    return iso(dt.replace(minute=dt.minute - dt.minute % 15, second=0, microsecond=0))


def solar_kw(dt):
    """A bell curve peaking at 13:00 with a 6 kW peak, and zero at night."""
    hour = dt.hour + dt.minute / 60
    value = 6.0 * math.exp(-((hour - 13) ** 2) / (2 * 2.5**2))
    return value if value > 0.05 else 0.0


# -------------------------------------------------------------- one device
class VirtualDevice:
    def __init__(self, device_id):
        self.id = device_id
        self.soc = PLUG_IN_SOC
        self.plugged_in = False
        self.ev_power_kw = 0.0  # + charging, - discharging
        self.schedule = {}  # slot_start string -> {"action": ..., "power_kw": ...}
        self.lock = threading.Lock()  # MQTT callbacks arrive on other threads
        self.connection = None

    # ---------------------------------------------------------- connection
    def connect(self):
        self.connection = mqtt_connection_builder.mtls_from_path(
            endpoint=ENDPOINT,
            cert_filepath=f"{CERT_DIR}/{self.id}.cert.pem",
            pri_key_filepath=f"{CERT_DIR}/{self.id}.key.pem",
            ca_filepath=f"{CERT_DIR}/AmazonRootCA1.pem",
            client_id=self.id,  # the IoT policy only allows a client named after the device
            clean_session=False,
            keep_alive_secs=30,
        )
        self.connection.connect().result()
        for topic, handler in (
            (f"theo/{self.id}/control", self.on_control),
            (f"theo/{self.id}/schedule", self.on_schedule),
        ):
            future, _ = self.connection.subscribe(topic, mqtt.QoS.AT_LEAST_ONCE, handler)
            future.result()
        print(f"[{self.id}] connected, listening on control + schedule", flush=True)

    def publish(self, topic_suffix, payload, wait=True):
        future, _ = self.connection.publish(
            f"theo/{self.id}/{topic_suffix}", json.dumps(payload), mqtt.QoS.AT_LEAST_ONCE
        )
        # Callbacks (on_control, on_schedule) run on the SDK's own network thread,
        # which is the very thread that must send this message. Waiting for the
        # result there would make the thread wait on itself and freeze every
        # device, so callbacks pass wait=False.
        if wait:
            future.result()
        MESSAGES.labels(self.id).inc()

    # ------------------------------------------------------ incoming messages
    def on_control(self, topic, payload, **kwargs):
        cmd = json.loads(payload).get("cmd")
        with self.lock:
            if cmd == "plug_in":
                self.plugged_in = True
                self.soc = PLUG_IN_SOC
            elif cmd == "plug_out":
                self.plugged_in = False
                self.ev_power_kw = 0.0
                self.schedule = {}
            else:
                print(f"[{self.id}] unknown command {cmd!r}", flush=True)
                return
            event = {
                "device_id": self.id,
                "event": cmd,
                "ts": iso(sim_now()),
                "plugged_in": self.plugged_in,
                "soc": round(self.soc, 4),
            }
        print(f"[{self.id}] {cmd}", flush=True)
        self.publish("event", event, wait=False)  # we are inside an SDK callback: never block here

    def on_schedule(self, topic, payload, **kwargs):
        message = json.loads(payload)
        with self.lock:
            self.schedule = {s["slot_start"]: s for s in message.get("slots", [])}
        print(f"[{self.id}] new schedule: {len(self.schedule)} slots", flush=True)

    # ----------------------------------------------------------- simulation
    def step(self, now, minutes):
        """Apply whatever the schedule says for this slot to the battery."""
        with self.lock:
            self.ev_power_kw = 0.0
            if not self.plugged_in:
                return
            slot = self.schedule.get(slot_key(now))
            if slot is None or slot["action"] == "idle":
                return
            hours = minutes / 60
            power = float(slot["power_kw"])
            if slot["action"] == "charge":
                added = power * hours * EFFICIENCY  # 10% is lost on the way in
                self.soc = min(1.0, self.soc + added / BATTERY_KWH)
                self.ev_power_kw = power
            elif slot["action"] == "discharge":
                drawn = power * hours / EFFICIENCY  # the battery gives up more than the house gets
                self.soc = max(0.0, self.soc - drawn / BATTERY_KWH)
                self.ev_power_kw = -power

    def telemetry(self, now):
        with self.lock:
            return {
                "device_id": self.id,
                "ts": iso(now),
                "soc": round(self.soc, 4),
                "plugged_in": self.plugged_in,
                "meter_kw": HOUSE_LOAD_KW[now.hour],
                "solar_kw": round(solar_kw(now), 3),
                "ev_power_kw": round(self.ev_power_kw, 3),
            }

    def run(self):
        self.connect()
        last_sim = sim_now()
        next_telemetry = 0.0
        while True:
            time.sleep(TICK_S)
            now = sim_now()
            self.step(now, (now - last_sim).total_seconds() / 60)
            last_sim = now
            SOC.labels(self.id).set(self.soc)
            if time.time() >= next_telemetry:
                self.publish("telemetry", self.telemetry(now))
                next_telemetry = time.time() + TELEMETRY_EVERY_S


def main():
    start_http_server(METRICS_PORT)
    DEVICE_COUNT.set(len(DEVICE_IDS))
    print(f"simulator starting: {DEVICE_IDS}, TIME_SCALE={TIME_SCALE}, clock starts {iso(sim_now())}", flush=True)
    for device_id in DEVICE_IDS:
        threading.Thread(target=VirtualDevice(device_id).run, daemon=True).start()
    while True:  # keep the main thread alive; the device threads do the work
        time.sleep(60)


if __name__ == "__main__":
    main()
