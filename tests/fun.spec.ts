import { test, expect, type Page } from '@playwright/test';
import collection from '../src/collection.json' with { type: 'json' };
import type { Exhibit, Room } from '../src/types';
import { newlyComplete, placeProgress, roomWordIds } from '../src/progress';
import { pickWalk, streak, todaysWalk, WALK_SIZE } from '../src/daily';
import { registerFamilySizes } from '../src/placements';
import { styleMilestone, styleSets } from '../src/album';

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

test('a neighbour\'s favour sends you looking by meaning, then grows the friendship', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page);
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  const clue = await page.locator('.resident-clue').innerText();
  await page.getByRole('button', { name: "I'll look for them", exact: true }).click();
  await expect(page.locator('.favour-list li')).toHaveCount(3);
  await expect(page.locator('.favour-list')).not.toContainText(clue);
  const favour = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.favours.v1')!).sailor);
  expect(favour.level).toBe(0);
  expect(favour.active.ids).toHaveLength(3);
  const words = favour.active.ids.map((id: string) => exhibits.find((e) => e.id === id)!);
  // Luca's words hang on the quay or the mole.
  for (const word of words) expect([word.room, ...(word.families ?? []).map((f) => f.room)].some((room) => [1, 14].includes(room))).toBe(true);
  await page.keyboard.press('Escape');
  const chip = page.locator('.favour-chip');
  await expect(chip).toContainText('0 / 3');
  for (const [i, word] of words.entries()) {
    await openFromCollection(page, word);
    await page.keyboard.press('Escape');
    await expect(chip).toContainText(`${i + 1} / 3`);
  }
  await expect(chip).toHaveAttribute('data-ready', 'true');
  // The chip shows the clues, then walks you back to the neighbour.
  await chip.click();
  await expect(page.getByRole('dialog', { name: 'Favour for Luca' }).locator('.favour-list li[data-found=true]')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Favour for Luca' })).toContainText('You found all three!');
  await page.getByRole('button', { name: 'Bring them back to Luca', exact: true }).click();
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  await expect(page.locator('.favour-card')).toContainText('You found all three!');
  await page.getByRole('button', { name: 'Hand them over', exact: true }).click();
  await expect(page.locator('.milestone-live')).toContainText('My logbook is ready');
  await expect(page.locator('.resident-avatar')).toHaveAttribute('data-mood', 'cheer');
  await expect(page.locator('.friendship svg[fill=currentColor]')).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.favours.v1')!).sailor);
  expect(saved).toEqual({ level: 1, active: null, asked: favour.active.ids });
  expect(await page.evaluate(() => (window as any).__museum.friendship.sailor)).toBe(1);
  expect(await page.evaluate(() => !!(window as any).__museum.scene.getObjectByName('gift:sailor'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(chip).toHaveCount(0);
  // Luca hops for joy once the chat closes.
  await expect.poll(() => page.evaluate(() => (window as any).__museum.scene.getObjectByName('resident:sailor').position.y)).toBeGreaterThan(0.05);
  // The next favour avoids words already asked for.
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  await page.getByRole('button', { name: "I'll look for them", exact: true }).click();
  const next = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.favours.v1')!).sailor.active.ids);
  expect(next.some((id: string) => favour.active.ids.includes(id))).toBe(false);
});

test('the album groups every painting into styles and celebrates rare finds', async ({ page }) => {
  const sets = styleSets(exhibits);
  expect(sets.flatMap((set) => set.ids).sort()).toEqual(exhibits.map((e) => e.id).sort());
  expect(sets.filter((set) => set.rare).length).toBeGreaterThan(40);
  const ukiyo = sets.find((set) => set.key === 'ukiyo-e')!;
  expect(ukiyo.rare).toBe(true);
  expect(ukiyo.medium).toBe('Ukiyo-e woodblock print');
  expect(styleMilestone(ukiyo, new Set(), ukiyo.ids[0])).toBe('first');
  expect(styleMilestone(ukiyo, new Set(ukiyo.ids.slice(1)), ukiyo.ids[0])).toBe('complete');
  expect(styleMilestone(ukiyo, new Set([ukiyo.ids[1]]), ukiyo.ids[0])).toBeNull();
  await enter(page, { 'vocabhall.visited.v1': ukiyo.ids.slice(1) });
  await page.getByRole('button', { name: /^Album/ }).click();
  const card = page.locator('.album-set', { hasText: 'Ukiyo-e woodblock print' });
  await expect(card).toContainText(`${ukiyo.ids.length - 1} / ${ukiyo.ids.length}`);
  await expect(card.locator('.album-frame.is-empty')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await openFromCollection(page, exhibits.find((e) => e.id === ukiyo.ids[0])!);
  await expect(page.locator('.milestone-live')).toContainText(`Style complete! Ukiyo-e woodblock print · ${ukiyo.ids.length} / ${ukiyo.ids.length}`, { timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Album/ }).click();
  await expect(card).toHaveAttribute('data-complete', 'true');
  // An empty frame walks you to the painting's neighbourhood.
  const empty = page.locator('.album-frame.is-empty').first();
  await empty.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a flashcard sends a postcard image of its painting and word', async ({ page }) => {
  await enter(page);
  const exhibit = exhibits[95];
  await openFromCollection(page, exhibit);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Send a postcard', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`vocab-city-${exhibit.word}.png`);
  const size = (await (await import('node:fs/promises')).stat(await file.path())).size;
  expect(size).toBeGreaterThan(200_000);
  await expect(page.locator('.milestone-live')).toContainText('A postcard from Vocab City! Saved as an image.');
});

test('a painting that lost its label asks for its word before opening, then gets its label back', async ({ page }) => {
  test.setTimeout(90000);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const target = exhibits.find((e) => e.room === 0)!;
  const settled = exhibits.filter((e) => e.room > 20).slice(0, 12).map((e) => e.id);
  await enter(page, { 'vocabhall.visited.v1': settled, 'vocabhall.labels.v1': { day, ids: [target.id], restored: [], total: 4 } });
  const state = () => page.evaluate((id) => {
    const m = (window as any).__museum; let banner = false, note = true;
    m.scene.traverse((o: any) => {
      if (o.userData.wordBanner && o.userData.target.exhibit.id === id) banner = o.material.map === m.lostTexture;
      if (o.userData.captionFor === id) note = o.visible;
    });
    return { banner, note };
  }, target.id);
  await expect.poll(state).toEqual({ banner: true, note: false });
  await page.evaluate((id) => { const m = (window as any).__museum; m.options.onSelect(m.options.exhibits.find((e: any) => e.id === id), 0); }, target.id);
  const dialog = page.getByRole('dialog', { name: 'A label blew away!' });
  await expect(dialog.locator('.label-choices button')).toHaveCount(3);
  await dialog.locator('.label-choices button').filter({ hasNotText: new RegExp(`^${target.word}$`) }).first().click();
  await expect(dialog.locator('.label-hint')).toContainText(target.definition);
  await dialog.getByRole('button', { name: target.word, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Vocabulary exhibit: ${target.word}` })).toBeVisible();
  await expect(page.locator('.milestone-live')).toContainText('Label restored! 1 / 1');
  await expect.poll(state).toEqual({ banner: false, note: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.labels.v1')!));
  expect(saved).toEqual({ day, ids: [target.id], restored: [target.id], total: 5 });
});

test('a missed word comes back first and clears after right answers on two days', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  const clue = await page.locator('.resident-clue').innerText();
  const target = exhibits.find((e) => e.definition === clue)!;
  await page.locator('.resident-choices button').filter({ hasNotText: target.word }).first().click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.review.v1')!));
  expect(Object.keys(stored)).toEqual([target.id]);
  expect(stored[target.id].misses).toBe(1);
  // A right answer on the same day does not clear it yet.
  await page.getByRole('button', { name: target.word, exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^The collection/ }).click();
  await page.getByRole('button', { name: /^To revisit/ }).click();
  await expect(page.locator('.collection-card')).toHaveCount(1);
  await expect(page.locator('.collection-word')).toHaveText(target.word);
  await page.keyboard.press('Escape');
  // Later chats ask it first; right answers on two different days clear it.
  for (const day of ['2000-01-01', '2000-01-02']) {
    await page.evaluate(([id, day]) => {
      const book = JSON.parse(localStorage.getItem('vocabhall.review.v1')!);
      book[id].last = day; localStorage.setItem('vocabhall.review.v1', JSON.stringify(book));
    }, [target.id, day]);
    await page.reload();
    await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
    await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
    await expect(page.locator('.resident-clue')).toHaveText(target.definition);
    await page.getByRole('button', { name: target.word, exact: true }).click();
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.review.v1')!))).toEqual({});
});

test('the city journal gathers progress and points at places that are almost done', async ({ page }) => {
  const ids = ROOM_WORDS[house];
  await enter(page, { 'vocabhall.visited.v1': ids.slice(1), 'vocabhall.learned.v1': ids.slice(0, 1) });
  await page.locator('.city-progress').click();
  const dialog = page.getByRole('dialog', { name: 'Your city journal' });
  await expect(dialog.locator('.journal-tiles > div').first()).toContainText(`${ids.length - 1}/ ${exhibits.length}words discovered`);
  const goal = dialog.locator('.journal-goals li', { hasText: '1 painting left to explore' }).first();
  await expect(goal).toBeVisible();
  await goal.getByRole('button', { name: 'Take me there' }).click();
  await expect(dialog).toBeHidden();
});

test('the corner tour continues from the first unseen painting where you stand', async ({ page }) => {
  const quay = ROOM_WORDS[1].map((id) => exhibits.find((e) => e.id === id)!);
  await enter(page, { 'vocabhall.visited.v1': [quay[0].id] });
  await page.getByRole('button', { name: 'Tour from here', exact: true }).click();
  await expect(page.getByRole('heading', { name: quay[1].word, exact: true })).toBeVisible();
  await expect(page.locator('.exhibit-footer')).toContainText('YOUR GUIDED TOUR');
});

test('round numbers of discovered words get a banner', async ({ page }) => {
  const seen = exhibits.slice(200, 209).map((e) => e.id);
  await enter(page, { 'vocabhall.visited.v1': seen });
  await openFromCollection(page, exhibits[300]);
  await expect(page.locator('.milestone-live')).toContainText('10 words discovered!', { timeout: 8000 });
});

test('a street challenge appears underfoot; stepping on the right word wins it', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page, { 'vocabhall.challenges.v1': { won: 2, off: false } });
  // The Gate Square is open ground; face along the square so the tiles fit.
  await page.evaluate(() => { const m = (window as any).__museum; m.camera.position.set(0, 1.78, 40); m.yaw = 0; m.needsRender = true; });
  await expect.poll(() => page.evaluate(() => (window as any).__offerChallenge())).toBe(true);
  const card = page.getByRole('region', { name: 'Street challenge' });
  await expect(card.locator('.challenge-options button')).toHaveCount(3);
  const clue = await card.locator('strong').innerText();
  const answer = exhibits.find((e) => e.definition === clue)!;
  const tiles = () => page.evaluate(() => {
    const m = (window as any).__museum, group = m.challenge?.group; const out: Record<string, number[]> = {};
    group?.children.forEach((c: any) => { if (c.userData.challengeAnswer) { const p = c.getWorldPosition(c.position.clone()); out[c.userData.challengeAnswer] = [p.x, p.z]; } });
    return out;
  });
  const positions = await tiles();
  expect(Object.keys(positions)).toContain(answer.id);
  // A wrong tile by clicking its button, then walking onto the right tile.
  await card.locator('.challenge-options button').filter({ hasNotText: new RegExp(`^${answer.word}$`) }).first().click();
  await expect(card.locator('button[data-wrong=true]')).toHaveCount(1);
  expect(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.review.v1')!)))).toEqual([answer.id]);
  await page.evaluate(([x, z]) => { const m = (window as any).__museum; m.camera.position.set(x, 1.78, z); m.needsRender = true; }, positions[answer.id]);
  await expect(card).toHaveAttribute('data-solved', 'true');
  await expect(page.locator('.milestone-live')).toContainText(`Well stepped! ${answer.word} · 3 street challenges won`);
  await expect(card).toHaveCount(0, { timeout: 6000 });
  expect(await page.evaluate(() => (window as any).__museum.challengeActive)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.challenges.v1')!))).toEqual({ won: 3, off: false });
  // Walking away lets a challenge go; turning them off keeps them away.
  await page.evaluate(() => { const m = (window as any).__museum; m.camera.position.set(0, 1.78, 40); m.yaw = 0; });
  await expect.poll(() => page.evaluate(() => (window as any).__offerChallenge())).toBe(true);
  await page.evaluate(() => { const m = (window as any).__museum; m.camera.position.set(0, 1.78, 14); m.needsRender = true; });
  await expect(page.getByRole('region', { name: 'Street challenge' })).toHaveCount(0);
  await page.evaluate(() => { const m = (window as any).__museum; m.camera.position.set(0, 1.78, 40); m.yaw = 0; });
  await expect.poll(() => page.evaluate(() => (window as any).__offerChallenge())).toBe(true);
  await page.getByRole('button', { name: 'Turn off street challenges', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.challenges.v1')!).off)).toBe(true);
});

test('the golden painting twinkles, gives hints on request, and counts only when found in the city', async ({ page }) => {
  test.setTimeout(90000);
  const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const golden = exhibits.find((e) => e.room === 0)!;
  await enter(page, { 'vocabhall.golden.v1': { day, id: golden.id, found: false, hints: 0, total: 1 } });
  await expect.poll(() => page.evaluate(() => (window as any).__museum.golden?.sprites.length ?? 0)).toBeGreaterThan(0);
  // Opening it from the collection does not count.
  await openFromCollection(page, golden);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.golden.v1')!).found)).toBe(false);
  await page.locator('.walk-chip').click();
  const card = page.locator('.golden-card');
  await expect(card.locator('.golden-hints li')).toHaveCount(0);
  for (let i = 0; i < 3; i++) await card.getByRole('button').click();
  await expect(card.locator('.golden-hints li')).toHaveCount(3);
  await expect(card).toContainText(golden.definition);
  await expect(card.getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.minimap .golden-target').first()).toBeAttached();
  // Clicking it in the city finds it.
  await page.evaluate((id) => { const m = (window as any).__museum; m.options.onSelect(m.options.exhibits.find((e: any) => e.id === id), 0); }, golden.id);
  await expect(page.locator('.milestone-live')).toContainText(`You found today's golden painting! ${golden.word} · 2 golden paintings found`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.golden.v1')!))).toMatchObject({ found: true, total: 2, hints: 3 });
  await expect.poll(() => page.evaluate(() => (window as any).__museum.golden)).toBeNull();
});
