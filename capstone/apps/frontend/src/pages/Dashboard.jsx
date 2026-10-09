// Dashboard.jsx - savings cards, today's plan, the battery over time, and an online
// indicator. Everything is refreshed every 5 seconds. Savings are added up by the
// API, never here.
import React, { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addSocSample, euro, planChartData } from "../lib.js";
import { usePolling } from "../usePolling.js";

export default function Dashboard({ api, deviceId }) {
  const [status, setStatus] = useState(null);
  const [savings, setSavings] = useState(null);
  const [slots, setSlots] = useState([]);
  const [samples, setSamples] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => setSamples([]), [deviceId]); // a different car, a fresh battery line

  usePolling(
    async () => {
      try {
        const [s, sv, sc] = await Promise.all([api.status(deviceId), api.savings(deviceId), api.schedule(deviceId)]);
        setStatus(s);
        setSavings(sv);
        setSlots(sc.slots);
        setSamples((old) => addSocSample(old, s));
        setError("");
      } catch (e) {
        setError(e.message);
      }
    },
    5000,
    [deviceId]
  );

  const plan = planChartData(slots, status && status.updated_at);

  return (
    <section className="page">
      <h2>Savings</h2>
      <div className="cards">
        <div className="card big"><small>THIS MONTH</small><strong>{euro(savings && savings.month_eur)}</strong></div>
        <div className="card big"><small>TODAY</small><strong>{euro(savings && savings.today_eur)}</strong></div>
      </div>

      <h2>Today's plan</h2>
      <div className="card chart">
        {plan.length === 0 ? (
          <p>No plan yet. Plug the car in on the Control page.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={plan}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={24} />
              <YAxis yAxisId="price" unit=" ct" />
              <YAxis yAxisId="power" orientation="right" unit=" kW" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="power" dataKey="power" name="Charge (+) / discharge (−)" fill="#4f9d69" />
              <Line yAxisId="price" dataKey="price" name="Price" stroke="#c0562b" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <h2>Live</h2>
      <div className="card chart">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={samples}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" minTickGap={24} />
            <YAxis domain={[0, 100]} unit=" %" />
            <Tooltip />
            <Line dataKey="soc" name="Battery" stroke="#2b6cc0" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p>
          Last telemetry: {status && status.seconds_since_update != null ? `${status.seconds_since_update} s ago` : "unknown"}{" "}
          <span className={status && status.online ? "dot on" : "dot off"} /> {status && status.online ? "online" : "offline"}
          {status && status.updated_at ? ` · simulated time ${status.updated_at.slice(11, 16)}` : ""}
        </p>
      </div>

      {error && <p className="message" role="alert">{error}</p>}
    </section>
  );
}
