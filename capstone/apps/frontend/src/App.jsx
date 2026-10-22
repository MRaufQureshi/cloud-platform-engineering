// App.jsx - signed out: the login page. Signed in: the frame (top bar, two pages, a
// device picker). Every car's status is fetched here, once for both pages.
import React, { useEffect, useMemo, useState } from "react";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { createApi } from "./api.js";
import { clock } from "./lib.js";
import { usePolling } from "./usePolling.js";
import { useLang } from "./LangContext.jsx";
import LangSwitch from "./components/LangSwitch.jsx";
import { Chevron, Info, LogOut } from "./components/Icons.jsx";
import Control from "./pages/Control.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";

export default function App({ config }) {
  const [user, setUser] = useState("checking"); // checking | out | in

  useEffect(() => {
    getCurrentUser()
      .then(() => setUser("in"))
      .catch(() => setUser("out"));
  }, []);

  if (user === "checking") return null;
  if (user === "out") return <Login onSignedIn={() => setUser("in")} />;
  return <Frame config={config} onSignOut={() => signOut().finally(() => setUser("out"))} />;
}

// The page comes from the address: #dashboard (default) or #control.
function pageFromUrl() {
  return window.location.hash === "#control" ? "control" : "dashboard";
}

function Frame({ config, onSignOut }) {
  const api = useMemo(() => createApi(config.apiUrl), [config.apiUrl]);
  const [page, setPage] = useState(pageFromUrl);
  const [deviceId, setDeviceId] = useState(config.devices[0]);
  const [statuses, setStatuses] = useState({});
  const [error, setError] = useState("");
  const { t } = useLang();

  useEffect(() => {
    const onHash = () => setPage(pageFromUrl());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refresh = usePolling(
    async () => {
      try {
        const list = await Promise.all(config.devices.map((id) => api.status(id)));
        setStatuses(Object.fromEntries(config.devices.map((id, i) => [id, list[i]])));
        setError("");
      } catch (e) {
        setError(e.message);
      }
    },
    5000,
    []
  );

  const status = statuses[deviceId];
  const online = Boolean(status && status.online);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-group">
          <a className="wordmark" href="#dashboard" aria-label={t("brand.dashboardAria")}>
            T<span>.</span>H<span>.</span>E<span>.</span>O<span>.</span>
          </a>
          <nav className="nav" aria-label={t("nav.aria")}>
            <a href="#dashboard" aria-current={page === "dashboard" ? "page" : undefined}>{t("nav.dashboard")}</a>
            <a href="#control" aria-current={page === "control" ? "page" : undefined}>{t("nav.control")}</a>
          </nav>
        </div>
        <div className="topbar-group tight">
          <span className="status-pill" title={online ? t("status.online") : t("status.offline")}>
            <span className={online ? "dot" : "dot off"} />
            {status ? (
              <>
                <span className="pill-state">{online ? t("status.online") : t("status.offline")}{status.updated_at ? " ·" : ""}</span>
                {status.updated_at && <span>{t("status.sim", { time: clock(status.updated_at) })}</span>}
              </>
            ) : (
              t("status.connecting")
            )}
          </span>
          <div className="select">
            <label className="sr-only" htmlFor="device">{t("device.label")}</label>
            <select id="device" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {config.devices.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <Chevron size={16} />
          </div>
          <LangSwitch />
          <button className="round" type="button" aria-label={t("signout")} onClick={onSignOut}>
            <LogOut />
          </button>
        </div>
      </header>

      {error && (
        <p className="note" role="alert">
          <Info size={18} />
          {error}
        </p>
      )}

      {page === "control" ? (
        <Control api={api} deviceId={deviceId} status={status} refresh={refresh} />
      ) : (
        <Dashboard api={api} deviceId={deviceId} devices={config.devices} statuses={statuses} />
      )}
    </div>
  );
}
