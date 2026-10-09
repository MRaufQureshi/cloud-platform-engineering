# simulator

The virtual THEO Box: three simulated home energy boxes (house + solar + a 60 kWh
EV) that talk to AWS IoT Core. Runs on an EC2 instance built by
`infra/theo/modules/simulator`.

## What you'll learn
- How an IoT device authenticates (an X.509 certificate per device, mutual TLS)
- Publish/subscribe messaging with MQTT topics
- Simulating time so a day passes in 24 minutes

## Topics

| Topic | Direction | When |
|---|---|---|
| `theo/<id>/telemetry` | device → cloud | every 10 real seconds |
| `theo/<id>/event` | device → cloud | only on plug in / plug out |
| `theo/<id>/control` | cloud → device | `{"cmd": "plug_in"}` or `{"cmd": "plug_out"}` |
| `theo/<id>/schedule` | cloud → device | `{"slots": [{"slot_start": "2026-10-08T18:00:00Z", "action": "charge", "power_kw": 7.4}, ...]}` |

`action` is `charge`, `discharge` or `idle`. In every 15-minute slot the device
applies the commanded power to its battery with 90% efficiency each way.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `IOT_ENDPOINT` | required | the account's IoT data endpoint |
| `DEVICE_IDS` | `device-1,device-2,device-3` | which devices to simulate |
| `TIME_SCALE` | `60` | simulated seconds per real second |
| `START_HOUR` | `17` | simulated day starts at this UTC hour |
| `CERT_DIR` | `/opt/theo/certs` | holds `<id>.cert.pem`, `<id>.key.pem`, `AmazonRootCA1.pem` |

## Check on it
See `infra/theo/README.md` for the test commands. Logs: `journalctl -u theo-simulator`.
Metrics: `curl localhost:8000/metrics`.
