"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, {});

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div className="game-title">
          DW <span>ALLIANCE</span>
        </div>
        <div className="subtitle">Participation Tracker</div>
      </div>

      <form
        action={formAction}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          maxWidth: "300px",
        }}
      >
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoFocus
          required
        />
        <button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>

      {state?.error && (
        <div className="msg-err" style={{ maxWidth: "300px", width: "100%" }}>
          {state.error}
        </div>
      )}

      <div className="mrfox-sig" style={{ marginTop: "48px" }}>
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </div>
  );
}
