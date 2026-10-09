// App.jsx - the frame: header, two pages, a device picker.
import React, { useMemo, useState } from "react";
import { createApi } from "./api.js";
import Control from "./pages/Control.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export default function App({ config, signOut }) {
  const api = useMemo(() => createApi(config.apiUrl), [config.apiUrl]);
  const [page, setPage] = useState("control");
  const [deviceId, setDeviceId] = useState(config.devices[0]);

  return (
    <div className="app">
      <header className="bar">
        <strong className="logo">T.H.E.O. ⚡</strong>
        <nav>
          <button className={page === "control" ? "tab active" : "tab"} onClick={() => setPage("control")}>Control</button>
          <button className={page === "dashboard" ? "tab active" : "tab"} onClick={() => setPage("dashboard")}>Dashboard</button>
        </nav>
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Device">
          {config.devices.map((id) => <option key={id}>{id}</option>)}
        </select>
        <button className="tab" onClick={signOut}>Sign out</button>
      </header>

      <main>
        {page === "control" ? <Control api={api} deviceId={deviceId} /> : <Dashboard api={api} deviceId={deviceId} />}
      </main>
    </div>
  );
}
