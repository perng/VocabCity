import { exhibitPlacements } from "./placements";
import type { Exhibit } from "./types";

// Today's walk: five paintings close to one another, chosen fresh each day from words
// the visitor has not learned yet. Finding all five keeps a gentle daily streak going.
export const DAILY_KEY = "vocabhall.daily.v1";
export const WALK_SIZE = 5;
export type DailyWalk = { day: string; ids: string[]; found: string[]; completed: string[] };

export function dayKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function seeded(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Pick an anchor painting for the day, then its nearest neighbours, at most two per room. */
export function pickWalk(day: string, exhibits: Exhibit[], visited: string[], checked: string[]): string[] {
  const learned = new Set(checked), seen = new Set(visited);
  let pool = exhibits.filter((e) => !learned.has(e.id));
  if (pool.length < WALK_SIZE) pool = exhibits;
  const fresh = pool.filter((e) => !seen.has(e.id));
  const random = seeded(`${day}:vocab-city`);
  const anchorPool = fresh.length >= WALK_SIZE ? fresh : pool;
  const anchor = anchorPool[Math.floor(random() * anchorPool.length)];
  const at = exhibitPlacements(anchor)[0];
  const distance = (e: Exhibit) => Math.min(...exhibitPlacements(e).map((p) => Math.hypot(p.x - at.x, p.z - at.z)));
  // Unseen paintings come first; within each group, nearest first.
  const ranked = pool.filter((e) => e.id !== anchor.id)
    .map((e) => ({ e, d: distance(e) + (seen.has(e.id) ? 60 : 0) }))
    .sort((a, b) => a.d - b.d);
  const picked = [anchor], perRoom = new Map([[anchor.room, 1]]);
  for (const { e } of ranked) {
    if (picked.length === WALK_SIZE) break;
    if ((perRoom.get(e.room) ?? 0) >= 2) continue;
    picked.push(e); perRoom.set(e.room, (perRoom.get(e.room) ?? 0) + 1);
  }
  return picked.map((e) => e.id);
}

export function readDaily(valid: ReadonlySet<string>): DailyWalk | null {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) || "null");
    if (!data || typeof data.day !== "string" || !Array.isArray(data.ids) || !Array.isArray(data.found) || !Array.isArray(data.completed)) return null;
    const ids = data.ids.filter((id: unknown): id is string => typeof id === "string" && valid.has(id));
    return {
      day: data.day, ids,
      found: data.found.filter((id: unknown): id is string => typeof id === "string" && ids.includes(id)),
      completed: data.completed.filter((day: unknown): day is string => typeof day === "string" && /^\d{4}-\d\d-\d\d$/.test(day)),
    };
  } catch { return null; }
}

export function saveDaily(walk: DailyWalk) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(walk)); return true; } catch { return false; }
}

/** Today's walk, reusing the stored one when it is from today. */
export function todaysWalk(stored: DailyWalk | null, exhibits: Exhibit[], visited: string[], checked: string[], today = dayKey()): DailyWalk {
  if (stored && stored.day === today && stored.ids.length === WALK_SIZE) return stored;
  return { day: today, ids: pickWalk(today, exhibits, visited, checked), found: [], completed: stored?.completed ?? [] };
}

/** Consecutive completed days, counting back from today (or yesterday, if today is still open). */
export function streak(completed: string[], today = dayKey()) {
  const days = new Set(completed);
  const cursor = new Date(`${today}T12:00:00`);
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
