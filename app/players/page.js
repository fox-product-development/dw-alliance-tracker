import { query } from "../../lib/db";
import PlayerTable from "./PlayerTable";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await query("SELECT id, name FROM players ORDER BY name ASC");

  return (
    <>
      <div className="page-title">Roster Management</div>
      <div className="page-sub">{players.length} players</div>

      <PlayerTable players={players} />

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
