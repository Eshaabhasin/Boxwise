import { boxLabel, type CardState } from "@/lib/card";
import { isLengthUnit, toMm } from "@/lib/calc/units";
import { getField, splitByScope, type FieldKey, type SpecValue, type Specs } from "@/lib/fields";
import type { GuardedRequest } from "@/lib/nlp/guard";

/**
 * Turns what was heard (after the guard) into changes to a card with many
 * boxes. Pure: no database, no LLM.
 *
 * Box fields can come three ways:
 *   - inside a box ("box 2 height 9 inch", "doosra box 18 by 12 by 10")
 *   - at the top for the only box ("height 9 inch kar do" on a one-box card)
 *   - at the top for every box, when he says so ("sab boxes 5 ply")
 */

export interface HeardBox {
  box: number | "new" | null;
  guarded: GuardedRequest;
}

const SIDES = ["length", "breadth", "height"] as const;

/** Sides said without a unit take the unit said elsewhere for this box, or the box's own unit. */
function withSizes(values: Specs, g: GuardedRequest, unit: unknown): { values: Specs; unitless: boolean } {
  const out = { ...values };
  if (!g.sizeWithoutUnit) return { values: out, unitless: false };
  if (!isLengthUnit(unit)) return { values: out, unitless: true };
  for (const side of SIDES) {
    const n = g.sizeWithoutUnit[side];
    if (n !== undefined) out[side] = toMm(n, unit);
  }
  return { values: out, unitless: false };
}

function droppedWarnings(gs: readonly GuardedRequest[]): string[] {
  const out: string[] = [];
  for (const g of gs) {
    for (const d of g.dropped) out.push(`Left out ${getField(d.field)?.label ?? d.field} “${d.value}”: ${d.reason}.`);
    for (const u of g.unsure ?? []) out.push(`Check ${getField(u.field)?.label ?? u.field}: read as “${u.value}” from your words.`);
  }
  return [...new Set(out)];
}

export interface NewCard {
  customer: Specs;
  terms: Specs;
  boxes: Specs[];
  warnings: string[];
}

/** A new enquiry: customer, terms, and one entry per box said. */
export function collectCreate(top: GuardedRequest, heard: readonly HeardBox[], allBoxes = false): NewCard {
  const split = splitByScope(top.specs);
  const shared = split.item;
  const terms: Specs = { ...split.quote };
  const customer: Specs = { ...top.customer };
  const warnings = droppedWarnings([top, ...heard.map((h) => h.guarded)]);

  const said = heard.map((h) => {
    const s = splitByScope(h.guarded.specs);
    Object.assign(terms, s.quote);
    Object.assign(customer, h.guarded.customer);
    return { values: s.item, g: h.guarded };
  });

  let boxes: Specs[];
  if (said.length === 0) {
    boxes = [withSizes(shared, top, shared.dimUnit).values];
    if (top.sizeWithoutUnit && !isLengthUnit(shared.dimUnit)) warnings.push(unitWarning("Box 1"));
  } else {
    // Top-level box fields are shared: they fill whatever each box didn't say itself.
    if (Object.keys(shared).length > 0 && said.length > 1 && !allBoxes) {
      warnings.push(`Applied ${describeKeys(shared)} to every box.`);
    }
    boxes = said.map(({ values, g }, i) => {
      const merged = { ...shared, ...values };
      const sized = withSizes(merged, g, merged.dimUnit);
      if (sized.unitless) warnings.push(unitWarning(boxLabel(i)));
      return sized.values;
    });
  }
  return { customer, terms, boxes, warnings };
}

export interface CardEdit {
  customer: Specs;
  terms: Specs;
  /** Changes to existing boxes, by box id. */
  set: { id: string; values: Specs }[];
  add: Specs[];
  /** Box ids to remove. */
  remove: string[];
  warnings: string[];
}

function unitWarning(label: string): string {
  return `${label}: the size has no unit. Say “inch”, “cm” or “mm”, or it won't be saved.`;
}

function describeKeys(values: Specs): string {
  return Object.keys(values)
    .map((k) => getField(k)?.label.toLowerCase() ?? k)
    .join(", ");
}

/** Changes to an existing card. Anything that can't be tied to one box is reported, not guessed. */
export function collectEdit(
  card: CardState,
  top: GuardedRequest,
  heard: readonly HeardBox[],
  opts: { allBoxes?: boolean; remove?: readonly number[] } = {},
): CardEdit {
  const split = splitByScope(top.specs);
  const edit: CardEdit = {
    customer: { ...top.customer },
    terms: { ...split.quote },
    set: [],
    add: [],
    remove: [],
    warnings: droppedWarnings([top, ...heard.map((h) => h.guarded)]),
  };
  const setFor = (id: string): Specs => {
    let entry = edit.set.find((s) => s.id === id);
    if (!entry) {
      entry = { id, values: {} };
      edit.set.push(entry);
    }
    return entry.values;
  };

  // Top-level box fields: the only box, or every box when he said "sab".
  const shared = split.item;
  if (Object.keys(shared).length > 0 || top.sizeWithoutUnit) {
    const targets = opts.allBoxes || card.boxes.length === 1 ? card.boxes : [];
    if (targets.length === 0) {
      edit.warnings.push(
        card.boxes.length === 0
          ? "This card has no boxes yet. Say the box details to add one."
          : `Which box? This card has ${card.boxes.length}. Say “box 2 …” (or “sab boxes …” for all).`,
      );
    }
    for (const b of targets) {
      const sized = withSizes(shared, top, shared.dimUnit ?? b.specs.dimUnit);
      if (sized.unitless) edit.warnings.push(unitWarning(boxLabel(card.boxes.indexOf(b))));
      Object.assign(setFor(b.id), sized.values);
    }
  }

  for (const h of heard) {
    const s = splitByScope(h.guarded.specs);
    Object.assign(edit.terms, s.quote);
    Object.assign(edit.customer, h.guarded.customer);
    if (h.box === "new") {
      const merged = { ...shared, ...s.item };
      const sized = withSizes(merged, h.guarded, merged.dimUnit ?? card.boxes.at(-1)?.specs.dimUnit);
      if (sized.unitless) edit.warnings.push(unitWarning(boxLabel(card.boxes.length + edit.add.length)));
      edit.add.push(sized.values);
      continue;
    }
    const index = h.box === null ? (card.boxes.length === 1 ? 0 : -1) : h.box - 1;
    const target = card.boxes[index];
    if (!target) {
      edit.warnings.push(
        h.box === null
          ? `Which box? This card has ${card.boxes.length}. Say “box 2 …”.`
          : `There is no box ${h.box} on this card (it has ${card.boxes.length}).`,
      );
      continue;
    }
    const sized = withSizes(s.item, h.guarded, s.item.dimUnit ?? target.specs.dimUnit);
    if (sized.unitless) edit.warnings.push(unitWarning(boxLabel(index)));
    Object.assign(setFor(target.id), sized.values);
  }

  for (const n of opts.remove ?? []) {
    const b = card.boxes[n - 1];
    if (b) edit.remove.push(b.id);
    else edit.warnings.push(`There is no box ${n} to remove.`);
  }
  // A box being removed needs no other changes.
  edit.set = edit.set.filter((s) => !edit.remove.includes(s.id) && Object.keys(s.values).length > 0);
  edit.warnings = [...new Set(edit.warnings)];
  return edit;
}

/** Values that would actually change something (repeats are reported, not planned). */
export function onlyChanges(current: Specs, values: Specs): { changed: Specs; same: FieldKey[] } {
  const changed: Specs = {};
  const same: FieldKey[] = [];
  for (const [k, v] of Object.entries(values) as [FieldKey, SpecValue][]) {
    if (v === undefined) continue;
    if (current[k] === v) same.push(k);
    else changed[k] = v;
  }
  return { changed, same };
}
