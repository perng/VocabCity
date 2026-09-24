import { displayPlacement } from "./layout";
import type { Exhibit, Room } from "./types";

// World placements of the paintings, kept free of Three.js so plain modules and tests can use them.
export function exhibitPlacement(exhibit: Pick<Exhibit, "room" | "slot">) {
  return displayPlacement(exhibit.room, exhibit.slot, familySize(exhibit.room));
}

// Root rooms hold between two and six family words; slots are laid out per room size.
const familySizes = new Map<number, number>();
export function registerFamilySizes(rooms: Room[]) {
  rooms.forEach((room, index) => { if (room.root) familySizes.set(index, room.root.words.length); });
}
const familySize = (room: number) => familySizes.get(room) ?? 6;
export function exhibitPlacements(exhibit: Exhibit) {
  return [
    exhibitPlacement(exhibit),
    // A word hangs once in every root family it belongs to, besides its home district.
    ...(exhibit.families ?? []).filter((family) => family.room !== exhibit.room).map((family) => exhibitPlacement(family)),
  ];
}
export const familyIn = (exhibit: Exhibit, room: number) => exhibit.families?.find((family) => family.room === room);
