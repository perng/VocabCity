import { test, expect, type Page } from '@playwright/test';
import collection from '../src/collection.json' with { type: 'json' };
import type { Exhibit, Room } from '../src/types';
import { newlyComplete, placeProgress, roomWordIds } from '../src/progress';
import { pickWalk, streak, todaysWalk, WALK_SIZE } from '../src/daily';
import { registerFamilySizes } from '../src/placements';

const exhibits = collection.exhibits as Exhibit[];
const rooms = collection.rooms as Room[];
registerFamilySizes(rooms);
const ROOM_WORDS = roomWordIds(exhibits, rooms.length);
const house = rooms.findIndex((room) => room.house);

async function enter(page: Page, storage: Record<string, unknown> = {}) {
  await page.addInitScript((storage) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('vocabhall.locale.v1', '');
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value));
  }, storage);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
}
async function openFromCollection(page: Page, exhibit: Exhibit) {
  await page.getByRole('button', { name: /^The collection/ }).click();
  await page.getByLabel('Search vocabulary').fill(exhibit.word);
  await page.locator('.collection-word', { hasText: new RegExp(`^${exhibit.word}$`) }).first().click();
  await expect(page.getByRole('dialog', { name: `Vocabulary exhibit: ${exhibit.word}` })).toBeVisible();
}

test('place progress counts shared words and reports newly finished places', () => {
  const ids = ROOM_WORDS[house];
  expect(ids.length).toBeGreaterThanOrEqual(2);
  expect(new Set(ids).size).toBe(ids.length);
  expect(placeProgress(ids, new Set(), new Set()).state).toBe('new');
  expect(placeProgress(ids, new Set(ids.slice(1)), new Set()).state).toBe('started');
  expect(placeProgress(ids, new Set(ids), new Set()).state).toBe('explored');
  expect(placeProgress(ids, new Set(), new Set(ids)).state).toBe('mastered');
  const last = exhibits.find((e) => e.id === ids[0])!;
  const roomsOfLast = [last.room, ...(last.families ?? []).map((f) => f.room)];
  expect(newlyComplete(roomsOfLast, ROOM_WORDS, new Set(ids.slice(1)), ids[0])).toContain(house);
  expect(newlyComplete(roomsOfLast, ROOM_WORDS, new Set(ids), ids[0])).toEqual([]);
  // Every exhibit is counted in its home room and in each root family it joins.
  for (const exhibit of exhibits.slice(0, 200)) {
    expect(ROOM_WORDS[exhibit.room]).toContain(exhibit.id);
    for (const family of exhibit.families ?? []) expect(ROOM_WORDS[family.room]).toContain(exhibit.id);
  }
});

test('the daily walk is stable for a day, stays nearby, skips learned words and counts streaks', () => {
  const walk = pickWalk('2026-09-24', exhibits, [], []);
  expect(walk).toHaveLength(WALK_SIZE);
  expect(new Set(walk).size).toBe(WALK_SIZE);
  expect(pickWalk('2026-09-24', exhibits, [], [])).toEqual(walk);
  expect(pickWalk('2026-09-25', exhibits, [], [])).not.toEqual(walk);
  const perRoom = new Map<number, number>();
  for (const id of walk) { const room = exhibits.find((e) => e.id === id)!.room; perRoom.set(room, (perRoom.get(room) ?? 0) + 1); }
  expect(Math.max(...perRoom.values())).toBeLessThanOrEqual(2);
  const learned = exhibits.slice(0, 2000).map((e) => e.id);
  expect(pickWalk('2026-09-24', exhibits, [], learned).every((id) => !learned.includes(id))).toBe(true);
  const stored = { day: '2026-09-24', ids: walk, found: [walk[0]], completed: ['2026-09-23'] };
  expect(todaysWalk(stored, exhibits, [], [], '2026-09-24')).toBe(stored);
  const tomorrow = todaysWalk(stored, exhibits, [], [], '2026-09-25');
  expect(tomorrow.found).toEqual([]);
  expect(tomorrow.completed).toEqual(['2026-09-23']);
  expect(streak(['2026-09-22', '2026-09-23'], '2026-09-24')).toBe(2);
  expect(streak(['2026-09-22', '2026-09-23', '2026-09-24'], '2026-09-24')).toBe(3);
  expect(streak(['2026-09-21', '2026-09-23'], '2026-09-24')).toBe(1);
  expect(streak(['2026-09-20'], '2026-09-24')).toBe(0);
});

test('opening the last painting of a house celebrates it, lights its lanterns and marks the map', async ({ page }) => {
  test.setTimeout(90000);
  const ids = ROOM_WORDS[house];
  await enter(page, { 'vocabhall.visited.v1': ids.slice(1) });
  await page.evaluate((room) => (window as any).__museum.goToRoom(room), house);
  await expect(page.locator('.visit-progress')).toHaveAttribute('data-state', 'started');
  await expect(page.locator('.visit-progress .place-progress strong')).toHaveText(`${ids.length - 1} / ${ids.length}`);
  await expect(page.locator('.word-dots i[data-state=seen]')).toHaveCount(ids.length - 1);
  const lit = () => page.evaluate((room) => {
    const zone = (window as any).__museum.zones.find((z: any) => z.room === room);
    return zone?.marks?.glass.map((g: any) => g.emissiveIntensity > 0) ?? null;
  }, house);
  await expect.poll(lit).toEqual([false, false]);
  await openFromCollection(page, exhibits.find((e) => e.id === ids[0])!);
  await expect(page.locator('.milestone-banner')).toContainText('House explored!');
  await expect(page.locator('.milestone-live')).toContainText(`${ids.length} words discovered`);
  await page.keyboard.press('Escape');
  await expect(page.locator('.visit-progress')).toHaveAttribute('data-state', 'explored');
  await expect.poll(lit).toEqual([true, true]);
  // Checking every word masters the house: stars appear beside its sign.
  await page.evaluate((ids) => localStorage.setItem('vocabhall.learned.v1', JSON.stringify(ids.slice(1))), ids);
  await page.reload();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await page.evaluate((room) => (window as any).__museum.goToRoom(room), house);
  await openFromCollection(page, exhibits.find((e) => e.id === ids[0])!);
  await page.getByRole('dialog').getByRole('checkbox', { name: `Learned: ${exhibits.find((e) => e.id === ids[0])!.word}` }).check();
  await expect(page.locator('.milestone-banner')).toContainText('House mastered!');
  await page.keyboard.press('Escape');
  await expect(page.locator('.visit-progress')).toHaveAttribute('data-state', 'mastered');
  await expect.poll(() => page.evaluate((room) => (window as any).__museum.zones.find((z: any) => z.room === room)?.marks?.stars.every((s: any) => s.visible), house)).toBe(true);
  await page.getByRole('button', { name: 'Open museum floor map', exact: true }).click();
  await expect(page.locator(`.expanded-floorplan rect[data-state=mastered]`)).toHaveCount(1);
});

test('today\'s walk marks finds, completes with a streak and shows stars in the city and on the map', async ({ page }) => {
  test.setTimeout(90000);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const before = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
  const ids = pickWalk(day, exhibits, [], []);
  await enter(page, { 'vocabhall.daily.v1': { day, ids, found: [], completed: [before] } });
  const chip = page.locator('.walk-chip');
  await expect(chip).toContainText('0 / 5');
  await expect(chip.locator('em')).toHaveText('1');
  expect(await page.evaluate(() => (window as any).__museum.walkMarkers.length)).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.minimap .walk-target').first()).toBeAttached();
  await chip.click();
  const dialog = page.getByRole('dialog', { name: "Today's walk" });
  await expect(dialog.locator('.walk-list li')).toHaveCount(5);
  await expect(dialog.locator('.walk-list li[data-found=true]')).toHaveCount(0);
  await dialog.locator('.walk-go').first().click();
  await expect(dialog).toBeHidden();
  for (const [i, id] of ids.entries()) {
    await openFromCollection(page, exhibits.find((e) => e.id === id)!);
    await expect(chip).toContainText(`${i + 1} / 5`);
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.milestone-live')).toContainText("Today's walk is complete! 2 days in a row", { timeout: 15000 });
  await expect(chip).toHaveAttribute('data-complete', 'true');
  await expect(chip.locator('em')).toHaveText('2');
  expect(await page.evaluate(() => (window as any).__museum.walkMarkers.length)).toBe(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.daily.v1')!));
  expect(saved.completed).toEqual([before, day]);
  expect(saved.found.sort()).toEqual([...ids].sort());
});

test('the city moves near the visitor, pauses behind dialogs, and residents wave and react', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  const gulls = () => page.evaluate(() => {
    const m = (window as any).__museum; const points: number[] = [];
    m.scene.traverse((o: any) => { if (o.type === 'Group' && o.children[0]?.geometry?.parameters?.radius === 0.16) points.push(o.position.x, o.position.y, o.position.z); });
    return points;
  });
  await expect.poll(async () => (await gulls()).some((v) => v !== 0)).toBe(true);
  const a = await gulls();
  await page.waitForTimeout(400);
  expect(await gulls()).not.toEqual(a);
  // Luca stands on the quay beside the entrance and waves at a visitor who can chat.
  const shoulder = () => page.evaluate(() => (window as any).__museum.scene.getObjectByName('resident:sailor').children.find((c: any) => c.type === 'Group').rotation.z);
  await expect.poll(shoulder).toBeGreaterThan(1.5);
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  const paused = await gulls();
  await page.waitForTimeout(400);
  expect(await gulls()).toEqual(paused);
  // The chat face reacts to a miss and to the right word.
  const clue = await page.locator('.resident-clue').innerText();
  const target = exhibits.find((e) => e.definition === clue)!;
  await page.locator('.resident-choices button').filter({ hasNotText: target.word }).first().click();
  await expect(page.locator('.resident-avatar')).toHaveAttribute('data-mood', 'puzzled');
  await page.getByRole('button', { name: target.word, exact: true }).click();
  await expect(page.locator('.resident-avatar')).toHaveAttribute('data-mood', 'happy');
  await expect(page.locator('.celebrations i').first()).toBeAttached();
});

test('sound effects can be switched off and the choice persists', async ({ page }) => {
  await enter(page);
  const toggle = page.getByRole('button', { name: 'Turn off sound effects', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Turn on sound effects', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('vocabhall.sfx.v1'))).toBe('off');
  await page.reload();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn on sound effects', exact: true })).toBeVisible();
});
