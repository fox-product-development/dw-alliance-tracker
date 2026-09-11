"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/log", label: "Manual Entry" },
  { href: "/upload", label: "Image Entry" },
  { href: "/rankings", label: "Rankings" },
  { href: "/players", label: "Roster Management" },
];

export default function Nav() {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/login") return null;

  return (
    <nav className="topnav">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? "current" : ""}
        >
          {link.label}
        </Link>
      ))}
      <span className="spacer" />
      <Link
        href="/settings"
        className={pathname === "/settings" ? "current" : ""}
      >
        ⚙ Settings
      </Link>
    </nav>
  );
}
