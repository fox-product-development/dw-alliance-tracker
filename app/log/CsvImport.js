"use client";

import { useState } from "react";
import { importVs } from "./actions";

const THRESHOLD = 0.7;

function prettyDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CsvImport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({});
  const [renameFlags, setRenameFlags] = useState({});
  const [showAll, setShowAll] = useState({});
  const [unitChoices, setUnitChoices] = useState({});

  async function handleRead(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setData(null);

    try {
      const res = await fetch("/api/import-vs", {
        method: "POST",
        body: new FormData(e.target),
      });
      const result = await res.json();

      if (result.error) {
        setError(result.error);
      } else {
        setData(result);

        const initial = {};
        result.rows.forEach((row, i) => {
          const best = row.candidates[0];
          initial[i] = best && best.score >= THRESHOLD ? String(best.id) : "";
        });
        setChoices(initial);
        setRenameFlags({});
        setShowAll({});
        setUnitChoices({});
      }
    } catch (err) {
      setError(err.message);
    }

    setBusy(false);
  }

  function flagKey(f) {
    return `${f.csvName}|${f.date}`;
  }

  const undecided = data
    ? data.flags.filter((f) => !unitChoices[flagKey(f)]).length
    : 0;

  const unmatched = data ? data.rows.filter((row, i) => !choices[i]).length : 0;

  async function handleSave() {
    const entries = [];

    data.rows.forEach((row, i) => {
      const choice = choices[i];
      if (!choice) return;

      const cells = row.cells.map((cell) => {
        const key = `${row.csvName}|${cell.date}`;
        const unit = unitChoices[key];
        if (!unit) return cell;
        const flag = data.flags.find((f) => flagKey(f) === key);
        return { ...cell, value: unit === "k" ? flag.asK : flag.asM };
      });

      entries.push({
        csvName: row.csvName,
        target: choice,
        rename: !!renameFlags[i],
        cells,
      });
    });

    const newCount = entries.filter((e) => e.target === "new").length;
    const renameCount = entries.filter(
      (e) => e.rename && e.target !== "new",
    ).length;
    const importing = data.dates.filter((d) => !data.alreadyLogged.includes(d));

    const ok = window.confirm(
      `${entries.length} players will be imported across ${importing.length} date(s).\n` +
        (newCount ? `${newCount} added as new players.\n` : "") +
        (renameCount ? `${renameCount} renamed.\n` : "") +
        (data.alreadyLogged.length
          ? `${data.alreadyLogged.length} date(s) already logged and will be skipped.\n`
          : "") +
        `\nImport this data?`,
    );

    if (!ok) return;

    setBusy(true);
    setError("");

    const result = await importVs(entries, data.dates);

    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessage(
      `Imported ${result.written} score rows across ${result.events} date(s).` +
        (result.skippedDates
          ? ` ${result.skippedDates} date(s) skipped as already logged.`
          : ""),
    );

    setData(null);
    setChoices({});
    setUnitChoices({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Rows needing attention first, then the rest in file order.
  const ordered = data
    ? data.rows
        .map((row, i) => ({ row, i }))
        .sort((a, b) => {
          const aBad = choices[a.i] ? 0 : 1;
          const bBad = choices[b.i] ? 0 : 1;
          if (aBad !== bBad) return bBad - aBad;
          return a.i - b.i;
        })
    : [];

  return (
    <>
      <div className="page-title">CSV Import</div>
      <div className="page-sub">
        Upload the weekly VS export. Dates come from the file — any date already
        logged is skipped
      </div>

      <form
        onSubmit={handleRead}
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button type="submit" disabled={busy}>
          {busy ? "Reading…" : "Read file"}
        </button>
      </form>

      {error && <div className="msg-err">{error}</div>}
      {message && <div className="msg-ok">{message}</div>}

      {data && (
        <>
          <div className="section-label">
            {data.fileName} · {data.rows.length} players · {data.dates.length}{" "}
            dates
          </div>

          <div style={{ marginBottom: "20px" }}>
            {data.dates.map((d) => (
              <div key={d} className="mono" style={{ marginBottom: "4px" }}>
                {prettyDate(d)}
                {data.alreadyLogged.includes(d) && (
                  <span style={{ color: "var(--warn)" }}>
                    {" "}
                    · already logged, will be skipped
                  </span>
                )}
              </div>
            ))}
          </div>

          {data.orphanHolidays && data.orphanHolidays.length > 0 && (
            <div className="msg-warn">
              {data.orphanHolidays.length} holiday marker(s) sit on days with no
              score and will be ignored:{" "}
              {data.orphanHolidays
                .map((h) => `${h.csvName} ${h.date}`)
                .join(", ")}
            </div>
          )}

          {data.bad.length > 0 && (
            <div className="msg-err">
              {data.bad.length} cell(s) could not be read and will be ignored:{" "}
              {data.bad
                .map((b) => `${b.csvName} ${b.date} "${b.raw}"`)
                .join(", ")}
            </div>
          )}

          {data.flags.length > 0 && (
            <>
              <div className="section-label">
                Values needing a decision · {undecided} outstanding
              </div>
              <div className="panel" style={{ marginBottom: "24px" }}>
                <table className="data">
                  <tbody>
                    {data.flags.map((f) => {
                      const key = flagKey(f);
                      const row = data.rows.find(
                        (r) => r.csvName === f.csvName,
                      );
                      const context = row
                        ? row.cells.map((c) => c.raw || "—").join(", ")
                        : "";

                      return (
                        <tr key={key}>
                          <td>
                            <div style={{ marginBottom: "4px" }}>
                              <strong>{f.csvName}</strong> ·{" "}
                              {prettyDate(f.date)} · value{" "}
                              <span
                                style={{
                                  fontFamily: "'Share Tech Mono', monospace",
                                  color: "var(--warn)",
                                }}
                              >
                                {f.raw}
                              </span>{" "}
                              has no unit
                            </div>
                            <div className="mono" style={{ fontSize: "11px" }}>
                              That week: {context}
                            </div>
                          </td>
                          <td className="num" style={{ width: "220px" }}>
                            <button
                              type="button"
                              className={
                                unitChoices[key] === "m" ? "" : "quiet"
                              }
                              onClick={() =>
                                setUnitChoices({ ...unitChoices, [key]: "m" })
                              }
                              style={{ marginRight: "6px" }}
                            >
                              {f.asM}m
                            </button>
                            <button
                              type="button"
                              className={
                                unitChoices[key] === "k" ? "" : "quiet"
                              }
                              onClick={() =>
                                setUnitChoices({ ...unitChoices, [key]: "k" })
                              }
                            >
                              {f.raw}k
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="section-label">
            Players · {unmatched} needing a match
          </div>

          <div className="panel scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>From file</th>
                  <th style={{ width: "240px" }}>Assign to</th>
                  <th style={{ width: "80px" }}>Rename</th>
                  <th className="num" style={{ width: "80px" }}>
                    Match
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(({ row, i }) => {
                  const best = row.candidates[0];
                  const auto = best && best.score >= THRESHOLD;
                  const choice = choices[i];
                  const list = showAll[i]
                    ? data.players
                    : data.players.filter(
                        (p) =>
                          data.unclaimed.includes(p.id) ||
                          String(p.id) === choice,
                      );

                  return (
                    <tr key={row.csvName} style={{ opacity: choice ? 1 : 1 }}>
                      <td
                        style={{
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: "14px",
                          color: choice ? "var(--text)" : "var(--warn)",
                        }}
                      >
                        {row.csvName}
                        {row.cells.some((c) => c.holiday) && (
                          <span
                            className="mono"
                            style={{
                              marginLeft: "8px",
                              color: "var(--accent)",
                            }}
                          >
                            {row.cells.filter((c) => c.holiday).length} holiday
                          </span>
                        )}
                      </td>

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
                          {list.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {!auto && (
                          <button
                            type="button"
                            className="quiet"
                            style={{ marginTop: "6px", padding: "4px 10px" }}
                            onClick={() =>
                              setShowAll({ ...showAll, [i]: !showAll[i] })
                            }
                          >
                            {showAll[i] ? "Unclaimed only" : "Show all"}
                          </button>
                        )}
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
              disabled={busy || undecided > 0}
            >
              {busy ? "Importing…" : "Import"}
            </button>
            {undecided > 0 && (
              <span className="mono" style={{ marginLeft: "12px" }}>
                {undecided} value(s) still need a decision
              </span>
            )}
          </p>
        </>
      )}
    </>
  );
}
