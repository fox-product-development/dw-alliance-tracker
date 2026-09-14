"use client";

import { useEffect, useState } from "react";

const BG_LABELS = {
  no_response: "No Response",
  decline: "Decline",
  accept: "Accept",
  no_show: "No Show",
};

const ATT_LABELS = {
  frankie: "Frank",
  zombies: "Zombies",
  war: "War",
  poll_response: "Poll",
};

function prettyShort(dateIso) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function PlayerPopout({ playerId, onClose }) {
  const [weeksBack, setWeeksBack] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);

    fetch(`/api/player-summary?playerId=${playerId}&weeksBack=${weeksBack}`)
      .then((r) => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then((json) => {
        if (!live) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setError("Could not load this player's summary.");
        setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [playerId, weeksBack]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const atOldest = data ? weeksBack >= data.maxWeeksBack : true;
  const atNewest = weeksBack <= 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="popout" onClick={(e) => e.stopPropagation()}>
        <button
          className="popout-close quiet"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="dialog-title">{data ? data.player : "Loading"}</div>

        {error && <div className="msg-err">{error}</div>}

        {!data && loading && !error && <div className="mono">Loading…</div>}

        {data && (
          <div className="popout-body">
            {loading && (
              <div className="popout-loading">
                <div className="popout-spinner" />
              </div>
            )}

            <div
              className={loading ? "popout-content dimmed" : "popout-content"}
            >
              <div className="popout-section">
                <div className="popout-weeknav">
                  <button
                    className="quiet"
                    disabled={atOldest}
                    onClick={() => setWeeksBack(weeksBack + 1)}
                  >
                    ‹
                  </button>
                  <span className="mono">
                    {prettyShort(data.week.start)} —{" "}
                    {prettyShort(data.week.end)}
                  </span>
                  <button
                    className="quiet"
                    disabled={atNewest}
                    onClick={() => setWeeksBack(weeksBack - 1)}
                  >
                    ›
                  </button>
                </div>

                <div className="popout-week">
                  {data.week.days.map((d) => (
                    <div key={d.date} className="popout-day">
                      <div className="mono">{d.label}</div>
                      <div
                        className={
                          d.holiday ? "popout-val holiday" : "popout-val"
                        }
                      >
                        {d.value === null ? "—" : d.value}
                      </div>
                    </div>
                  ))}
                  <div className="popout-day">
                    <div className="mono">Total</div>
                    <div className="popout-val total">
                      {data.week.total.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="popout-section">
                <div className="section-label">Black Gold · all time</div>
                <div className="popout-tally">
                  {Object.keys(BG_LABELS).map((k) => (
                    <div key={k} className="popout-day">
                      <div className="mono">{BG_LABELS[k]}</div>
                      <div className="popout-val">{data.blackGold[k]}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="popout-section">
                <div className="section-label">Attendance · all time</div>
                <div className="popout-tally">
                  {Object.keys(ATT_LABELS).map((k) => (
                    <div key={k} className="popout-day">
                      <div className="mono">{ATT_LABELS[k]}</div>
                      <div className="popout-val">
                        {data.attendance[k].events === 0
                          ? "—"
                          : `${data.attendance[k].attended}/${data.attendance[k].events}`}
                      </div>
                    </div>
                  ))}
                  <div className="popout-day">
                    <div className="mono">Times unshielded</div>
                    <div className="popout-val">{data.unshielded}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
