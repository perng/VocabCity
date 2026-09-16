// Vocab City: a walled Mediterranean old town. Visitors land on the harbour quay, pass the
// sea gate into the Gate Square, follow the Corso to the Cathedral Square, and continue
// into the Old Town, whose canal lanes hold a townhouse for every root family.
// Navigation, display placement, collisions and the map all share these coordinates.
// x grows east, z grows south; the sea lies to the south, the hills to the north.
//
// The plan is parametric so the collection can grow toward 2,500 words: lanes stack
// northward in rows, then in further block columns east and west of the canal, joined
// by avenues; extra themed groups line the wall walk inside the ramparts.

import counts from "./collection-counts.json" with { type: "json" };
// Landmark groups come first in the collection; every later room is a townhouse.
export const ROOT_START = counts.landmarks;
export const ROOT_COUNT = counts.houses;
export const GALLERY_COUNT = ROOT_START + ROOT_COUNT;
export const SQUARE_INDEX = 100000;
export const STREETS_INDEX = 100001;
export const isRootRoom = (room: number) => room >= ROOT_START && room < GALLERY_COUNT;
export const isWallArcade = (room: number) => room >= GALLERY_COUNT && room < SQUARE_INDEX;

// Old Town districts: winding lanes with ten houses on each side, spaced among gardens.
// After MAX_LANES, a new district opens east or west with diagonal connecting streets.
export const LANE_PITCH = 78;
export const LANE_HALF = 5;
export const HOUSES_PER_LANE = 20;
export const MAX_LANES = 8;
export const LANE_COUNT = Math.ceil(ROOT_COUNT / HOUSES_PER_LANE);
export const LANE_ROWS = Math.min(LANE_COUNT, MAX_LANES);
export const BLOCK_COLUMNS = Math.ceil(LANE_COUNT / MAX_LANES);
export const ROOT_ROOM = { width: 16, depth: 14, height: 7 } as const;
export const LANE_X = 128;
export const AVENUE_WIDTH = 38;
export const BLOCK_PITCH = LANE_X * 2 + AVENUE_WIDTH;
export const FIRST_LANE_Z = -208;
export const laneZ = (row: number) => FIRST_LANE_Z - row * LANE_PITCH - [0, 6, 0, 10, 4, 15, 8, 18][row % MAX_LANES];
export const LANE_ZS = Array.from({ length: LANE_ROWS }, (_, row) => laneZ(row));
// Column 0 sits on the canal; later columns alternate east, west, east…
export const blockOffset = (column: number) => (column === 0 ? 0 : (column % 2 ? 1 : -1) * Math.ceil(column / 2) * BLOCK_PITCH);
export const BLOCK_OFFSETS = Array.from({ length: BLOCK_COLUMNS }, (_, column) => blockOffset(column));
export const laneRow = (lane: number) => lane % MAX_LANES;
export const laneColumn = (lane: number) => Math.floor(lane / MAX_LANES);
export const laneHouseCount = (lane: number) => Math.max(0, Math.min(HOUSES_PER_LANE, ROOT_COUNT - lane * HOUSES_PER_LANE));
export const houseColumnX = (column: number) => (column < 5 ? -112 + column * 24 : 16 + (column - 5) * 24);
export const houseStyle = (room: number): "courtyard" | "shop" => ((room - ROOT_START) % 2 === 0 ? "courtyard" : "shop");
export type StreetPoint = { x: number; z: number };
// Every lane bends differently. The canal crossings stay level and wide.
export function lanePoint(lane: number, x: number): StreetPoint {
  const column = laneColumn(lane), row = laneRow(lane);
  const drift = column === 0 ? 0 : Math.sin(row * .85 + column) * 15;
  const phase = row * .9 + column * .65;
  const bend = 12 * (Math.sin(x / 48 + phase) - Math.sin(phase));
  // Keep the nearest houses parallel to the canal, clear of both towpaths.
  const bridge = column === 0 ? Math.min(1, Math.max(0, (Math.abs(x) - 24) / 48)) : 1;
  return { x: blockOffset(column) + drift + x, z: laneZ(row) + (column === 0 ? 0 : [0, -7, 8, -3][column % 4]) + bend * bridge };
}
const houseOrigins = new Map<number, { x: number; z: number; yaw: number; walk: number; setback: number }>();
export function rootRoomTransform(room: number) {
  const cached = houseOrigins.get(room); if (cached) return cached;
  const index = room - ROOT_START, lane = Math.floor(index / HOUSES_PER_LANE), slot = index % HOUSES_PER_LANE;
  const north = slot % 2 === 0, plot = Math.floor(slot / 2), x = houseColumnX(plot);
  const road = lanePoint(lane, x), before = lanePoint(lane, x - .2), after = lanePoint(lane, x + .2);
  const tangent = -Math.atan2(after.z - before.z, after.x - before.x);
  const setback = [2, 4, 1, 5, 2][(plot + lane + (north ? 0 : 2)) % 5];
  const yaw = tangent + (north ? 0 : Math.PI), distance = LANE_HALF + ROOT_ROOM.depth / 2 + setback;
  const origin = { x: road.x - Math.sin(yaw) * distance, z: road.z - Math.cos(yaw) * distance, yaw, walk: lane, setback };
  houseOrigins.set(room, origin); return origin;
}
export function houseLocal(room: number, x: number, z: number) {
  const h = rootRoomTransform(room), dx = x - h.x, dz = z - h.z;
  return { x: dx * Math.cos(h.yaw) - dz * Math.sin(h.yaw), z: dx * Math.sin(h.yaw) + dz * Math.cos(h.yaw) };
}
export const HOUSE_POSITIONS = Array.from({ length: ROOT_COUNT }, (_, i) => ({ room: ROOT_START + i, ...rootRoomTransform(ROOT_START + i) }));
export const CITY_ROADS: { id: string; kind: "lane" | "avenue" | "connector"; points: StreetPoint[]; halfWidth: number }[] = [];
for (let lane = 0; lane < LANE_COUNT; lane++) {
  CITY_ROADS.push({ id: `lane-${lane}`, kind: "lane", halfWidth: LANE_HALF,
    points: Array.from({ length: 65 }, (_, i) => lanePoint(lane, -LANE_X + i * LANE_X / 32)) });
}
for (let column = 0; column < BLOCK_COLUMNS; column++) {
  const lanes = Array.from({ length: Math.min(MAX_LANES, LANE_COUNT - column * MAX_LANES) }, (_, row) => column * MAX_LANES + row);
  CITY_ROADS.push({ id: `avenue-${column}`, kind: "avenue", halfWidth: 8,
    points: [{ x: blockOffset(column), z: -157 }, ...lanes.map(lane => lanePoint(lane, 0)), { ...lanePoint(lanes.at(-1)!, 0), z: laneZ(LANE_ROWS - 1) - 34 }] });
}
// Diagonal links stitch neighbouring districts together instead of extending every lane across the whole city.
const columnsByX = BLOCK_OFFSETS.map((x, column) => ({ x, column })).sort((a, b) => a.x - b.x);
for (let i = 1; i < columnsByX.length; i++) {
  const west = columnsByX[i - 1].column, east = columnsByX[i].column;
  for (const row of [0, 3, 6]) {
    const a = west * MAX_LANES + row, b = east * MAX_LANES + row;
    if (a < LANE_COUNT && b < LANE_COUNT) CITY_ROADS.push({ id: `link-${west}-${east}-${row}`, kind: "connector", halfWidth: 5,
      points: [lanePoint(a, LANE_X), lanePoint(b, -LANE_X)] });
  }
}
export const rootRoomLane = (room: number) => Math.floor((room - ROOT_START) / HOUSES_PER_LANE);
// Displays line the three closed walls; house information lies flat on the central floor.
const rootLeft = (z: number) => ({ x: -7.78, z, yaw: Math.PI / 2 });
const rootRight = (z: number) => ({ x: 7.78, z, yaw: -Math.PI / 2 });
const rootBack = (x: number) => ({ x, z: -6.78, yaw: 0 });
const ROOT_SLOTS: Record<number, { x: number; z: number; yaw: number }[]> = {
  6: [rootLeft(5), rootLeft(-1.2), rootBack(-4.5), rootBack(2.5), rootRight(-5), rootRight(1.2)],
  5: [rootLeft(5), rootLeft(-1.2), rootBack(-1.6), rootRight(-5), rootRight(1.2)],
  4: [rootLeft(2), rootBack(-4.5), rootBack(2.5), rootRight(-2)],
  3: [rootLeft(2), rootBack(-1.6), rootRight(-2)],
  2: [rootBack(-4.5), rootBack(2.5)],
};
export const rootRoomSlot = (slot: number, count: number) => ROOT_SLOTS[Math.min(6, Math.max(2, count))][slot];

// City extents follow the outermost houses and streets.
export const OUTER_EDGE = Math.max(...BLOCK_OFFSETS.map(Math.abs)) + LANE_X + 24;
export const WALL_WALK = 5;
const northEdge = Math.min(...HOUSE_POSITIONS.map(h => h.z)) - ROOT_ROOM.depth - 12;
export const CITY = {
  wallX: OUTER_EDGE + WALL_WALK, wallSouth: 48, wallNorth: northEdge - 8,
  quay: { south: 62, north: 50 }, seaEdge: 62,
  mole: { x0: 62, x1: 74, z0: 62, z1: 100 }, lighthouse: { x: 68, z: 108 },
  gate: { halfWidth: 6, z0: 44, z1: 50 },
  square: { x: 22, z0: 12, z1: 44, fountain: { x: 0, z: 28, r: 3.2 } },
  townHall: { x0: 22, x1: 50, z0: 14, z1: 42, door: { x: 22, z: 28 } },
  inn: { x0: -50, x1: -22, z0: 14, z1: 42, door: { x: -22, z: 28 }, well: { x: -36, z: 28 } },
  corso: { x: 8, arcade: 11.8, z0: -70, z1: 12, passageZ: -36 },
  park: { x0: -62, x1: -22, z0: -62, z1: -10, pond: { x: -46, z: -44, rx: 6, rz: 7 }, bandstand: { x: -42, z: -26, r: 3.6 } },
  market: { x0: 22, x1: 62, z0: -62, z1: -10 },
  cathedralSquare: { x: 30, z0: -110, z1: -70, statue: { x: 0, z: -90, r: 2.2 } },
  cathedral: { x: 20, z0: -150, z1: -110, door: 3 },
  sideLanes: { x0: 20, x1: 30, z0: -150, z1: -110 },
  palazzo: { x0: -60, x1: -30, z0: -108, z1: -72, door: { x: -30, z: -90 } },
  guildhall: { x0: 30, x1: 60, z0: -108, z1: -72, door: { x: 30, z: -90 } },
  cistern: { x0: 30, x1: 58, z0: -146, z1: -114, door: { x: 30, z: -130 } },
  promenade: { z0: -165, z1: -150 },
  canal: { x: 3, street: 8, z0: northEdge - 4, z1: -165 },
  bellTower: { x: 0, z: northEdge - 16 },
  observatory: { x: 0, z: northEdge - 90 },
} as const;

export type DistrictKind = "square" | "quay" | "belvedere" | "mole" | "arcade" | "park" | "stalls" | "hall" | "courtyard" | "cistern" | "wall";
export interface District {
  kind: DistrictKind;
  landmark: string;
  indoor: boolean;
  // World-aligned display placements and the pose used when travelling here.
  slots: { x: number; z: number; yaw: number }[];
  pose: { x: number; z: number; yaw: number };
  box: { x0: number; x1: number; z0: number; z1: number };
}
// A display's yaw is the direction it faces: 0 faces south (+z), PI faces north (-z),
// PI/2 faces east (+x) and -PI/2 faces west (-x). Wall displays face into their space.
const N = Math.PI, S = 0, E = Math.PI / 2, W = -Math.PI / 2;
const c = CITY;
export const DISTRICTS: District[] = [
  { kind: "square", landmark: "Gate Square", indoor: false, box: { x0: -c.square.x, x1: c.square.x, z0: c.square.z0, z1: c.square.z1 }, pose: { x: 0, z: 42, yaw: 0 },
    // The exterior walls reach ±21.4, with door trim projecting farther into the square.
    // Keep even frameless murals in front of both surfaces.
    slots: [18, 28, 38].flatMap((z) => [{ x: -21.1, z, yaw: E }, { x: 21.1, z, yaw: W }]) },
  { kind: "quay", landmark: "Harbour Quay", indoor: false, box: { x0: -56, x1: 62, z0: c.quay.north, z1: c.quay.south }, pose: { x: 0.35, z: 58, yaw: 0 },
    slots: [-36, -26, -16, 16, 26, 36].map((x) => ({ x, z: 48.7, yaw: S })) },
  { kind: "hall", landmark: "Guildhall", indoor: true, box: { x0: c.guildhall.x0, x1: c.guildhall.x1, z0: c.guildhall.z0, z1: c.guildhall.z1 }, pose: { x: 33, z: -90, yaw: -Math.PI / 2 },
    slots: [{ x: 38, z: -107.4, yaw: S }, { x: 52, z: -107.4, yaw: S }, { x: 59.4, z: -98, yaw: W }, { x: 59.4, z: -82, yaw: W }, { x: 52, z: -72.6, yaw: N }, { x: 38, z: -72.6, yaw: N }] },
  { kind: "arcade", landmark: "Corso, west arcade", indoor: false, box: { x0: -c.corso.arcade, x1: 0, z0: c.corso.z0, z1: c.corso.z1 }, pose: { x: -3.5, z: 8, yaw: 0 },
    slots: [-4, -14, -24, -44, -54, -64].map((z) => ({ x: -11.7, z, yaw: E })) },
  { kind: "park", landmark: "City Park, south lawn", indoor: false, box: { x0: c.park.x0, x1: c.park.x1, z0: -36, z1: c.park.z1 }, pose: { x: -25, z: -34, yaw: Math.PI / 2 },
    slots: [{ x: -30, z: -13.5, yaw: N }, { x: -42, z: -13.5, yaw: N }, { x: -54, z: -13.5, yaw: N }, { x: -59, z: -22, yaw: E }, { x: -59, z: -31, yaw: E }, { x: -27, z: -27, yaw: W }] },
  { kind: "hall", landmark: "Cathedral", indoor: true, box: { x0: -c.cathedral.x, x1: c.cathedral.x, z0: c.cathedral.z0, z1: c.cathedral.z1 }, pose: { x: 0, z: -113, yaw: 0 },
    slots: [{ x: -8, z: -149.4, yaw: S }, { x: 8, z: -149.4, yaw: S }, { x: -19.4, z: -138, yaw: E }, { x: -19.4, z: -124, yaw: E }, { x: 19.4, z: -138, yaw: W }, { x: 19.4, z: -124, yaw: W }] },
  { kind: "hall", landmark: "Town Hall", indoor: true, box: { x0: c.townHall.x0, x1: c.townHall.x1, z0: c.townHall.z0, z1: c.townHall.z1 }, pose: { x: 25, z: 28, yaw: -Math.PI / 2 },
    slots: [{ x: 30, z: 14.6, yaw: N }, { x: 42, z: 14.6, yaw: N }, { x: 49.4, z: 22, yaw: W }, { x: 49.4, z: 34, yaw: W }, { x: 42, z: 41.4, yaw: S }, { x: 30, z: 41.4, yaw: S }] },
  { kind: "arcade", landmark: "Corso, east arcade", indoor: false, box: { x0: 0, x1: c.corso.arcade, z0: c.corso.z0, z1: c.corso.z1 }, pose: { x: 3.5, z: 8, yaw: 0 },
    slots: [-4, -14, -24, -44, -54, -64].map((z) => ({ x: 11.7, z, yaw: W })) },
  { kind: "courtyard", landmark: "Inn Courtyard", indoor: false, box: { x0: c.inn.x0, x1: c.inn.x1, z0: c.inn.z0, z1: c.inn.z1 }, pose: { x: -25, z: 28, yaw: Math.PI / 2 },
    slots: [{ x: -42, z: 14.6, yaw: N }, { x: -30, z: 14.6, yaw: N }, { x: -49.4, z: 22, yaw: E }, { x: -49.4, z: 34, yaw: E }, { x: -30, z: 41.4, yaw: S }, { x: -42, z: 41.4, yaw: S }] },
  { kind: "park", landmark: "City Park, north grove", indoor: false, box: { x0: c.park.x0, x1: c.park.x1, z0: c.park.z0, z1: -36 }, pose: { x: -25, z: -38, yaw: Math.PI / 2 },
    slots: [{ x: -30, z: -58.5, yaw: S }, { x: -42, z: -58.5, yaw: S }, { x: -54, z: -58.5, yaw: S }, { x: -59, z: -44, yaw: E }, { x: -59, z: -52, yaw: E }, { x: -27, z: -48, yaw: W }] },
  { kind: "hall", landmark: "Palazzo", indoor: true, box: { x0: c.palazzo.x0, x1: c.palazzo.x1, z0: c.palazzo.z0, z1: c.palazzo.z1 }, pose: { x: -33, z: -90, yaw: Math.PI / 2 },
    slots: [{ x: -52, z: -107.4, yaw: S }, { x: -38, z: -107.4, yaw: S }, { x: -59.4, z: -98, yaw: E }, { x: -59.4, z: -82, yaw: E }, { x: -38, z: -72.6, yaw: N }, { x: -52, z: -72.6, yaw: N }] },
  { kind: "belvedere", landmark: "Belvedere", indoor: false, box: { x0: -c.wallX, x1: -56, z0: c.quay.north, z1: c.quay.south }, pose: { x: -60, z: 58, yaw: Math.PI / 2 },
    slots: [{ x: -62, z: 48.7, yaw: S }, { x: -70, z: 48.7, yaw: S }, { x: -78, z: 48.7, yaw: S }, { x: -86, z: 48.7, yaw: S }, { x: -c.wallX + 0.7, z: 54, yaw: E }, { x: -c.wallX + 0.7, z: 59.5, yaw: E }] },
  { kind: "stalls", landmark: "Market Square", indoor: false, box: { x0: c.market.x0, x1: c.market.x1, z0: c.market.z0, z1: c.market.z1 }, pose: { x: 25, z: -36, yaw: -Math.PI / 2 },
    slots: [{ x: -12, z: 14, yaw: N }, { x: 1, z: 20, yaw: N }, { x: -12, z: -14, yaw: S }, { x: 12, z: -14, yaw: S }, { x: 1, z: -20, yaw: S }, { x: 12, z: 14, yaw: N }].map((p) => ({ x: p.x + 42, z: p.z - 36, yaw: p.yaw })) },
  { kind: "cistern", landmark: "Cistern", indoor: true, box: { x0: c.cistern.x0, x1: c.cistern.x1, z0: c.cistern.z0, z1: c.cistern.z1 }, pose: { x: 33, z: -130, yaw: -Math.PI / 2 },
    slots: [{ x: 38, z: -145.4, yaw: S }, { x: 50, z: -145.4, yaw: S }, { x: 57.4, z: -138, yaw: W }, { x: 57.4, z: -122, yaw: W }, { x: 50, z: -114.6, yaw: N }, { x: 38, z: -114.6, yaw: N }] },
  { kind: "mole", landmark: "Harbour Mole", indoor: false, box: { x0: c.mole.x0, x1: c.mole.x1, z0: c.mole.z0, z1: c.mole.z1 }, pose: { x: 68, z: 64, yaw: Math.PI },
    slots: [{ x: 73.4, z: 70, yaw: W }, { x: 73.4, z: 80, yaw: W }, { x: 73.4, z: 90, yaw: W }, { x: 62.6, z: 75, yaw: E }, { x: 62.6, z: 85, yaw: E }, { x: 62.6, z: 95, yaw: E }] },
];
export const MARKET_CENTER = { x: 42, z: -36 };
// Future themed groups line the wall walk inside the ramparts, sixty metres per group.
export function wallArcade(room: number): District {
  const index = room - GALLERY_COUNT, west = index % 2 === 0, segment = Math.floor(index / 2);
  const x = (west ? -1 : 1) * (c.wallX - 0.7), z0 = c.promenade.z0 - 8 - segment * 64;
  return {
    kind: "wall", landmark: `Wall Walk ${west ? "west" : "east"} ${segment + 1}`, indoor: false,
    box: { x0: west ? -c.wallX : OUTER_EDGE, x1: west ? -OUTER_EDGE : c.wallX, z0: z0 - 60, z1: z0 },
    pose: { x: (west ? -1 : 1) * (c.wallX - 2.6), z: z0 - 2, yaw: 0 },
    slots: Array.from({ length: 6 }, (_, k) => ({ x, z: z0 - 6 - k * 10, yaw: west ? E : W })),
  };
}
export const districtFor = (room: number): District => (room < DISTRICTS.length ? DISTRICTS[room] : wallArcade(room));
export const CATHEDRAL_SQUARE = { id: "square", name: "Cathedral Square", subtitle: "The heart of the city. Every road meets here.", color: "#b39a6a" };
export const OLD_TOWN = { id: "oldtown", name: "The Old Town", subtitle: "Ninety-three roots along the canal lanes.", color: "#7a8a6c" };
export const ENTRY = { x: 0.35, z: 58, yaw: 0.015 };

export function galleryTransform(room: number) {
  if (isRootRoom(room)) return rootRoomTransform(room);
  return { x: 0, z: 0, yaw: 0 };
}
export function inGallery(room: number, x: number, z: number, yaw = 0) {
  const origin = galleryTransform(room);
  const cos = Math.cos(origin.yaw), s = Math.sin(origin.yaw);
  return { x: origin.x + x * cos + z * s, z: origin.z - x * s + z * cos, yaw: origin.yaw + yaw };
}
// World placement for a display slot in any room.
export function displayPlacement(room: number, slot: number, familySize = 6) {
  if (isRootRoom(room)) {
    const local = rootRoomSlot(slot, familySize);
    return { ...inGallery(room, local.x, local.z, local.yaw), area: room };
  }
  return { ...districtFor(room).slots[slot], area: room };
}
export const freestanding = (room: number) => !isRootRoom(room) && ["park", "stalls", "mole"].includes(districtFor(room).kind);
export const displayScale = (room: number) => (isRootRoom(room) || districtFor(room).indoor ? 1.3 : freestanding(room) ? 1 : 1.2);
export function roomPose(room: number) {
  if (room === SQUARE_INDEX) return { x: 0, z: -74, yaw: 0 };
  if (room === STREETS_INDEX) return { x: 0, z: -160, yaw: 0 };
  if (isRootRoom(room)) return inGallery(room, 0, 5.5, 0);
  return districtFor(room).pose;
}

const inside = (x: number, z: number, box: { x0: number; x1: number; z0: number; z1: number }, margin = 0) =>
  x >= box.x0 + margin && x <= box.x1 - margin && z >= box.z0 + margin && z <= box.z1 - margin;
export function areaAt(x: number, z: number) {
  if (z <= c.promenade.z1 + 0.01) {
    for (const house of HOUSE_POSITIONS) {
      if (Math.abs(x - house.x) > 12 || Math.abs(z - house.z) > 12) continue;
      const local = houseLocal(house.room, x, z);
      if (Math.abs(local.x) <= ROOT_ROOM.width / 2 && Math.abs(local.z) <= ROOT_ROOM.depth / 2) return house.room;
    }
    return STREETS_INDEX;
  }
  for (const [room, district] of DISTRICTS.entries()) if (inside(x, z, district.box)) return room;
  if (inside(x, z, { x0: -c.sideLanes.x1, x1: c.sideLanes.x1, z0: c.cathedral.z0, z1: c.cathedralSquare.z1 })) return SQUARE_INDEX;
  if (z > c.corso.z1) return z > c.gate.z1 ? 1 : 0;
  return x < 0 ? 3 : 7;
}
export function withinGrounds(x: number, z: number) {
  const m = 0.6;
  if (z <= c.promenade.z1) {
    if (Math.abs(x) > c.wallX - m || z < c.wallNorth + m) return false;
    const overCanal = Math.abs(x) < c.canal.x + m && z < c.canal.z1 - 4 && z > c.canal.z0 + 4;
    if (overCanal && !LANE_ZS.some(lz => Math.abs(z - lz) <= LANE_HALF - m)) return false;
    for (const house of HOUSE_POSITIONS) {
      if (Math.abs(x - house.x) > 12 || Math.abs(z - house.z) > 12) continue;
      const p = houseLocal(house.room, x, z), hw = ROOT_ROOM.width / 2, hd = ROOT_ROOM.depth / 2;
      if (Math.abs(p.x) > hw + m || Math.abs(p.z) > hd + m) continue;
      if (Math.abs(p.x) <= hw - m && Math.abs(p.z) <= hd - m) continue;
      if (Math.abs(p.x) < 4.3 && p.z > hd - m) continue; // generous front opening
      return false;
    }
    return true; // gardens and spaces between houses can be explored too
  }
  const rects: { x0: number; x1: number; z0: number; z1: number }[] = [
    { x0: -c.wallX, x1: c.mole.x0 + 2, z0: c.quay.north, z1: c.quay.south },
    { x0: c.mole.x0, x1: c.mole.x1, z0: c.mole.z0 - 2, z1: c.mole.z1 },
    { x0: -c.gate.halfWidth, x1: c.gate.halfWidth, z0: c.gate.z0 - 2, z1: c.gate.z1 + 2 },
    { x0: -c.square.x, x1: c.square.x, z0: c.square.z0 - 2, z1: c.square.z1 },
    { x0: c.townHall.x0, x1: c.townHall.x1, z0: c.townHall.z0, z1: c.townHall.z1 },
    { x0: c.townHall.x0 - 2, x1: c.townHall.x0 + 2, z0: 25, z1: 31 },
    { x0: c.inn.x0, x1: c.inn.x1, z0: c.inn.z0, z1: c.inn.z1 },
    { x0: c.inn.x1 - 2, x1: c.inn.x1 + 2, z0: 25, z1: 31 },
    { x0: -c.corso.arcade, x1: c.corso.arcade, z0: c.corso.z0 - 2, z1: c.corso.z1 + 2 },
    { x0: c.park.x1 - 2, x1: -c.corso.x + 2, z0: c.corso.passageZ - 3, z1: c.corso.passageZ + 3 },
    { x0: c.corso.x - 2, x1: c.market.x0 + 2, z0: c.corso.passageZ - 3, z1: c.corso.passageZ + 3 },
    { x0: c.park.x0, x1: c.park.x1, z0: c.park.z0, z1: c.park.z1 },
    { x0: c.market.x0, x1: c.market.x1, z0: c.market.z0, z1: c.market.z1 },
    { x0: -c.cathedralSquare.x, x1: c.cathedralSquare.x, z0: c.cathedralSquare.z0, z1: c.cathedralSquare.z1 + 2 },
    { x0: -c.sideLanes.x1, x1: -c.sideLanes.x0, z0: c.sideLanes.z0 - 2, z1: c.sideLanes.z1 + 2 },
    { x0: c.sideLanes.x0, x1: c.sideLanes.x1, z0: c.sideLanes.z0 - 2, z1: c.sideLanes.z1 + 2 },
    { x0: c.palazzo.x0, x1: c.palazzo.x1, z0: c.palazzo.z0, z1: c.palazzo.z1 },
    { x0: c.palazzo.x1 - 2, x1: c.palazzo.x1 + 2, z0: -93, z1: -87 },
    { x0: c.guildhall.x0, x1: c.guildhall.x1, z0: c.guildhall.z0, z1: c.guildhall.z1 },
    { x0: c.guildhall.x0 - 2, x1: c.guildhall.x0 + 2, z0: -93, z1: -87 },
    { x0: -c.cathedral.x, x1: c.cathedral.x, z0: c.cathedral.z0, z1: c.cathedral.z1 },
    { x0: -c.cathedral.door, x1: c.cathedral.door, z0: c.cathedral.z1 - 2, z1: c.cathedral.z1 + 2 },
    { x0: c.cistern.x0, x1: c.cistern.x1, z0: c.cistern.z0, z1: c.cistern.z1 },
    { x0: c.cistern.x0 - 2, x1: c.cistern.x0 + 2, z0: -133, z1: -127 },
    // The promenade runs the whole width of the Old Town, feeding every avenue and the wall walks.
    // It stops at the back walls of the cathedral, palazzo, guildhall and cistern; the side lanes reach down into it.
    { x0: -c.wallX, x1: c.wallX, z0: c.promenade.z0 - 2, z1: c.promenade.z1 },
    { x0: -c.canal.street, x1: c.canal.street, z0: c.canal.z0, z1: c.canal.z1 + 2 },
    ...BLOCK_OFFSETS.slice(1).map((offset) => ({ x0: offset - c.canal.street, x1: offset + c.canal.street, z0: c.canal.z0, z1: c.canal.z1 + 2 })),
    { x0: -c.wallX, x1: -OUTER_EDGE, z0: c.wallNorth, z1: c.promenade.z1 },
    { x0: OUTER_EDGE, x1: c.wallX, z0: c.wallNorth, z1: c.promenade.z1 },
  ];
  if (rects.some((r) => inside(x, z, r, m))) {
    // The canal itself is water; lanes cross it on bridges, and both ends are bridged.
    const overCanal = Math.abs(x) < c.canal.x + m && z < c.canal.z1 - 4 && z > c.canal.z0 + 4;
    const onBridge = LANE_ZS.some((lz) => Math.abs(z - lz) <= LANE_HALF - m);
    return !overCanal || onBridge;
  }
  return false;
}
export const MAP_ORIGIN = { x: c.wallX + 8, y: -c.observatory.z + 20 };
export const MAP_WIDTH = MAP_ORIGIN.x * 2;
export const MAP_HEIGHT = MAP_ORIGIN.y + 120;
export function mapPoint(x: number, z: number) {
  return { x: MAP_ORIGIN.x + x, y: MAP_ORIGIN.y + z };
}
