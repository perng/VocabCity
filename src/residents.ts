import { ROOT_START, SQUARE_INDEX, STREETS_INDEX } from "./layout";
import { makeRounds, type GameRound } from "./games";
import type { Exhibit } from "./types";

export type Resident = {
  id: string; name: string; role: string; location: string; greeting: string;
  x: number; z: number; yaw: number; area: number; rooms: number[]; color: string;
};

export const RESIDENTS: Resident[] = [
  { id: "sailor", name: "Luca", role: "The sailor", location: "Harbour Quay", color: "#567c94",
    x: 3.6, z: 55, yaw: 0, area: 1, rooms: [1, 14],
    greeting: "Welcome ashore! Help me find the words for my next voyage." },
  { id: "guide", name: "Ada", role: "The city guide", location: "Gate Square", color: "#b97e4f",
    x: -5, z: 38, yaw: 0, area: 0, rooms: [0, 6, 8],
    greeting: "Every corner has a story. Shall we try three words from this neighbourhood?" },
  { id: "gardener", name: "Fern", role: "The gardener", location: "City Park", color: "#65825a",
    x: -33, z: -33, yaw: Math.PI / 2, area: 4, rooms: [4, 9],
    greeting: "There is always something growing here. Do you know these nature words?" },
  { id: "merchant", name: "Ravi", role: "The merchant", location: "Market Square", color: "#ad6654",
    x: 33, z: -35, yaw: -Math.PI / 2, area: 12, rooms: [12],
    greeting: "A good merchant knows just the right word. Can you help with these descriptions?" },
  { id: "historian", name: "Cleo", role: "The historian", location: "Cathedral Square", color: "#817294",
    x: -6, z: -103, yaw: 0, area: SQUARE_INDEX, rooms: [5, 10, 13],
    greeting: "These old stones have heard so many words. Let us discover a few together." },
  { id: "librarian", name: "Nora", role: "The librarian", location: "The Old Town", color: "#668b86",
    x: 6, z: -157, yaw: 0, area: STREETS_INDEX, rooms: [ROOT_START, ROOT_START + 1, ROOT_START + 2],
    greeting: "Welcome to the root houses. A few familiar pieces can unlock a whole family of words." },
];

export const ENCOUNTER_DISTANCE = 4.8;
export function nearbyResident(pose: { x: number; z: number; room: number }) {
  return RESIDENTS.find(npc => npc.area === pose.room && Math.hypot(pose.x - npc.x, pose.z - npc.z) <= ENCOUNTER_DISTANCE) ?? null;
}

export const ENCOUNTERS_KEY = "vocabhall.encounters.v1";
export type EncounterProgress = Record<string, { visits: number; best: number; words: string[] }>;
export function readEncounters(): EncounterProgress {
  try {
    const data = JSON.parse(localStorage.getItem(ENCOUNTERS_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(RESIDENTS.flatMap(npc => {
      const p = data[npc.id];
      return p && Number.isSafeInteger(p.visits) && p.visits > 0 && Number.isInteger(p.best) && p.best >= 0 && p.best <= 3 &&
        Array.isArray(p.words) && p.words.every((id: unknown) => typeof id === "string") ? [[npc.id, p]] : [];
    }));
  } catch { return {}; }
}

export function residentRounds(npc: Resident, exhibits: Exhibit[], checked: string[], practiced: string[]): GameRound[] {
  // Use the collection's source meanings, with one distinct word and meaning per option.
  const pool = exhibits.filter(e => npc.rooms.includes(e.room) || e.families?.some(f => npc.rooms.includes(f.room)));
  const unique = pool.filter((e, i) => e.definition.trim() && pool.findIndex(other =>
    other.word.toLowerCase() === e.word.toLowerCase() || other.definition.toLowerCase() === e.definition.toLowerCase()) === i);
  if (unique.length < 2) return [];
  return makeRounds(unique, [...checked, ...practiced]);
}
