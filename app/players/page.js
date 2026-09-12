import { query } from "../../lib/db";
import PlayerTable from "./PlayerTable";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const active = await query(
    `SELECT id, name, status_date FROM players
     WHERE status = 'active'
     ORDER BY name ASC`,
  );

  const removed = await query(
    `SELECT id, name, status_date FROM players
     WHERE status = 'removed'
     ORDER BY status_date ASC, name ASC`,
  );

  return (
    <>
      <div className="page-title">Roster Management</div>
      <div className="page-sub">
        {active.length} active
        {removed.length > 0 && ` · ${removed.length} pending deletion`}
      </div>

      <PlayerTable active={active} removed={removed} />

      <div className="mrfox-sig">
        <div className="mrfox-crafted">Crafted by</div>
        <div className="mrfox-name">Mr Fox</div>
        <div className="mrfox-title">Dark War · Community Tools</div>
      </div>
    </>
  );
}
