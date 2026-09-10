"use client";

import { useState } from "react";
import Link from "next/link";

const button = {
  background: "#2c2c2a",
  color: "#f1efe8",
  border: "0.5px solid #888780",
  borderRadius: "8px",
  padding: "8px 16px",
  fontSize: "14px",
  fontFamily: "inherit",
  cursor: "pointer",
};

const cell = {
  padding: "10px 12px",
  borderTop: "0.5px solid #444441",
  fontSize: "13px",
};

export default function ExtractPage() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState("");
  const [threshold, setThreshold] = useState(0.7);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResults(null);
    setUsage(null);

    const formData = new FormData(e.target);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        setError(data.raw ? `${data.error}\n\n${data.raw}` : data.error);
      } else {
        setResults(data.results);
        setUsage(data.usage);
      }
    } catch (err) {
      setError(err.message);
    }

    setBusy(false);
  }

  const autoCount = results
    ? results.filter((r) => r.candidates[0]?.score >= threshold).length
    : 0;

  return (
    <main style={{ maxWidth: "760px" }}>
      <p style={{ marginTop: 0 }}>
        <Link href="/" style={{ color: "#85b7eb", fontSize: "13px" }}>
          ← Back
        </Link>
      </p>

      <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "1rem" }}>
        Extraction test
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px" }}>
        <input
          type="file"
          name="image"
          accept="image/*"
          required
          style={{ fontSize: "13px", color: "#b4b2a9" }}
        />
        <button type="submit" style={button} disabled={busy}>
          {busy ? "Reading…" : "Extract"}
        </button>
      </form>

      {error && (
        <pre
          style={{
            color: "#f09595",
            fontSize: "13px",
            whiteSpace: "pre-wrap",
            marginTop: "1.5rem",
          }}
        >
          {error}
        </pre>
      )}

      {results && (
        <div style={{ marginTop: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontSize: "13px", color: "#b4b2a9" }}>
              Threshold
            </label>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ flex: 1, maxWidth: "240px" }}
            />
            <span style={{ fontSize: "13px", minWidth: "36px" }}>
              {threshold.toFixed(2)}
            </span>
            <span style={{ fontSize: "13px", color: "#888780" }}>
              {autoCount} of {results.length} auto-assigned
              {usage
                ? ` · ${usage.input_tokens} in, ${usage.output_tokens} out`
                : ""}
            </span>
          </div>

          <div
            style={{
              border: "0.5px solid #444441",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {results.map((r, i) => {
                  const best = r.candidates[0];
                  const auto = best && best.score >= threshold;

                  return (
                    <tr key={i}>
                      <td style={cell}>{r.extracted}</td>
                      <td style={{ ...cell, color: "#b4b2a9" }}>
                        {best ? best.name : "—"}
                      </td>
                      <td
                        style={{
                          ...cell,
                          width: "70px",
                          textAlign: "right",
                          color: auto ? "#97c459" : "#fac775",
                        }}
                      >
                        {best ? best.score.toFixed(2) : "—"}
                      </td>
                      <td
                        style={{
                          ...cell,
                          width: "180px",
                          color: "#888780",
                          fontSize: "12px",
                        }}
                      >
                        {r.candidates
                          .slice(1)
                          .map((c) => `${c.name} ${c.score.toFixed(2)}`)
                          .join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
