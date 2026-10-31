import Link from "next/link";
import Box3D from "@/components/Box3D";
import { APP_TAGLINE } from "@/lib/company";
import { slab } from "@/lib/fonts";

// Home: the headline and one way in, on kraft board, with the turning carton beside it.
// The button has focus, so Enter starts a quote.
export default function HomePage() {
  return (
    <section className="flex flex-1 items-center py-10">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />
      <div className="grid w-full items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-center lg:text-left">
          <p className="packing-tape">{APP_TAGLINE}</p>
          <h1 className={`${slab.className} mt-6 text-[3.8rem] font-bold leading-[0.95] tracking-[-0.02em] text-[#3a2412] sm:text-7xl lg:text-[6.5rem]`}>
            Say it.
            <br />
            <span className="text-[#7a4a1f]">Quote it.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg font-medium leading-relaxed text-[#3a2412] lg:mx-0">
            Say the customer&apos;s request, all the boxes in one go. Boxwise turns it into a professional quotation you can
            check, edit and send.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link href="/quote/new" autoFocus className="kraft-btn">
              Start a quote →
            </Link>
            <Link href="/board" className="kraft-btn kraft-btn-outline">
              Open enquiries
            </Link>
          </div>
        </div>
        <div className="flex justify-center">
          <Box3D />
        </div>
      </div>
    </section>
  );
}
