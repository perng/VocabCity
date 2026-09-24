import { seeded } from "./daily";
import type { Exhibit } from "./types";

// Lost labels: every day the wind takes the word banners off a few paintings, one in each
// landmark and a handful in the Old Town. Clicking such a painting asks which word belongs
// to it; the right answer puts the label back and opens the flashcard.
export const LABELS_KEY = "vocabhall.labels.v1";
export const HOUSE_LABELS = 5;
export type LostLabels = { day: string; ids: string[]; restored: string[]; total: number };

export function pickLostLabels(day: string, exhibits: Exhibit[], landmarkCount: number, checked: string[]): string[] {
  const random = seeded(`${day}:lost-labels`);
  const learned = new Set(checked);
  const pick = (pool: Exhibit[]) => {
    const fresh = pool.filter((e) => !learned.has(e.id));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.floor(random() * from.length)] : null;
  };
  const ids: string[] = [];
  for (let room = 0; room < landmarkCount; room++) {
    const chosen = pick(exhibits.filter((e) => e.room === room));
    if (chosen) ids.push(chosen.id);
  }
  const houses = exhibits.filter((e) => e.room >= landmarkCount);
  for (let i = 0; i < HOUSE_LABELS; i++) {
    const chosen = pick(houses.filter((e) => !ids.includes(e.id)));
    if (chosen) ids.push(chosen.id);
  }
  return ids;
}

export function readLabels(valid: ReadonlySet<string>): LostLabels | null {
  try {
    const data = JSON.parse(localStorage.getItem(LABELS_KEY) || "null");
    if (!data || typeof data.day !== "string" || !Array.isArray(data.ids) || !Array.isArray(data.restored) || !Number.isSafeInteger(data.total)) return null;
    const ids = data.ids.filter((id: unknown): id is string => typeof id === "string" && valid.has(id));
    return { day: data.day, ids, restored: data.restored.filter((id: unknown): id is string => typeof id === "string" && ids.includes(id)), total: Math.max(0, data.total) };
  } catch { return null; }
}
export function saveLabels(labels: LostLabels) {
  try { localStorage.setItem(LABELS_KEY, JSON.stringify(labels)); } catch { /* The labels stay for this visit. */ }
}
export function todaysLabels(stored: LostLabels | null, exhibits: Exhibit[], landmarkCount: number, checked: string[], today: string): LostLabels {
  if (stored && stored.day === today) return stored;
  return { day: today, ids: pickLostLabels(today, exhibits, landmarkCount, checked), restored: [], total: stored?.total ?? 0 };
}
/** Three word choices for a painting: its own word and two others from the same place. */
export function labelChoices(target: Exhibit, exhibits: Exhibit[], day: string): Exhibit[] {
  const random = seeded(`${day}:${target.id}`);
  const near = exhibits.filter((e) => e.id !== target.id && e.room === target.room && e.word.toLowerCase() !== target.word.toLowerCase());
  const pool = near.length >= 2 ? near : exhibits.filter((e) => e.id !== target.id);
  const others: Exhibit[] = [];
  while (others.length < 2 && others.length < pool.length) {
    const next = pool[Math.floor(random() * pool.length)];
    if (!others.includes(next)) others.push(next);
  }
  return [target, ...others].map((e) => ({ e, k: random() })).sort((a, b) => a.k - b.k).map(({ e }) => e);
}
