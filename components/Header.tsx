"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/board", label: "Board" },
  { href: "/history", label: "Quotations" },
] as const;

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
      <Link href="/" aria-label="Home">
        <Logo />
      </Link>
      <nav className="flex items-center gap-2 text-sm">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`border-2 border-ink px-3 py-1.5 font-semibold ${
                active ? "bg-ink text-cream" : "bg-transparent text-ink hover:bg-kraft-2"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/quote/new"
          className="hidden border-2 border-dashed border-ink px-3 py-1.5 font-semibold text-ink hover:bg-kraft-2 sm:inline-block"
        >
          Start a quote
        </Link>
      </nav>
    </header>
  );
}
