"use client";

import { useState } from "react";
import { logEvent } from "./actions";

const TICK_TYPES = ["frankie", "zombies"];

const TYPE_LABELS = {
  vs: "VS",
  poll: "Poll",
  frankie: "Frankie",
  zombies: "Zombies",
  contribution: "Contribution",
};

const HINTS = {
  vs: "Enter the weekly VS score in millions — 34.7M is 34.7, 800K is 0.8",
  poll: "Enter the car CP rank 1 to 6. Enter 0 if they did not respond",
  frankie: "Tick everyone who attended. Unticked counts as absent",
  zombies: "Tick everyone who attended. Unticked counts as absent",
  contribution: "Enter the contribution figure for the week",
};

export default function LogForm({ players }) {
  const [eventType, setEventType] = useState("vs");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const isTick = TICK_TYPES.includes(eventType);

  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    let entered = 0;
    for (const p of players) {
      const raw = formData.get(`p_${p.id}`);
      if (raw !== null && String(raw).trim() !== "") entered += 1;
    }

    const remainder = players.length - entered;

    const summary = isTick
      ? `${entered} marked as attended, ${remainder} marked as absent.`
      : `${entered} values entered, ${remainder} will be saved as zero.`;

    const ok = window.confirm(`${summary}\n\nSave this event?`);
    if (!ok) return;

    setSaving(true);
    setMessage("");
    await logEvent(formData);
    setSaving(false);
    setMessage(`Saved. ${summary}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="page-title">Manual Entry</div>
      <div className="page-sub">{HINTS[eventType]}</div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          name="event_type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input type="date" name="event_date" required />
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save event"}
        </button>
      </div>

      {message && <div className="msg-ok">{message}</div>}

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num" style={{ width: "140px" }}>
                {isTick ? "Attended" : "Value"}
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">
                  {isTick ? (
                    <input
                      key={`tick_${p.id}`}
                      name={`p_${p.id}`}
                      type="checkbox"
                      value="1"
                    />
                  ) : (
                    <input
                      key={`num_${p.id}`}
                      name={`p_${p.id}`}
                      type="number"
                      step="any"
                      style={{ width: "90px", textAlign: "right" }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: "20px" }}>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save event"}
        </button>
      </p>

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </form>
  );
}
