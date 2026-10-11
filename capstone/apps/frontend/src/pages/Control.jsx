// Control.jsx - plug the car in or out, and set the charging rules. A plug button only
// sends a command: the simulated car reports back (telemetry) and the optimizer makes a
// new plan. Nothing here talks to the optimizer: the cloud does that.
import React, { useEffect, useRef, useState } from "react";
import { ago, carState } from "../lib.js";
import { Scene } from "../components/House.jsx";
import { Check, Info } from "../components/Icons.jsx";

function steps(deviceId) {
  return [
    ["The API saves your settings", `PUT /device/${deviceId}/settings → DynamoDB`],
    ["A re-plan message is queued", "SQS re-plan queue"],
    ["The optimizer solves a new plan", "ECS Fargate · HiGHS"],
    ["The dashboard shows it", `GET /device/${deviceId}/schedule`],
  ];
}

export default function Control({ api, deviceId, status, refresh }) {
  const [saved, setSaved] = useState(null); // the settings as stored
  const [form, setForm] = useState(null); // the settings being edited
  const [pending, setPending] = useState(null); // { plugged, since } while a plug command travels
  const [progress, setProgress] = useState(0); // save steps: 0 = idle, 5 = all done
  const [error, setError] = useState("");
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    setSaved(null);
    setForm(null);
    setPending(null);
    setProgress(0);
    setError("");
    api
      .settings(deviceId)
      .then((s) => {
        setSaved(s);
        setForm(s);
      })
      .catch((e) => setError(e.message));
  }, [api, deviceId]);

  // A plug command is done when the car's telemetry shows the new state. Until then,
  // ask for the status every 2 s; give up after 30 s.
  useEffect(() => {
    if (!pending) return undefined;
    if (status && status.plugged_in === pending.plugged) {
      setPending(null);
      return undefined;
    }
    if (Date.now() - pending.since > 30000) {
      setPending(null);
      setError("No answer from the car yet. Is the device online?");
      return undefined;
    }
    const timer = setTimeout(refresh, 2000);
    return () => clearTimeout(timer);
  }, [pending, status, refresh]);

  const state = carState(status);
  const plugged = Boolean(status && status.plugged_in);
  const soc = status && status.soc != null ? Math.round(status.soc * 100) : null;
  const sending = Boolean(pending);

  async function plug() {
    const plugIn = !plugged;
    setError("");
    setPending({ plugged: plugIn, since: Date.now() });
    try {
      await (plugIn ? api.plugIn(deviceId) : api.plugOut(deviceId));
    } catch (e) {
      setPending(null);
      setError(e.message);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (invalid || (progress > 0 && progress < 5)) return;
    setError("");
    setProgress(1);
    try {
      const settings = { reserve_soc: Number(form.reserve_soc), target_soc: Number(form.target_soc), departure_time: form.departure_time };
      await api.saveSettings(deviceId, settings); // steps 1 and 2 happen inside this one call
      setSaved(settings);
      setProgress(3);
      timers.current.push(
        setTimeout(async () => {
          try {
            await api.schedule(deviceId);
            setProgress(5);
          } catch (e) {
            setError(e.message);
            setProgress(0);
          }
        }, 3000)
      );
    } catch (e) {
      setError(e.message);
      setProgress(0);
    }
  }

  function change(field, value) {
    setForm({ ...form, [field]: value });
    if (progress === 5) setProgress(0);
  }

  const invalid = form && Number(form.target_soc) < Number(form.reserve_soc);
  const saving = progress > 0 && progress < 5;

  // The scene: what flows along the cable right now.
  let flow = "off";
  if (plugged && !sending && state.kind === "home") flow = "home";
  if (plugged && !sending && state.kind === "charging") flow = "car";
  const look = sending ? { x: 0, y: 5 } : plugged ? { x: 6, y: 1 } : { x: 5, y: 5 };
  const mood = sending || !plugged || state.kind === "offline" ? "o" : state.kind === "home" ? "wide" : "smile";

  let title = "…";
  let note = "";
  if (status) {
    title = state.kind === "offline" ? "Offline" : plugged ? "Plugged in" : "Unplugged";
    if (sending) note = "Command sent · waiting for the car";
    else if (state.kind === "offline") note = `No telemetry · last ${ago(status.seconds_since_update)}`;
    else if (state.kind === "home") note = `${soc}% · powering your home · ${state.kw.toFixed(1)} kW`;
    else if (state.kind === "charging") note = `${soc}% · charging · ${state.kw.toFixed(1)} kW`;
    else if (plugged) note = `${soc}% · idle, waiting for a cheaper hour`;
    else note = "THEO plans again when you plug in";
  }

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <span className="eyebrow">Control · {deviceId}</span>
          <h1>Tell THEO what your car <em>needs</em>.</h1>
        </div>
      </div>

      {error && (
        <p className="note" role="alert">
          <Info size={18} />
          {error}
        </p>
      )}

      <div className="row">
        <section className="card side connection" aria-labelledby="connection-title">
          <h2 className="card-title" id="connection-title">Connection</h2>
          <Scene plugged={plugged} flow={flow} kwLabel={`${state.kw.toFixed(1)} kW`} lights={flow === "home"} mood={mood} look={look} />
          <div className="plug-state" aria-live="polite">
            <span className="plug-title">{title}</span>
            <span className="label">{note}</span>
          </div>
          <button className={plugged ? "btn" : "btn primary"} type="button" onClick={plug} disabled={!status || sending}>
            {sending && <span className="spinner" aria-hidden="true" />}
            {sending ? "Waiting for the car…" : plugged ? "Unplug car" : "Plug in car"}
          </button>
          <p className="cmd">
            Sends <b>{plugged ? "plug_out" : "plug_in"}</b> to <span className="nowrap">theo/{deviceId}/control</span> over IoT Core
          </p>
        </section>

        <section className="card grow rules" aria-labelledby="rules-title">
          <div className="saved-block">
            <h2 className="card-title strong" id="rules-title">Charging rules</h2>
            <p className="help">THEO plans around these. Saving asks the optimizer for a new plan.</p>
          </div>

          {form ? (
            <form onSubmit={save} noValidate>
              <div className="meter" aria-hidden="true">
                <div className="meter-labels">
                  {soc != null && <span style={{ left: `clamp(40px, ${soc}%, calc(100% - 40px))`, transform: "translateX(-50%)", color: "#5EEAD4" }}>NOW {soc}%</span>}
                </div>
                <div className="meter-track">
                  <div className="meter-soc" style={{ width: `${soc ?? 0}%` }} />
                  <div className="meter-reserve" style={{ width: `${form.reserve_soc}%` }} />
                  <div className="meter-target" style={{ left: `${form.target_soc}%` }} />
                </div>
                <div className="meter-labels">
                  <span style={{ left: `max(${form.reserve_soc}%, 110px)`, transform: "translateX(calc(-100% - 6px))", color: "#A1A1AA" }}>RESERVE {form.reserve_soc}%</span>
                  <span style={{ left: `min(${form.target_soc}%, calc(100% - 100px))`, transform: "translateX(6px)" }}>TARGET {form.target_soc}%</span>
                </div>
              </div>

              <div className="sliders">
                <div className="slider">
                  <div className="slider-head">
                    <label className="label" htmlFor="reserve">Reserve</label>
                    <output htmlFor="reserve">{form.reserve_soc}%</output>
                  </div>
                  <input id="reserve" type="range" min="0" max="100" step="5" value={form.reserve_soc} onChange={(e) => change("reserve_soc", Number(e.target.value))} aria-describedby="reserve-help" />
                  <p className="help" id="reserve-help">THEO never powers your home below this.</p>
                </div>
                <div className="slider">
                  <div className="slider-head">
                    <label className="label" htmlFor="target">Target</label>
                    <output htmlFor="target">{form.target_soc}%</output>
                  </div>
                  <input id="target" type="range" min="0" max="100" step="5" value={form.target_soc} onChange={(e) => change("target_soc", Number(e.target.value))} aria-describedby="target-help" />
                  <p className="help" id="target-help">Charged to this by the time you leave.</p>
                </div>
                <div className="slider narrow">
                  <label className="label" htmlFor="departure">Departure</label>
                  <input id="departure" className="time-input" type="time" required value={form.departure_time} onChange={(e) => change("departure_time", e.target.value)} aria-describedby="departure-help" />
                  <p className="help" id="departure-help">When you usually leave.</p>
                </div>
              </div>

              {invalid && (
                <p className="note" role="alert">
                  <Info size={18} />
                  The target can't be lower than the reserve.
                </p>
              )}

              <div className="actions">
                <button className="btn primary" type="submit" disabled={invalid || saving}>
                  {saving && <span className="spinner" aria-hidden="true" />}
                  {saving ? "Saving…" : "Save and re-plan"}
                </button>
                <button className="btn" type="button" onClick={() => setForm(saved)} disabled={saving}>
                  Reset
                </button>
                {progress === 5 && (
                  <span className="saved" role="status">
                    <Check size={18} />
                    Saved. The new plan is on the dashboard.
                  </span>
                )}
              </div>
            </form>
          ) : (
            <p className="help">Loading the settings…</p>
          )}
        </section>
      </div>

      <section className="card raised stack" aria-labelledby="flow-title">
        <h2 className="card-title strong" id="flow-title">What happens when you save</h2>
        <ol className="steps">
          {steps(deviceId).map(([name, detail], i) => {
            const n = i + 1;
            const done = progress > n;
            const active = progress === n;
            return (
              <li key={name} className={done ? "step done" : active ? "step active" : "step"}>
                <span className="step-num">{done ? <Check size={16} /> : n}</span>
                <div>
                  <span className="step-title">{name}</span>
                  <span className="step-detail">{detail}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="label page-foot">Times are simulated · the device answers with telemetry every 10 s</p>
    </main>
  );
}
