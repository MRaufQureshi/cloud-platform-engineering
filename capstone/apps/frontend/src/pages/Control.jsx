// Control.jsx - plug the car in or out, and set the charging rules. A plug button only
// sends a command: the simulated car reports back (telemetry) and the optimizer makes a
// new plan. Nothing here talks to the optimizer: the cloud does that.
import React, { useEffect, useRef, useState } from "react";
import { ago, carState, emph } from "../lib.js";
import { useLang } from "../LangContext.jsx";
import { Scene } from "../components/House.jsx";
import { Check, Info } from "../components/Icons.jsx";

function steps(deviceId) {
  return [
    ["ctl.step1", `PUT /device/${deviceId}/settings → DynamoDB`],
    ["ctl.step2", "SQS re-plan queue"],
    ["ctl.step3", "ECS Fargate · HiGHS"],
    ["ctl.step4", `GET /device/${deviceId}/schedule`],
  ];
}

export default function Control({ api, deviceId, status, refresh }) {
  const { t, num } = useLang();
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
      setError(t("ctl.err.noAnswer"));
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
    title = state.kind === "offline" ? t("ctl.state.offline") : plugged ? t("ctl.state.plugged") : t("ctl.state.unplugged");
    if (sending) note = t("ctl.note.sending");
    else if (state.kind === "offline") note = t("ctl.note.offline", { ago: ago(status.seconds_since_update, t) });
    else if (state.kind === "home") note = t("ctl.note.home", { soc, kw: num(state.kw, 1) });
    else if (state.kind === "charging") note = t("ctl.note.charging", { soc, kw: num(state.kw, 1) });
    else if (plugged) note = t("ctl.note.idle", { soc });
    else note = t("ctl.note.unplugged");
  }

  const titleParts = emph(t("ctl.title"));

  return (
    <main className="page">
      <div className="greeting">
        <div>
          <span className="eyebrow">{t("ctl.eyebrow", { id: deviceId })}</span>
          <h1>{titleParts[0]}<em>{titleParts[1]}</em>{titleParts[2]}</h1>
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
          <h2 className="card-title" id="connection-title">{t("ctl.connection")}</h2>
          <Scene plugged={plugged} flow={flow} kwLabel={`${num(state.kw, 1)} kW`} lights={flow === "home"} mood={mood} look={look} />
          <div className="plug-state" aria-live="polite">
            <span className="plug-title">{title}</span>
            <span className="label">{note}</span>
          </div>
          <button className={plugged ? "btn" : "btn primary"} type="button" onClick={plug} disabled={!status || sending}>
            {sending && <span className="spinner" aria-hidden="true" />}
            {sending ? t("ctl.btn.waiting") : plugged ? t("ctl.btn.unplug") : t("ctl.btn.plug")}
          </button>
          <p className="cmd">
            {t("ctl.cmd.before")} <b>{plugged ? "plug_out" : "plug_in"}</b> {t("ctl.cmd.mid")} <span className="nowrap">theo/{deviceId}/control</span> {t("ctl.cmd.after")}
          </p>
        </section>

        <section className="card grow rules" aria-labelledby="rules-title">
          <div className="saved-block">
            <h2 className="card-title strong" id="rules-title">{t("ctl.rules")}</h2>
            <p className="help">{t("ctl.rules.help")}</p>
          </div>

          {form ? (
            <form onSubmit={save} noValidate>
              <div className="meter" aria-hidden="true">
                <div className="meter-labels">
                  {soc != null && <span style={{ left: `clamp(40px, ${soc}%, calc(100% - 40px))`, transform: "translateX(-50%)", color: "#5EEAD4" }}>{t("ctl.now", { n: soc })}</span>}
                </div>
                <div className="meter-track">
                  <div className="meter-soc" style={{ width: `${soc ?? 0}%` }} />
                  <div className="meter-reserve" style={{ width: `${form.reserve_soc}%` }} />
                  <div className="meter-target" style={{ left: `${form.target_soc}%` }} />
                </div>
                <div className="meter-labels">
                  <span style={{ left: `max(${form.reserve_soc}%, 110px)`, transform: "translateX(calc(-100% - 6px))", color: "#A1A1AA" }}>{t("ctl.reserveLabel", { n: form.reserve_soc })}</span>
                  <span style={{ left: `min(${form.target_soc}%, calc(100% - 100px))`, transform: "translateX(6px)" }}>{t("ctl.targetLabel", { n: form.target_soc })}</span>
                </div>
              </div>

              <div className="sliders">
                <div className="slider">
                  <div className="slider-head">
                    <label className="label" htmlFor="reserve">{t("ctl.reserve")}</label>
                    <output htmlFor="reserve">{t("dash.pct", { n: form.reserve_soc })}</output>
                  </div>
                  <input id="reserve" type="range" min="0" max="100" step="5" value={form.reserve_soc} onChange={(e) => change("reserve_soc", Number(e.target.value))} aria-describedby="reserve-help" />
                  <p className="help" id="reserve-help">{t("ctl.reserve.help")}</p>
                </div>
                <div className="slider">
                  <div className="slider-head">
                    <label className="label" htmlFor="target">{t("ctl.target")}</label>
                    <output htmlFor="target">{t("dash.pct", { n: form.target_soc })}</output>
                  </div>
                  <input id="target" type="range" min="0" max="100" step="5" value={form.target_soc} onChange={(e) => change("target_soc", Number(e.target.value))} aria-describedby="target-help" />
                  <p className="help" id="target-help">{t("ctl.target.help")}</p>
                </div>
                <div className="slider narrow">
                  <label className="label" htmlFor="departure">{t("ctl.departure")}</label>
                  <input id="departure" className="time-input" type="time" required value={form.departure_time} onChange={(e) => change("departure_time", e.target.value)} aria-describedby="departure-help" />
                  <p className="help" id="departure-help">{t("ctl.departure.help")}</p>
                </div>
              </div>

              {invalid && (
                <p className="note" role="alert">
                  <Info size={18} />
                  {t("ctl.invalid")}
                </p>
              )}

              <div className="actions">
                <button className="btn primary" type="submit" disabled={invalid || saving}>
                  {saving && <span className="spinner" aria-hidden="true" />}
                  {saving ? t("ctl.saving") : t("ctl.save")}
                </button>
                <button className="btn" type="button" onClick={() => setForm(saved)} disabled={saving}>
                  {t("ctl.reset")}
                </button>
                {progress === 5 && (
                  <span className="saved" role="status">
                    <Check size={18} />
                    {t("ctl.saved")}
                  </span>
                )}
              </div>
            </form>
          ) : (
            <p className="help">{t("ctl.loading")}</p>
          )}
        </section>
      </div>

      <section className="card raised stack" aria-labelledby="flow-title">
        <h2 className="card-title strong" id="flow-title">{t("ctl.flow")}</h2>
        <ol className="steps">
          {steps(deviceId).map(([nameKey, detail], i) => {
            const name = t(nameKey);
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

      <p className="label page-foot">{t("ctl.foot")}</p>
    </main>
  );
}
