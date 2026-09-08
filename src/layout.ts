// The central gallery and two broad wings meet in a door-free entrance hall.
// Navigation, display placement, collisions and maps share these coordinates.
export const HALL_SPACING = 28;
export const HALL_WIDTH = 24;
export const HALL_FRONT = 14;
export const HALL_BACK = -70;
export const HALL_HEIGHT = 8.4;
export const GARDEN_BACK = -114;
export const GARDEN_WIDTH = 60;
export const GALLERY_COUNT = 9;
export const GARDEN_INDEX = GALLERY_COUNT;
export const ENTRANCE_INDEX = GALLERY_COUNT + 1;
export const ATRIUM_FRONT = 42;
export const WING_END = 102;
export const ENTRY = { x: 0.35, z: 61, yaw: 0.015 };
export const GALLERY_ENTRY = { x: 0.35, z: 10.5, yaw: 0.04 };
export const GARDEN = {
  id: 'garden', name: 'The Quiet Garden',
  subtitle: 'A little fresh air. A new space to wonder.', color: '#62815b',
};
export const ENTRANCE = {
  id: 'entrance', name: 'The Welcome Hall',
  subtitle: 'Three directions. A world of words.', color: '#a28d62',
};
export function galleryTransform(room: number) {
  if (room < 3) return { x: 0, z: -room * HALL_SPACING, yaw: 0 };
  const west = room < 6;
  const section = west ? room - 3 : room - 6;
  return { x: (west ? -1 : 1) * (32 + section * HALL_SPACING), z: 28, yaw: west ? Math.PI / 2 : -Math.PI / 2 };
}
export function inGallery(room: number, x: number, z: number, yaw = 0) {
  const origin = galleryTransform(room);
  const c = Math.cos(origin.yaw), s = Math.sin(origin.yaw);
  return { x: origin.x + x * c + z * s, z: origin.z - x * s + z * c, yaw: origin.yaw + yaw };
}
export const OUTDOOR_DISPLAYS = [
  { word: 'serene', x: -9, z: -85, yaw: 0 },
  { word: 'flourish', x: 9, z: -85, yaw: 0 },
  { word: 'nurture', x: -22, z: -94, yaw: Math.PI / 2 },
  { word: 'landscape', x: 22, z: -94, yaw: -Math.PI / 2 },
  { word: 'habitat', x: -9, z: -112, yaw: 0 },
  { word: 'sustainable', x: 9, z: -112, yaw: 0 },
];
export function areaAt(x: number, z: number) {
  if (z < HALL_BACK) return GARDEN_INDEX;
  if (z > HALL_FRONT) {
    if (x < -18) return 3 + Math.min(2, Math.floor((-x - 18) / HALL_SPACING));
    if (x > 18) return 6 + Math.min(2, Math.floor((x - 18) / HALL_SPACING));
    return ENTRANCE_INDEX;
  }
  return Math.min(2, Math.max(0, Math.floor((HALL_FRONT - z) / HALL_SPACING)));
}
export function withinGrounds(x: number, z: number) {
  const inHall = Math.abs(x) <= HALL_WIDTH / 2 - 0.6 && z <= HALL_FRONT + 1 && z >= HALL_BACK - 1;
  const inGarden = Math.abs(x) <= GARDEN_WIDTH / 2 - 0.6 && z <= HALL_BACK - 0.6 && z >= GARDEN_BACK + 0.6;
  const inAtrium = Math.abs(x) <= 17.4 && z >= HALL_FRONT - 0.1 && z <= ATRIUM_FRONT - 0.6;
  const inWings = Math.abs(x) <= WING_END - 0.6 && z >= 16.6 && z <= 39.4;
  const inGate = Math.abs(x) <= 6.3 && z >= 41 && z <= 49;
  const inForecourt = Math.abs(x) <= 17.4 && z >= 48 && z <= 65.4;
  return inHall || inGarden || inAtrium || inWings || inGate || inForecourt;
}
export function mapPoint(x: number, z: number) {
  return { x: 122 + x, y: 133 + z };
}
