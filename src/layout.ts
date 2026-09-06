// One continuous gallery volume opens at full width onto the garden terrace.
// World coordinates are shared by navigation, exhibit placement and the map.
export const HALL_SPACING = 28;
export const HALL_WIDTH = 24;
export const HALL_FRONT = 14;
export const HALL_BACK = -70;
export const HALL_HEIGHT = 8.4;
export const GARDEN_BACK = -114;
export const GARDEN_WIDTH = 60;
export const GARDEN_INDEX = 3;
export const ENTRY = { x: 0.35, z: 10.5, yaw: 0.04 };
export const GARDEN = {
  id: "garden",
  name: "The Quiet Garden",
  subtitle: "A little fresh air. A new space to wonder.",
  color: "#62815b",
};

// These words also have outdoor displays; learning progress is shared by word.
export const OUTDOOR_DISPLAYS = [
  { word: "serene", x: -9, z: -85, yaw: 0 },
  { word: "flourish", x: 9, z: -85, yaw: 0 },
  { word: "nurture", x: -22, z: -94, yaw: Math.PI / 2 },
  { word: "landscape", x: 22, z: -94, yaw: -Math.PI / 2 },
  { word: "habitat", x: -9, z: -112, yaw: 0 },
  { word: "sustainable", x: 9, z: -112, yaw: 0 },
];

export function areaAt(z: number) {
  return z < HALL_BACK
    ? GARDEN_INDEX
    : Math.min(2, Math.max(0, Math.floor((HALL_FRONT - z) / HALL_SPACING)));
}

export function withinGrounds(x: number, z: number) {
  const inHall =
    Math.abs(x) <= HALL_WIDTH / 2 - 0.6 &&
    z <= HALL_FRONT - 0.6 &&
    z >= HALL_BACK - 1;
  const inGarden =
    Math.abs(x) <= GARDEN_WIDTH / 2 - 0.6 &&
    z <= HALL_BACK - 0.6 &&
    z >= GARDEN_BACK + 0.6;
  return inHall || inGarden;
}

export function mapPoint(x: number, z: number) {
  return { x: 77 + x * 1.25, y: 173 + z * 1.25 };
}
