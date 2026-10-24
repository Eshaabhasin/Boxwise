import BoardView from "@/components/BoardView";
import { buildCardView, DEFAULT_FILTER, filterCounts, isBoardFilter, stagesFor, type CardSource } from "@/lib/board";
import { STAGES, type Stage } from "@/lib/fields";

/**
 * DESIGN PREVIEW: sample cards from the reference PDF, never saved to the
 * database. Lets you review the board look before real requests exist.
 * Delete this page once phase 2 fills the real board.
 */
const SAMPLES: CardSource[] = [
  { id: "s16", number: 16, customerName: "Sharma Packaging", stage: "New", specs: { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 500, printColours: 2 }, missing: ["flute", "style", "joint", "address"] },
  { id: "s15", number: 15, customerName: "Gupta Foods", stage: "Quoted", specs: { length: 355.6, breadth: 254, height: 152.4, dimUnit: "inch", ply: 3, loadKg: 15, quantity: 1000, printColours: 1 }, missing: [] },
  { id: "s14", number: 14, customerName: "Mehta Plastics", stage: "Sent", specs: { length: 457.2, breadth: 304.8, height: 304.8, dimUnit: "inch", ply: 7, loadKg: 40, quantity: 250 }, missing: [] },
  { id: "s13", number: 13, customerName: "Verma Sweets", stage: "New", specs: { length: 254, breadth: 203.2, height: 101.6, dimUnit: "inch", ply: 3, quantity: 2000, printColours: 0, joint: "Stitched" }, missing: [] },
  { id: "s12", number: 12, customerName: "Anand Electricals", stage: "New", specs: { length: 450, breadth: 300, height: 250, dimUnit: "mm", ply: 7, loadKg: 45, quantity: 300 }, missing: ["printColours", "flute"], hasDraftQuote: true },
  { id: "s11", number: 11, customerName: "Kapoor Textiles", stage: "Won", specs: { length: 600, breadth: 400, height: 400, dimUnit: "mm", ply: 5, loadKg: 25, quantity: 800, printColours: 1 }, missing: [] },
];

export default async function DesignPreviewPage({ searchParams }: PageProps<"/design">) {
  const params = await searchParams;
  const filter = isBoardFilter(params.filter) ? params.filter : DEFAULT_FILTER;
  const perStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const s of SAMPLES) perStage[s.stage] += 1;
  const cards = SAMPLES.filter((s) => stagesFor(filter).includes(s.stage)).map(buildCardView);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <p className="eyebrow border-2 border-dashed border-brick px-3 py-2 text-brick">
        Design preview · sample cards, not saved anywhere
      </p>
      <BoardView filter={filter} counts={filterCounts(perStage)} cards={cards} q="" basePath="/design" cardHref={() => "/design/quote"} />
    </div>
  );
}
