import BoardView from "@/components/BoardView";
import CommandBox from "@/components/CommandBox";
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
    <div className="flex flex-col gap-10 pt-4">
      <div className="max-w-2xl">
        <CommandBox variant="command" aside="Search, edit, move" />
      </div>
      <BoardView filter={filter} counts={filterCounts(perStage)} cards={cards} q={q} error={error} />
    </div>
  );
}
