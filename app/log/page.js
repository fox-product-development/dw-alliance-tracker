import { query } from "../../lib/db";
import LogForm from "./LogForm";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const players = await query(
    "SELECT id, name FROM players WHERE status = 'active' ORDER BY name ASC",
  );
  return <LogForm players={players} />;
}
