"use client";

import { useState } from "react";
import {
  addPlayer,
  renamePlayer,
  removePlayer,
  restorePlayer,
} from "./actions";

function daysLeft(statusDate) {
  const removed = new Date(statusDate);
  const now = new Date();
  const elapsed = Math.floor((now - removed) / 86400000);
  return Math.max(0, 14 - elapsed);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function PlayerTable({ active, removed }) {
  const [target, setTarget] = useState(null);
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);

  function open(player) {
    setTarget(player);
    setStage(1);
  }

  function close() {
    setTarget(null);
    setStage(1);
  }

  async function confirmRemove() {
    setBusy(true);

    const formData = new FormData();
    formData.set("id", target.id);
    await removePlayer(formData);

    setBusy(false);
    close();
  }

  return (
    <>
      <form
        action={addPlayer}
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          maxWidth: "480px",
        }}
      >
        <input name="name" placeholder="New player name" style={{ flex: 1 }} />
        <button type="submit">Add</button>
      </form>

      <div className="section-label">Active — {active.length}</div>

      <div className="panel" style={{ marginBottom: "28px" }}>
        <table className="data">
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td>
                  <form
                    action={renamePlayer}
                    style={{ display: "flex", gap: "8px", maxWidth: "480px" }}
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      name="name"
                      defaultValue={p.name}
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="quiet">
                      Save
                    </button>
                  </form>
                </td>
                <td style={{ width: "110px", textAlign: "right" }}>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => open(p)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-label">Recently removed — {removed.length}</div>

      {removed.length === 0 ? (
        <p className="mono" style={{ letterSpacing: "1px" }}>
          Nobody has been removed
        </p>
      ) : (
        <div className="panel">
          <table className="data">
            <tbody>
              {removed.map((p) => (
                <tr key={p.id}>
                  <td className="dim">{p.name}</td>
                  <td className="mono" style={{ letterSpacing: "1px" }}>
                    removed {formatDate(p.status_date)} · deleted in{" "}
                    {daysLeft(p.status_date)} days
                  </td>
                  <td style={{ width: "110px", textAlign: "right" }}>
                    <form action={restorePlayer}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="quiet">
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <div
          className="overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) close();
          }}
        >
          <div className="dialog">
            {stage === 1 ? (
              <>
                <div className="dialog-title">Remove player</div>
                <div className="dialog-body">
                  Do you want to remove <strong>{target.name}</strong>?
                </div>
                <div className="dialog-actions">
                  <button type="button" className="quiet" onClick={close}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => setStage(2)}>
                    OK
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dialog-title">Confirm removal</div>
                <div className="dialog-warn">
                  {target.name} will disappear from rankings, event logging and
                  the dashboard. Their history is kept for 14 days and can be
                  restored in that time. After 14 days they and all their scores
                  are deleted permanently.
                </div>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="quiet"
                    onClick={close}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={confirmRemove}
                    disabled={busy}
                  >
                    {busy ? "Removing…" : "Remove"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
