"use client";

import { useState } from "react";
import { logEvent } from "./actions";

const TYPES = {
  vs: { label: "VS", control: "number" },
  poll: { label: "Poll", control: "number" },
  frankie: { label: "Frankie", control: "tick" },
  zombies: { label: "Zombies", control: "tick" },
  war: { label: "War Event", control: "tick" },
  black_gold: { label: "Black Gold Battlefield", control: "radio" },
  kill_event: { label: "Kill Event", control: "inverse" },
  contribution: { label: "Contribution", control: "number" },
};

const HINTS = {
  vs: "Enter the daily VS score in millions — 6.9M is 6.9, 800K is 0.8. Tick holiday to note why a score is low",
  poll: "Enter the car CP rank 1 to 6. Enter 0 if they did not respond",
  frankie: "Tick everyone who attended. Unticked counts as absent",
  zombies: "Tick everyone who attended. Unticked counts as absent",
  war: "Tick everyone who attended. Unticked counts as absent",
  black_gold:
    "Select each response. Anyone left unselected counts as no response",
  kill_event:
    "Tick anyone found unshielded. Ticks accumulate — saving again adds to earlier ticks and never removes them",
  contribution: "Enter the contribution figure for the week",
};

const BGB_CHOICES = [
  { value: "no_response", label: "No response" },
  { value: "decline", label: "Decline" },
  { value: "accept", label: "Accept" },
  { value: "no_show", label: "No show" },
];

export default function LogForm({ players }) {
  const [eventType, setEventType] = useState("vs");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const control = TYPES[eventType].control;

  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    let entered = 0;
    for (const p of players) {
      const raw = formData.get(`p_${p.id}`);
      if (raw !== null && String(raw).trim() !== "") entered += 1;
    }

    const remainder = players.length - entered;

    let summary;

    if (control === "inverse") {
      summary = `${entered} marked as unshielded. Earlier ticks are kept.`;
    } else if (control === "tick") {
      summary = `${entered} marked as attended, ${remainder} marked as absent.`;
    } else if (control === "radio") {
      summary = `${entered} responses recorded, ${remainder} counted as no response.`;
    } else {
      summary = `${entered} values entered, ${remainder} will be saved as zero.`;
    }

    if (!window.confirm(`${summary}\n\nSave this event?`)) return;

    setSaving(true);
    setMessage("");

    const result = await logEvent(formData);

    setSaving(false);

    if (result && result.unshielded !== undefined) {
      setMessage(
        `Saved. ${result.unshielded} of ${result.total} unshielded in total.`,
      );
    } else {
      setMessage(`Saved. ${summary}`);
    }
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
          {Object.entries(TYPES).map(([value, t]) => (
            <option key={value} value={value}>
              {t.label}
            </option>
          ))}
        </select>
        <input type="date" name="event_date" required />
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save event"}
        </button>
      </div>

      {message && <div className="msg-ok">{message}</div>}

      <div className="panel scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              {control === "radio" ? (
                BGB_CHOICES.map((c) => (
                  <th key={c.value} className="num" style={{ width: "100px" }}>
                    {c.label}
                  </th>
                ))
              ) : (
                <th className="num" style={{ width: "150px" }}>
                  {control === "tick"
                    ? "Attended"
                    : control === "inverse"
                      ? "Unshielded"
                      : "Value"}
                </th>
              )}
              {eventType === "vs" && (
                <th className="num" style={{ width: "100px" }}>
                  Holiday
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>

                {control === "radio" ? (
                  BGB_CHOICES.map((c) => (
                    <td key={c.value} className="num">
                      <input
                        type="radio"
                        name={`p_${p.id}`}
                        value={c.value}
                        style={{ width: "17px", height: "17px" }}
                      />
                    </td>
                  ))
                ) : (
                  <td className="num">
                    {control === "number" ? (
                      <input
                        key={`num_${eventType}_${p.id}`}
                        name={`p_${p.id}`}
                        type="number"
                        step="any"
                        style={{ width: "90px", textAlign: "right" }}
                      />
                    ) : (
                      <input
                        key={`tick_${eventType}_${p.id}`}
                        name={`p_${p.id}`}
                        type="checkbox"
                        value="1"
                      />
                    )}
                  </td>
                )}

                {eventType === "vs" && (
                  <td className="num">
                    <input name={`h_${p.id}`} type="checkbox" value="1" />
                  </td>
                )}
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
