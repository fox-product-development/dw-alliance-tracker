"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PlayerPopout from "./PlayerPopout";

export default function PlayerName({ playerId, name }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <span className="player-link" onClick={() => setOpen(true)}>
        {name}
      </span>
      {open &&
        mounted &&
        createPortal(
          <PlayerPopout playerId={playerId} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}
