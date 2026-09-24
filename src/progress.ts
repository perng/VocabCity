import type { Exhibit } from "./types";

// Progress you can finish: every landmark group and townhouse is a small set of words.
// A place is "explored" once every painting in it has been opened, and "mastered" once
// every one of its words is checked as learned.
export type PlaceState = "new" | "started" | "explored" | "mastered";
export type PlaceProgress = { total: number; discovered: number; learned: number; state: PlaceState };

/** Distinct word ids hanging in each room, including words shared through root families. */
export function roomWordIds(exhibits: Exhibit[], roomCount: number): string[][] {
  const ids: Set<string>[] = Array.from({ length: roomCount }, () => new Set());
  for (const exhibit of exhibits) for (const room of roomsOf(exhibit)) ids[room]?.add(exhibit.id);
  return ids.map((set) => [...set]);
}

export const roomsOf = (exhibit: Exhibit) => [...new Set([exhibit.room, ...(exhibit.families ?? []).map((family) => family.room)])];

export function placeProgress(ids: string[], visited: ReadonlySet<string>, checked: ReadonlySet<string>): PlaceProgress {
  const discovered = ids.filter((id) => visited.has(id)).length;
  const learned = ids.filter((id) => checked.has(id)).length;
  const total = ids.length;
  const state: PlaceState = !total || !discovered && !learned ? "new"
    : learned === total ? "mastered" : discovered === total ? "explored" : "started";
  return { total, discovered, learned, state };
}

/** Rooms that become fully explored (or mastered) when `id` joins the given set. */
export function newlyComplete(rooms: number[], roomIds: string[][], before: ReadonlySet<string>, id: string) {
  if (before.has(id)) return [];
  return rooms.filter((room) => roomIds[room].length > 0 && roomIds[room].every((word) => word === id || before.has(word)));
}
