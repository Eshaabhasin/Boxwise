import CommandBox from "@/components/CommandBox";
import Steps from "@/components/Steps";

// Step 1: dictate the request. In phase 2 an approved card moves on to the
// quotation screen (/quote/<id>) for rate, approval and sending.
export default function StartQuotationPage() {
  return (
    <div className="flex flex-col gap-8 pt-4">
      <div>
        <p className="eyebrow text-ink-2">New request</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] md:text-6xl">
          Start a quotation
        </h1>
      </div>

      <Steps current={1} />

      <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
        <CommandBox variant="request" />

        <aside className="flex flex-col gap-4">
          <div className="border-2 border-dashed border-ink/60 p-6">
            <p className="font-display text-xl font-extrabold uppercase tracking-[0.015em]">Your box card appears here</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              BoxBol reads the size, ply, load, quantity and print from what you say, and stamps{" "}
              <span className="eyebrow border-2 border-brick px-1 text-[0.6rem] font-bold text-brick">Not said</span> on
              anything the customer didn&apos;t mention. Say “approve” to save the card and go on to the rate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
