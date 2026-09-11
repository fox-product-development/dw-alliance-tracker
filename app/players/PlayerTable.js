"use client";

import { useState } from "react";
import { addPlayer, renamePlayer, deletePlayer } from "./actions";

export default function PlayerTable({ players }) {
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

  async function confirmDelete() {
    setBusy(true);

    const formData = new FormData();
    formData.set("id", target.id);
    await deletePlayer(formData);

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

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Player</th>
              <th style={{ width: "110px" }}></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
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
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => open(p)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                <div className="dialog-title">Delete player</div>
                <div className="dialog-body">
                  Do you want to delete <strong>{target.name}</strong>?
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
                <div className="dialog-title">This cannot be undone</div>
                <div className="dialog-warn">
                  Deleting {target.name} will also delete all of their scores
                  and event history. This cannot be recovered.
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
                    onClick={confirmDelete}
                    disabled={busy}
                  >
                    {busy ? "Deleting…" : "Delete"}
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
