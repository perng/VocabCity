import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import collection from '../src/collection.json' with { type: 'json' };
import { CITY, CITY_ROADS, DISTRICTS, ENTRY, HOUSE_POSITIONS, ROOT_ROOM, ROOT_START, areaAt, houseLocal, inGallery, roomPose, withinGrounds } from '../src/layout';

// Audit real route geometry so future house counts cannot create sealed entrances or overlapping buildings.
test('every angled house has an open approach, solid walls, and space between neighbouring buildings', () => {
  const issues: string[] = [];
  for (const h of HOUSE_POSITIONS) {
    const pose = roomPose(h.room);
    if (!withinGrounds(pose.x, pose.z) || areaAt(pose.x, pose.z) !== h.room) issues.push(`house ${h.room}: arrival`);
    for (let z = 0; z <= ROOT_ROOM.depth / 2 + h.setback + 5; z += .25) {
      for (const x of [-3, 0, 3]) {
        const p = inGallery(h.room, x, z);
        if (!withinGrounds(p.x, p.z)) issues.push(`house ${h.room}: approach ${x},${z}`);
      }
    }
    for (const [x, z] of [[-8, 0], [8, 0], [0, -7]]) {
      const p = inGallery(h.room, x, z);
      if (withinGrounds(p.x, p.z)) issues.push(`house ${h.room}: open wall ${x},${z}`);
    }
    // Separating axes for oriented footprints, including half a metre of clearance.
    const corners = (room: number) => [-1, 1].flatMap(x => [-1, 1].map(z => inGallery(room, x * 8.25, z * 7.25)));
    for (const other of HOUSE_POSITIONS) {
      if (other.room <= h.room || Math.hypot(other.x - h.x, other.z - h.z) > 24) continue;
      const a = corners(h.room), b = corners(other.room);
      const separated = [h.yaw, h.yaw + Math.PI / 2, other.yaw, other.yaw + Math.PI / 2].some(yaw => {
        const project = (p: {x: number; z: number}) => p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
        const pa = a.map(project), pb = b.map(project);
        return Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa);
      });
      if (!separated) issues.push(`houses ${h.room} and ${other.room}: overlapping footprints`);
    }
  }
  expect(issues).toEqual([]);
});

test('winding lanes and diagonal connectors stay open across the city', () => {
  const blocked: string[] = [];
  for (const x of [-5.2, 5.2]) for (let z = CITY.canal.z0 + 5; z < CITY.canal.z1; z += .25) {
    if (!withinGrounds(x, z)) blocked.push(`canal path: ${x},${z.toFixed(1)}`);
  }
  for (const road of CITY_ROADS.filter(r => r.id !== 'avenue-0')) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const distance = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(distance / .5);
      for (let n = 0; n <= steps; n++) {
        const x = a.x + (b.x - a.x) * n / steps, z = a.z + (b.z - a.z) * n / steps;
        if (!withinGrounds(x, z) || areaAt(x, z) < 100000) blocked.push(`${road.id}: ${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
  }
  expect(blocked).toEqual([]);
});

async function enter(page: Page, room: number) {
  await page.addInitScript(() => localStorage.setItem('vocabhall.locale.v1', ''));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  // Public navigation positions the visitor; all motion under test uses real keyboard events.
  await page.evaluate(room => (window as any).__museum.goToRoom(room), room);
  await expect.poll(() => page.evaluate(() => !!(window as any).__museum.transition)).toBe(false);
}
const position = (page: Page) => page.evaluate(() => {
  const p = (window as any).__museum.camera.position;
  return {x: p.x, z: p.z};
});
const distance = (a: {x: number; z: number}, b: {x: number; z: number}) => Math.hypot(a.x - b.x, a.z - b.z);

test('holding W accelerates, releasing or opening a dialog resets speed, and reverse remains a walk', async ({page}) => {
  await enter(page, 7); // The long, unobstructed east side of the Corso.
  const start = await position(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  const walk = await position(page);
  await page.waitForTimeout(3400);
  const run = await position(page);
  await page.waitForTimeout(600);
  const runEnd = await position(page);
  await page.keyboard.up('w');
  const walkingDistance = distance(start, walk), runningDistance = distance(run, runEnd);
  expect(walkingDistance).toBeGreaterThan(1.2);
  expect(runningDistance).toBeGreaterThan(walkingDistance * 2);
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  const restart = await position(page);
  expect(distance(runEnd, restart)).toBeLessThan(3.3);
  await page.keyboard.down('s'); await page.waitForTimeout(4000); await page.keyboard.up('s');
  const reverse = await position(page);
  expect(distance(restart, reverse)).toBeGreaterThan(10);
  expect(distance(restart, reverse)).toBeLessThan(20);
  await page.keyboard.down('w'); await page.waitForTimeout(3400);
  await page.getByRole('button', {name: 'Floor map', exact: true}).click();
  await page.keyboard.up('w');
  const paused = await position(page);
  await page.waitForTimeout(300);
  expect(distance(paused, await position(page))).toBeLessThan(.01);
  await page.keyboard.press('Escape');
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  expect(distance(paused, await position(page))).toBeLessThan(3.3);
});

test('running cannot cross a rotated house wall or an unbridged canal edge', async ({page}) => {
  await enter(page, ROOT_START);
  await page.keyboard.down('w'); await page.waitForTimeout(6000); await page.keyboard.up('w');
  let p = await position(page);
  expect(houseLocal(ROOT_START, p.x, p.z).z).toBeGreaterThanOrEqual(-ROOT_ROOM.depth / 2 + .59);
  expect(houseLocal(ROOT_START, p.x, p.z).z).toBeLessThan(-5);
  await page.evaluate(() => (window as any).__museum.goToRoom(100001));
  await expect.poll(() => page.evaluate(() => !!(window as any).__museum.transition)).toBe(false);
  await page.keyboard.down('w'); await page.waitForTimeout(5000); await page.keyboard.up('w');
  p = await position(page);
  expect(p.z).toBeGreaterThanOrEqual(CITY.canal.z1 - 4.01);
});

test('eighteen refreshed market and garden works load at native resolution and retain recordings', async ({page}) => {
  await enter(page, 12);
  const manifests = ['market-refresh', ...['a', 'b', 'c'].map(batch => `garden-refresh-${batch}`)];
  const specs = manifests.flatMap(name => JSON.parse(readFileSync(`art-direction/${name}-2026-09-12.json`, 'utf8')).artworks);
  expect(specs).toHaveLength(18);
  for (const spec of specs) {
    const e = collection.exhibits.find(e => e.word === spec.word)!;
    expect([4, 9, 12]).toContain(e.room);
    expect(e.image).toContain('-20260912.webp');
    const size = await page.evaluate(src => new Promise<number[]>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = reject; image.src = src;
    }), e.image);
    expect(Math.min(...size)).toBeGreaterThanOrEqual(1024);
    expect((await page.request.get(e.audio!)).ok()).toBe(true);
    expect((await page.request.get(e.exampleAudio!)).ok()).toBe(true);
  }
});

// Every landmark must be reachable on foot from the landing, obstacles included: the Harbour Mole
// was once sealed off by a sliver of quay and a bollard in its mouth.
test('every landmark can be walked to from the landing', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page, 1);
  const bounds = { x0: -CITY.market.x1 - 20, x1: CITY.mole.x1 + 10, z0: CITY.promenade.z0 - 2, z1: CITY.mole.z1 + 2 };
  const poses = DISTRICTS.filter((d) => d.kind !== 'wall').map((d) => ({ name: d.landmark, ...d.pose }));
  const unreachable = await page.evaluate(({ bounds, poses, entry }) => {
    const m = (window as any).__museum, S = 0.5;
    const W = Math.ceil((bounds.x1 - bounds.x0) / S) + 1, H = Math.ceil((bounds.z1 - bounds.z0) / S) + 1;
    const idx = (x: number, z: number) => Math.round((z - bounds.z0) / S) * W + Math.round((x - bounds.x0) / S);
    const ok = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = m.canMove(bounds.x0 + i * S, bounds.z0 + j * S) ? 1 : 0;
    const stack = [idx(entry.x, entry.z)]; seen[stack[0]] = 1;
    while (stack.length) {
      const k = stack.pop()!, i = k % W, j = (k - i) / W;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        const n = b * W + a;
        if (a >= 0 && b >= 0 && a < W && b < H && ok[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    return poses.filter((p) => !seen[idx(p.x, p.z)]).map((p) => p.name);
  }, { bounds, poses, entry: ENTRY });
  expect(unreachable).toEqual([]);
});
