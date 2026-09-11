import { query } from "../../lib/db";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

const LABELS = {
  weight_vs: "VS",
  weight_poll: "Poll response",
  weight_frankie: "Frankie",
  weight_zombies: "Zombies",
  weight_war: "War",
  weight_car_cp: "Car CP",
  weight_contribution: "Contribution",
  vs_floor: "VS floor",
  vs_cap: "VS cap",
  vs_curve_exponent: "VS curve exponent",
  contribution_cap: "Contribution cap",
};

const NOTES = {
  vs_floor:
    "The daily VS score expected of everyone. Scores here convert to 0.5",
  vs_cap: "Scores above this stop earning more",
  vs_curve_exponent:
    "How hard falling below the floor bites. Higher is harsher",
  contribution_cap: "Contribution above this stops earning more",
};

const WEIGHT_ORDER = [
  "weight_vs",
  "weight_poll",
  "weight_frankie",
  "weight_zombies",
  "weight_war",
  "weight_car_cp",
  "weight_contribution",
];

const PARAM_ORDER = [
  "vs_floor",
  "vs_cap",
  "vs_curve_exponent",
  "contribution_cap",
];

const CAR_ORDER = [
  "car_range_1",
  "car_range_2",
  "car_range_3",
  "car_range_4",
  "car_range_5",
  "car_range_6",
];

function NumberSection({ title, keys, values, showNotes }) {
  return (
    <>
      <div className="section-label" style={{ marginTop: "26px" }}>
        {title}
      </div>
      <div className="panel">
        <table className="data">
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td>
                  {LABELS[k] || k}
                  {showNotes && NOTES[k] && (
                    <div
                      className="mono"
                      style={{ letterSpacing: "1px", marginTop: "3px" }}
                    >
                      {NOTES[k]}
                    </div>
                  )}
                </td>
                <td className="num" style={{ width: "130px" }}>
                  <input
                    name={k}
                    type="number"
                    step="any"
                    defaultValue={values[k]}
                    style={{ width: "100px", textAlign: "right" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default async function SettingsPage() {
  const rows = await query("SELECT key, value, text_value FROM settings");

  const values = {};
  const texts = {};

  for (const r of rows) {
    values[r.key] = Number(r.value);
    texts[r.key] = r.text_value;
  }

  const weightTotal = WEIGHT_ORDER.reduce(
    (sum, k) => sum + (values[k] || 0),
    0,
  );

  return (
    <>
      <div className="page-title">Settings</div>
      <div className="page-sub">
        Weights total {weightTotal.toFixed(2)} · measures with no data are
        excluded and the rest rescaled
      </div>

      <form action={saveSettings}>
        <NumberSection title="Weights" keys={WEIGHT_ORDER} values={values} />
        <NumberSection
          title="Scoring parameters"
          keys={PARAM_ORDER}
          values={values}
          showNotes
        />

        <div className="section-label" style={{ marginTop: "26px" }}>
          Car CP ranges
        </div>
        <div className="panel">
          <table className="data">
            <tbody>
              {CAR_ORDER.map((k, i) => (
                <tr key={k}>
                  <td style={{ width: "70px" }} className="dim">
                    {i + 1}
                  </td>
                  <td>
                    <input
                      name={k}
                      type="text"
                      defaultValue={texts[k] || ""}
                      style={{ width: "100%", maxWidth: "260px" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: "24px" }}>
          <button type="submit">Save settings</button>
        </p>
      </form>

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
