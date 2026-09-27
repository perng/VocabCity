import { seeded } from "./daily";
import type { Exhibit } from "./types";

// The golden painting of the day: one painting somewhere in the city shimmers gold.
// It only counts when found in the city itself, and hints come one at a time on request.
export const GOLDEN_KEY = "vocabhall.golden.v1";
export type Golden = { day: string; id: string; found: boolean; hints: number; total: number };

export function pickGolden(day: string, exhibits: Exhibit[], checked: string[], avoid: string[]): string {
  const random = seeded(`${day}:golden`);
  const learned = new Set(checked);
  const pool = exhibits.filter((e) => !learned.has(e.id) && !avoid.includes(e.id));
  const from = pool.length ? pool : exhibits;
  return from[Math.floor(random() * from.length)].id;
}
export function readGolden(valid: ReadonlySet<string>): Golden | null {
  try {
    const d = JSON.parse(localStorage.getItem(GOLDEN_KEY) || "null");
    if (!d || typeof d.day !== "string" || typeof d.id !== "string" || !valid.has(d.id)) return null;
    return { day: d.day, id: d.id, found: d.found === true, hints: Math.min(3, Math.max(0, Number(d.hints) | 0)), total: Math.max(0, Number(d.total) | 0) };
  } catch { return null; }
}
export function saveGolden(golden: Golden) {
  try { localStorage.setItem(GOLDEN_KEY, JSON.stringify(golden)); } catch { /* Kept for this visit. */ }
}
export function todaysGolden(stored: Golden | null, exhibits: Exhibit[], checked: string[], avoid: string[], today: string): Golden {
  if (stored && stored.day === today) return stored;
  return { day: today, id: pickGolden(today, exhibits, checked, avoid), found: false, hints: 0, total: stored?.total ?? 0 };
}
