import type { Exhibit } from "./types";

// The collector's album groups every painting by its art style. Rare styles hang only a
// handful of times across the city (a few Byzantine mosaics, a few ukiyo-e prints), so
// completing them is a small treasure hunt; the large series fill up as you wander.
export const RARE_LIMIT = 12;
export type StyleSet = { key: string; medium: string; mediumZh: string; ids: string[]; rare: boolean };

const styleKey = (medium: string) => medium.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();

export function styleSets(exhibits: Exhibit[]): StyleSet[] {
  const groups = new Map<string, Exhibit[]>();
  for (const exhibit of exhibits) {
    const art = exhibit.artwork;
    if (!art?.medium) continue;
    const key = art.style || styleKey(art.medium);
    const members = groups.get(key) ?? [];
    members.push(exhibit); groups.set(key, members);
  }
  const list = [...groups].map(([key, members]): StyleSet => {
    // Name the style after the medium most of its paintings use.
    const counts = new Map<string, number>();
    for (const e of members) counts.set(e.artwork!.medium, (counts.get(e.artwork!.medium) ?? 0) + 1);
    const medium = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const named = members.find((e) => e.artwork!.medium === medium)!;
    return { key, medium: medium.replace(/ & /g, " and "), mediumZh: named.artwork!.mediumZh || medium, ids: members.map((e) => e.id), rare: members.length <= RARE_LIMIT };
  });
  // Rare styles first (smallest sets first), then the large series by size.
  return list.sort((a, b) => Number(b.rare) - Number(a.rare) || (a.rare ? a.ids.length - b.ids.length : b.ids.length - a.ids.length) || a.medium.localeCompare(b.medium));
}

export function styleOf(sets: StyleSet[], id: string) { return sets.find((set) => set.ids.includes(id)); }

/** What a newly discovered painting means for its style: its first find, or the set complete. */
export function styleMilestone(set: StyleSet | undefined, seenBefore: ReadonlySet<string>, id: string): "first" | "complete" | null {
  if (!set || seenBefore.has(id)) return null;
  const found = set.ids.filter((other) => other === id || seenBefore.has(other)).length;
  if (found === set.ids.length) return "complete";
  return found === 1 ? "first" : null;
}
