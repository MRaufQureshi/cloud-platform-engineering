// Control.jsx - the car card (status, battery, PLUG IN / PLUG OUT) and the settings form.
// A plug button sends a command; the simulated car reports back and the optimizer
// makes a new plan. Nothing here talks to the optimizer: the cloud does that.
import React, { useEffect, useState } from "react";
import { currentAction } from "../lib.js";
import { usePolling } from "../usePolling.js";

export default function Control({ api, deviceId }) {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = usePolling(() => api.status(deviceId).then(setStatus).catch((e) => setMessage(e.message)), 5000, [deviceId]);

  useEffect(() => {
    setSettings(null);
    api.settings(deviceId).then(setSettings).catch((e) => setMessage(e.message));
  }, [api, deviceId]);

  async function plug(command) {
    setBusy(true);
    setMessage("");
    try {
      await (command === "in" ? api.plugIn(deviceId) : api.plugOut(deviceId));
      setMessage(command === "in" ? "Plug-in sent. The optimizer is making a plan." : "Plug-out sent.");
      setTimeout(refresh, 2000);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.saveSettings(deviceId, {
        reserve_soc: Number(settings.reserve_soc),
        target_soc: Number(settings.target_soc),
        departure_time: settings.departure_time,
      });
      setMessage("Saved. Re-planning now.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const soc = status && status.soc != null ? Math.round(status.soc * 100) : null;
  const online = status && status.online;

  return (
    <section className="page">
      <h2>My car</h2>
      <div className="card">
        <div className="row">
          <strong>🚗 {deviceId}</strong>
          <span className={online ? "dot on" : "dot off"} title={online ? "online" : "no signal"} />
        </div>
        <p>Status: {status ? (status.plugged_in ? "● PLUGGED IN" : "○ NOT PLUGGED IN") : "…"}</p>
        <div className="bar-track" aria-label="Battery">
          <div className="bar-fill" style={{ width: `${soc ?? 0}%` }} />
        </div>
        <p>SoC: {soc != null ? `${soc} %` : "…"}</p>
        <p>Now: <strong>{currentAction(status)}</strong></p>
        <div className="row buttons">
          <button className="primary" disabled={busy} onClick={() => plug("in")}>🔌 PLUG IN</button>
          <button disabled={busy} onClick={() => plug("out")}>⏏ PLUG OUT</button>
        </div>
      </div>

      <h2>My settings</h2>
      {settings ? (
        <form className="card" onSubmit={save}>
          <label>Reserve SoC
            <select value={settings.reserve_soc} onChange={(e) => setSettings({ ...settings, reserve_soc: e.target.value })}>
              {[10, 20, 30, 40, 50].map((n) => <option key={n} value={n}>{n} %</option>)}
            </select>
          </label>
          <label>Target SoC
            <select value={settings.target_soc} onChange={(e) => setSettings({ ...settings, target_soc: e.target.value })}>
              {[60, 70, 80, 90, 100].map((n) => <option key={n} value={n}>{n} %</option>)}
            </select>
          </label>
          <label>Departure time
            <input type="time" value={settings.departure_time} onChange={(e) => setSettings({ ...settings, departure_time: e.target.value })} required />
          </label>
          <button className="primary" disabled={busy} type="submit">Save settings</button>
          <small>Saving triggers an instant re-plan.</small>
        </form>
      ) : (
        <p>Loading settings…</p>
      )}

      {message && <p className="message" role="status">{message}</p>}
    </section>
  );
}
