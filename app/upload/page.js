"use client";

import { useState } from "react";
import { saveAttendance, addPlayerByName } from "./actions";

const THRESHOLD = 0.7;
const ROSTER_TYPES = ["zombies", "war"];

const DEFAULT_DURATION = { zombies: 30, war: 120 };

const LABELS = { frankie: "Frankie", zombies: "Zombies", war: "War Event" };

export default function UploadPage() {
  const [eventType, setEventType] = useState("frankie");
  const [eventDate, setEventDate] = useState("");
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({});
  const [renameFlags, setRenameFlags] = useState({});
  const [message, setMessage] = useState("");

  const usesRoster = ROSTER_TYPES.includes(eventType);

  function changeType(value) {
    setEventType(value);
    if (DEFAULT_DURATION[value]) setDuration(DEFAULT_DURATION[value]);
    setData(null);
    setMessage("");
  }

  function qualifies(row) {
    if (!data?.usesRoster) return true;
    if (row.status === null) return false;
    return row.status <= duration;
  }

  async function handleExtract(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setData(null);
    setMessage("");

    const formData = new FormData(e.target);
    formData.set("event_type", eventType);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (result.error) {
        setError(result.error);
      } else {
        setData(result);

        const initial = {};
        result.rows.forEach((row, i) => {
          const best = row.candidates[0];
          const withinTime =
            !result.usesRoster ||
            (row.status !== null && row.status <= duration);

          initial[i] =
            best && best.score >= THRESHOLD && withinTime
              ? String(best.id)
              : "";
        });
        setChoices(initial);
        setRenameFlags({});
      }
    } catch (err) {
      setError(err.message);
    }

    setBusy(false);
  }

  async function handleSave() {
    const presentIds = [];
    const renames = [];
    const newNames = [];

    data.rows.forEach((row, i) => {
      const choice = choices[i];
      if (!choice) return;

      if (choice === "new") {
        newNames.push(row.extracted);
        return;
      }

      const id = Number(choice);
      presentIds.push(id);

      if (renameFlags[i]) renames.push({ id, name: row.extracted });
    });

    const ok = window.confirm(
      `${presentIds.length + newNames.length} players marked present.\n` +
        (newNames.length ? `${newNames.length} added as new players.\n` : "") +
        (renames.length ? `${renames.length} renamed.\n` : "") +
        `\nSave this event?`,
    );

    if (!ok) return;

    setBusy(true);
    setMessage("");
    setError("");

    for (const name of newNames) {
      const created = await addPlayerByName(name);
      if (created) presentIds.push(created.id);
    }

    const result = await saveAttendance(
      eventType,
      eventDate,
      presentIds,
      renames,
    );

    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    const total = result.present + result.absent;

    setMessage(
      `${LABELS[eventType]} — ${eventDate}. ${total} players updated, ` +
        `${result.present} marked as attending, ${result.absent} marked as absent.`,
    );

    setData(null);
    setChoices({});
    setRenameFlags({});
    setEventDate("");
  }

  function statusLabel(row) {
    if (row.status === null) return "—";
    if (row.status === 0) return "Online";
    if (row.status < 60) return `${row.status}m`;
    if (row.status < 1440) return `${Math.round(row.status / 60)}h`;
    return `${Math.round(row.status / 1440)}d`;
  }

  const selected = data ? Object.values(choices).filter((c) => c).length : 0;

  return (
    <>
      <div className="page-title">Image Entry</div>
      <div className="page-sub">
        {usesRoster
          ? "Screenshot the member list as the event ends. Anyone inside the duration counts as present"
          : "Screenshot the event ranking list. Anyone not found is marked absent"}
      </div>

      <form
        onSubmit={handleExtract}
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <select value={eventType} onChange={(e) => changeType(e.target.value)}>
          <option value="frankie">Frankie</option>
          <option value="zombies">Zombies</option>
          <option value="war">War Event</option>
        </select>

        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />

        {usesRoster && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label className="mono">Event duration</label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={{ width: "80px", textAlign: "right" }}
              required
            />
            <span className="mono">minutes</span>
          </span>
        )}

        <input type="file" name="images" accept="image/*" multiple required />

        <button type="submit" disabled={busy}>
          {busy ? "Reading…" : "Extract"}
        </button>
      </form>

      {error && <div className="msg-err">{error}</div>}
      {message && <div className="msg-ok">{message}</div>}

      {data && (
        <>
          <div className="section-label">
            {data.rows.length} names · {data.screenshots} screenshots ·{" "}
            {selected} selected
            {data.duplicatesRemoved > 0
              ? ` · ${data.duplicatesRemoved} duplicates`
              : ""}
          </div>

          {data.failures.length > 0 && (
            <div className="msg-warn">
              {data.failures.length} screenshot(s) failed:{" "}
              {data.failures.map((f) => f.file).join(", ")}
            </div>
          )}

          <div className="panel scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Extracted</th>
                  {data.usesRoster && (
                    <th className="num" style={{ width: "90px" }}>
                      Last seen
                    </th>
                  )}
                  <th style={{ width: "240px" }}>Assign to</th>
                  <th style={{ width: "90px" }}>Rename</th>
                  <th className="num" style={{ width: "80px" }}>
                    Match
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const best = row.candidates[0];
                  const auto = best && best.score >= THRESHOLD;
                  const choice = choices[i];
                  const inTime = qualifies(row);

                  return (
                    <tr key={i} style={{ opacity: inTime ? 1 : 0.45 }}>
                      <td
                        style={{
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: "14px",
                        }}
                      >
                        {row.extracted}
                      </td>

                      {data.usesRoster && (
                        <td
                          className="num"
                          style={{
                            color: inTime
                              ? "var(--accent3)"
                              : "var(--text-dim)",
                          }}
                        >
                          {statusLabel(row)}
                        </td>
                      )}

                      <td>
                        <select
                          style={{ width: "100%" }}
                          value={choice}
                          onChange={(e) =>
                            setChoices({ ...choices, [i]: e.target.value })
                          }
                        >
                          <option value="">Skip</option>
                          <option value="new">+ Add as new player</option>
                          {data.players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        {choice && choice !== "new" && (
                          <input
                            type="checkbox"
                            checked={!!renameFlags[i]}
                            onChange={(e) =>
                              setRenameFlags({
                                ...renameFlags,
                                [i]: e.target.checked,
                              })
                            }
                          />
                        )}
                      </td>

                      <td
                        className="num"
                        style={{
                          color: auto ? "var(--accent3)" : "var(--warn)",
                        }}
                      >
                        {best ? best.score.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: "20px" }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !eventDate}
            >
              {busy ? "Saving…" : "Save attendance"}
            </button>
          </p>
        </>
      )}

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
