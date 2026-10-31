import BoardView from "@/components/BoardView";
import { DEFAULT_FILTER, filterCounts, isBoardFilter, type BoxCardView } from "@/lib/board";
import { getBoardCards, getStageCounts } from "@/lib/board-data";
import { STAGES, type Stage } from "@/lib/fields";

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const params = await searchParams;
  const filter = isBoardFilter(params.filter) ? params.filter : DEFAULT_FILTER;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  let error = "";
  let cards: BoxCardView[] = [];
  let perStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  try {
    [cards, perStage] = await Promise.all([getBoardCards(filter, q), getStageCounts(q)]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      <BoardView filter={filter} counts={filterCounts(perStage)} cards={cards} q={q} error={error} />
    </div>
  );
}
