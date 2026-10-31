"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/board", label: "Enquiries", short: "Enquiries" },
  { href: "/history", label: "Quotations", short: "Quotes" },
  { href: "/settings", label: "Your company", short: "Company" },
] as const;

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 md:px-8">
        <Link href="/" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <nav className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-2 py-1.5 font-medium sm:px-3 ${active ? "bg-sunk text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
          <Link href="/quote/new" className="btn btn-primary ml-2 hidden py-1.5 sm:inline-flex">
            New quote
          </Link>
        </nav>
      </div>
    </header>
  );
}
