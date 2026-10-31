import NewQuoteInput from "@/components/NewQuoteInput";
import Steps from "@/components/Steps";
import { slab } from "@/lib/fonts";

// Step 1: dictate the enquiry, all its boxes at once. An approved plan opens the enquiry's page.
export default function StartQuotationPage() {
  return (
    <div className="kraft-page flex flex-col gap-6 pt-8">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-medium text-[#3a2412]">New enquiry</p>
          <h1 className={`${slab.className} mt-1 text-5xl leading-none tracking-[-0.02em] text-[#3a2412] md:text-6xl`}>Start a quotation</h1>
        </div>
        <Steps current={1} />
      </div>

      <NewQuoteInput />
    </div>
  );
}
