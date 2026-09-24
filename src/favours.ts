import { residentPool, type Resident } from "./residents";
import { shuffle } from "./games";
import type { Exhibit } from "./types";

// Favours: each neighbour asks for three paintings from their part of the city, described
// only by meaning. Find and open them, bring them back, and the friendship grows.
export const FAVOURS_KEY = "vocabhall.favours.v1";
export const FAVOUR_SIZE = 3;
export type Favour = { ids: string[]; found: string[] };
export type Friendship = { level: number; active: Favour | null; asked: string[] };
export type FavourBook = Record<string, Friendship>;

export function readFavours(residents: Resident[], valid: ReadonlySet<string>): FavourBook {
  try {
    const data = JSON.parse(localStorage.getItem(FAVOURS_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const ids = (list: unknown) => Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && valid.has(id)) : [];
    return Object.fromEntries(residents.flatMap((npc) => {
      const entry = data[npc.id];
      if (!entry || !Number.isSafeInteger(entry.level) || entry.level < 0) return [];
      const active = entry.active && ids(entry.active.ids).length === FAVOUR_SIZE
        ? { ids: ids(entry.active.ids), found: ids(entry.active.found).filter((id) => entry.active.ids.includes(id)) } : null;
      return [[npc.id, { level: entry.level, active, asked: ids(entry.asked) }]];
    }));
  } catch { return {}; }
}
export function saveFavours(book: FavourBook) {
  try { localStorage.setItem(FAVOURS_KEY, JSON.stringify(book)); return true; } catch { return false; }
}

/** Three words from the resident's neighbourhood, not asked before, unlearned first. */
export function favourWords(npc: Resident, exhibits: Exhibit[], checked: string[], asked: string[], avoid: string[] = []): string[] {
  const everyone = residentPool(npc, exhibits), apart = everyone.filter((e) => !avoid.includes(e.id));
  const pool = apart.length >= FAVOUR_SIZE ? apart : everyone;
  const fresh = pool.filter((e) => !asked.includes(e.id));
  const source = fresh.length >= FAVOUR_SIZE ? fresh : pool;
  return [...shuffle(source.filter((e) => !checked.includes(e.id))), ...shuffle(source.filter((e) => checked.includes(e.id)))]
    .slice(0, FAVOUR_SIZE).map((e) => e.id);
}

export const favourFound = (favour: Favour | null | undefined) => !!favour && favour.found.length === favour.ids.length;
