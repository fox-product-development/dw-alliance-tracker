import { query } from "../../lib/db";
import { addPlayer, renamePlayer, deletePlayer } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await query("SELECT id, name FROM players ORDER BY name ASC");

  return (
    <>
      <div className="page-title">Roster Management</div>
      <div className="page-sub">
        {players.length} players · deleting a player also removes their score
        history
      </div>

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
                  <form action={deletePlayer}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="danger">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
