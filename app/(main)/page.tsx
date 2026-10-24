import Link from "next/link";
import { APP_TAGLINE } from "@/lib/company";

// Home: the headline and one way in. The button has focus, so Enter starts a quote.
export default function HomePage() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <p className="eyebrow text-brick">{APP_TAGLINE}</p>
      <h1 className="mt-5 font-display text-[3.6rem] font-extrabold leading-[0.9] tracking-[-0.045em] text-ink sm:text-8xl lg:text-[8.5rem]">
        Bolo,
        <br />
        box ready.
      </h1>
      <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-2 md:text-xl">
        Say the customer&apos;s request out loud. BoxBol turns it into a box card, then into a quotation you approve and
        send on WhatsApp.
      </p>
      <Link
        href="/quote/new"
        autoFocus
        className="hard-shadow mt-10 inline-flex items-center gap-3 border-2 border-ink bg-brick px-7 py-4 font-display text-xl font-extrabold uppercase tracking-[0.015em] text-cream outline-none focus-visible:ring-4 focus-visible:ring-brick/30"
      >
        Start a quote <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
