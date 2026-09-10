import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import collection from '../src/collection.json' with { type: 'json' };
import zh from '../src/zh-TW.json' with { type: 'json' };
import { CITY, DISTRICTS, GALLERY_COUNT, LANE_ZS, ROOT_COUNT, ROOT_START, displayPlacement, displayScale, freestanding, houseStyle, rootRoomTransform } from '../src/layout';

async function enter(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vocabhall.locale.v1', ''));
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Handy 990 mascot waving hello' })).toBeVisible();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
}
const world = (page: Page, axis: 'x' | 'z') => async () => Number(await page.locator(`.minimap [data-world-${axis}]`).getAttribute(`data-world-${axis}`));
const heading = (page: Page) => page.locator('.gallery-heading strong');
const room = (index: number) => collection.rooms[index].name;
const zhName = (index: number) => (zh as Record<string, string>)[collection.rooms[index].name];
async function hold(page: Page, key: string, until: () => Promise<boolean>, timeout = 15000) {
  await page.keyboard.down(key);
  try { await expect.poll(until, { timeout, intervals: [50] }).toBe(true); } finally { await page.keyboard.up(key); }
}
async function settle(page: Page, key: string, ms = 1500) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
// Project a point on a display from the camera pose reached by visiting the exhibit.
async function clickDisplay(page: Page, roomIndex: number, slot: number, x: number, y: number, z: number, familySize = 6) {
  const placement = displayPlacement(roomIndex, slot, familySize), scale = displayScale(roomIndex), open = freestanding(roomIndex);
  const canvas = (await page.locator('canvas').boundingBox())!;
  const camera = new PerspectiveCamera(68, canvas.width / canvas.height, 0.08, 330);
  const axis = new Vector3(0, 1, 0), normal = new Vector3(0, 0, 1).applyAxisAngle(axis, placement.yaw);
  camera.position.set(placement.x, 1.78, placement.z).addScaledVector(normal, open ? 4.3 : 4.9);
  camera.rotation.set(open ? 0.2 : 0.29, placement.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
  const point = new Vector3(x * scale, y * scale, z * scale).applyAxisAngle(axis, placement.yaw).add(new Vector3(placement.x, 0, placement.z)).project(camera);
  expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
  await page.mouse.click(canvas.x + (point.x + 1) * canvas.width / 2, canvas.y + (1 - point.y) * canvas.height / 2);
}
async function visitFromCollection(page: Page, word: string, filterLabel?: string) {
  await page.getByRole('button', { name: `The collection${collection.exhibits.length}`, exact: true }).click();
  if (filterLabel) await page.getByRole('combobox', { name: 'Filter by gallery' }).selectOption({ label: filterLabel });
  await page.getByRole('button', { name: word, exact: true }).click();
  await page.getByRole('button', { name: 'Close exhibit', exact: true }).click();
  await expect(page.locator('.scene')).not.toHaveClass(/room-transition/);
}

test('the quay leads through the sea gate, up the Corso and into the cathedral, with solid walls', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page);
  const x = world(page, 'x'), z = world(page, 'z');
  expect(await z()).toBe(58);
  await expect(heading(page)).toHaveText(room(1));
  await page.screenshot({ path: 'test-results/city-quay.png' });
  // The sea edge stops the visitor.
  await settle(page, 's', 1500);
  expect(await z()).toBeLessThanOrEqual(CITY.quay.south - 0.5);
  await page.keyboard.down('Shift');
  await hold(page, 'w', async () => (await z()) < CITY.gate.z0 - 2);
  await expect(heading(page)).toHaveText(room(0));
  await page.screenshot({ path: 'test-results/city-gate-square.png' });
  // Round the fountain on its east side, then the statue in the Cathedral Square.
  await hold(page, 'd', async () => (await x()) > 5.5);
  await hold(page, 'w', async () => (await z()) < CITY.corso.z1 - 4);
  await expect(heading(page)).toHaveText(room(7));
  await hold(page, 'w', async () => (await z()) < CITY.cathedralSquare.z1 - 4);
  await expect(heading(page)).toHaveText('Cathedral Square');
  await page.screenshot({ path: 'test-results/city-cathedral-square.png' });
  await hold(page, 'w', async () => (await z()) < CITY.cathedralSquare.statue.z - 6);
  await hold(page, 'a', async () => (await x()) < 0.8);
  await hold(page, 'w', async () => (await z()) < CITY.cathedral.z1 - 3, 25000);
  await expect(heading(page)).toHaveText(room(5));
  await settle(page, 'w', 5000);
  expect(await z()).toBeGreaterThanOrEqual(CITY.cathedral.z0 + 0.5);
  await page.keyboard.up('Shift');
  // Side walls of the nave hold.
  await settle(page, 'a', 4000);
  expect(await x()).toBeGreaterThanOrEqual(-CITY.cathedral.x + 0.5);
  await page.screenshot({ path: 'test-results/city-cathedral.png' });
});

test('the Town Hall opens through its door, and open-air displays in the park and market take clicks', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('https://youglish.com/public/emb/widget.js', route => route.abort());
  await enter(page);
  const x = world(page, 'x'), z = world(page, 'z');
  await page.getByRole('button', { name: 'Floor map', exact: true }).click();
  await page.locator('.room-list > button').filter({ hasText: room(6) }).click();
  await expect(heading(page)).toHaveText(room(6));
  await hold(page, 'w', async () => (await x()) > CITY.townHall.x1 - 6);
  await settle(page, 'w', 2500);
  expect(await x()).toBeLessThanOrEqual(CITY.townHall.x1 - 0.5);
  await settle(page, 'd', 5000);
  expect(await z()).toBeGreaterThanOrEqual(CITY.townHall.z0 + 0.5);
  // Market stalls: checkbox controls answer clicks at several orientations.
  const stalls = collection.exhibits.filter(e => e.room === 12);
  for (const exhibit of stalls.slice(0, 3)) {
    await visitFromCollection(page, exhibit.word);
    await clickDisplay(page, 12, exhibit.slot, 1.65, 4.32, 0.18);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.learned.v1') || '[]'))).toContain(exhibit.id);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const grove = collection.exhibits.find(e => e.room === 9 && e.slot === 3)!;
  await visitFromCollection(page, grove.word);
  await expect(heading(page)).toHaveText(room(9));
  await clickDisplay(page, 9, grove.slot, -1.06, 1.335, 0.1);
  await expect(page.getByRole('dialog', { name: `Video examples: ${grove.word}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close video', exact: true }).click();
  await clickDisplay(page, 9, grove.slot, 0, 2.85, 0.18);
  await expect(page.getByRole('heading', { name: grove.word, exact: true })).toBeVisible();
  await expect(page.locator('.exhibit-sheet')).toContainText(DISTRICTS[9].landmark.toUpperCase());
  await page.screenshot({ path: 'test-results/city-park-exhibit.png' });
});

test('a Gate Square painting opens by raycast; meanings, audio, saved words, and discovery persist', async ({ page }) => {
  await enter(page);
  const curiosity = collection.exhibits.find(e => e.word === 'curiosity')!;
  await visitFromCollection(page, 'curiosity');
  await clickDisplay(page, curiosity.room, curiosity.slot, 0, 2.85, 0.18);
  const dialog = page.getByRole('dialog', { name: 'Vocabulary exhibit: curiosity', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.audio-status')).toContainText('Listening to word');
  await expect(dialog.getByText(curiosity.definition, { exact: true })).toBeVisible();
  await dialog.getByLabel('Translation language').selectOption('ja_JP');
  await expect(dialog.getByText(curiosity.translations.ja_JP, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep this word', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Saved to my words' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'delicate', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'My words 1', exact: true }).click();
  await expect(page.locator('.collection-card')).toHaveCount(1);
  await expect(page.locator('.visit-progress strong')).toContainText('2');
});

test('the Old Town canal blocks the way except at bridges, and lanes open into courtyard and shop houses', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page);
  expect(collection.rooms).toHaveLength(GALLERY_COUNT);
  const x = world(page, 'x'), z = world(page, 'z');
  await page.getByRole('button', { name: 'Floor map', exact: true }).click();
  await page.locator('.wing-shortcuts > button').filter({ hasText: 'The Old Town' }).click();
  await expect(heading(page)).toHaveText('The Old Town');
  // Straight ahead is water: the visitor stops at the canal head.
  await settle(page, 'w', 3000);
  expect(await z()).toBeGreaterThan(CITY.canal.z1 - 5);
  // Along the east walkway to the first lane, then west across its bridge.
  await hold(page, 'd', async () => (await x()) > 4.5);
  await page.keyboard.down('Shift');
  await hold(page, 'w', async () => Math.abs((await z()) - LANE_ZS[0]) < 1.2, 20000);
  await page.keyboard.up('Shift');
  await hold(page, 'a', async () => (await x()) < -4);
  expect(Math.abs((await z()) - LANE_ZS[0])).toBeLessThan(3);
  await expect(heading(page)).toHaveText('The Old Town');
  await page.screenshot({ path: 'test-results/city-canal-bridge.png' });
  await page.keyboard.down('Shift');
  await hold(page, 'a', async () => (await x()) < -15, 20000);
  await page.keyboard.up('Shift');
  // South of the lane is a shop house, north a courtyard house.
  const south = ROOT_START + 4 * 2 + 1, north = ROOT_START + 4 * 2;
  expect(houseStyle(south)).toBe('shop'); expect(houseStyle(north)).toBe('courtyard');
  expect(rootRoomTransform(south).z).toBeGreaterThan(LANE_ZS[0]);
  await hold(page, 's', async () => (await z()) > rootRoomTransform(south).z - 2);
  await expect(heading(page)).toHaveText(room(south));
  await settle(page, 's', 3000);
  expect(await z()).toBeLessThanOrEqual(rootRoomTransform(south).z + 6.6);
  await page.screenshot({ path: 'test-results/city-shop-house.png' });
  await hold(page, 'w', async () => (await z()) < rootRoomTransform(north).z + 2, 20000);
  await expect(heading(page)).toHaveText(room(north));
  await page.screenshot({ path: 'test-results/city-courtyard-house.png' });
});

test('root houses show their pieces, link the family, and shared words open in the chosen house', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__rootAudio = [] as HTMLAudioElement[];
    window.Audio = class extends NativeAudio {
      constructor(url?: string) { super(url); (window as any).__rootAudio.push(this); }
    };
  });
  await enter(page);
  await page.getByRole('button', { name: 'Floor map', exact: true }).click();
  await expect(page.locator('.root-grid > button')).toHaveCount(ROOT_COUNT);
  await expect(page.locator('.root-grid-heading .eyebrow').first()).toContainText('ROOT FAMILY HOUSES');
  await page.locator('.root-grid > button').filter({ has: page.locator('em', { hasText: /^struct$/ }) }).click();
  await expect(heading(page)).toHaveText('Root Family · struct');
  await page.getByRole('button', { name: `The collection${collection.exhibits.length}`, exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by gallery' }).selectOption({ label: 'Root Family · graph' });
  await expect(page.locator('.collection-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'biography', exact: true }).click();
  const biography = page.getByRole('dialog', { name: 'Vocabulary exhibit: biography', exact: true });
  await expect(biography.locator('.root-family')).toHaveCount(2);
  await expect(biography.locator('.root-pieces > span.is-root')).toHaveText(['biolife', 'graphyto write or record']);
  await expect(biography).toContainText('ROOT FAMILY · graph');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: `The collection${collection.exhibits.length}`, exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by gallery' }).selectOption({ label: 'Root Family · struct' });
  await expect(page.locator('.collection-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'structure', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Vocabulary exhibit: structure', exact: true });
  await expect(dialog).toContainText('ROOT FAMILY · struct');
  await expect(dialog.locator('.root-pieces > span')).toHaveText(['structto build', 'ureact or result']);
  await expect(dialog.locator('.root-links > button')).toHaveText(['construct', 'instruct', 'instructor', 'destruction', 'infrastructure']);
  await expect(dialog).toContainText('Latin struere, structus (to build)');
  await dialog.getByRole('button', { name: 'infrastructure', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'infrastructure', exact: true })).toBeVisible();
  await expect(page.locator('.root-pieces > span')).toHaveText(['infrabelow or beneath', 'structto build', 'ureact or result']);
  await expect.poll(() => page.evaluate(() => ((window as any).__rootAudio.at(-1) as HTMLAudioElement).src)).toContain('/audio/infrastructure.m4a');
  await page.getByRole('button', { name: 'Close exhibit', exact: true }).click();
  const struct = rootRoomTransform(ROOT_START + 1);
  expect(Math.abs(await world(page, 'x')() - struct.x)).toBeLessThan(9);
  expect(Math.abs(await world(page, 'z')() - struct.z)).toBeLessThan(8);
  await expect(heading(page)).toHaveText('Root Family · struct');
  await page.screenshot({ path: 'test-results/city-root-exhibit.png' });
});

test('a phone follows the localized next-stop route through the landmarks and into the Old Town', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('img', { name: '單手刷990 吉祥物揮手歡迎你' })).toBeVisible();
  await page.getByRole('button', { name: '開始漫遊', exact: true }).click();
  await expect(page.locator('.gallery-heading strong')).toHaveText(zhName(1));
  for (const index of [14, 11, 0, 8, 6, 3, 7, 4, 9, 12, 10, 2, 5, 13]) {
    const next = page.getByRole('button', { name: `下一站 · ${zhName(index)}`, exact: true });
    await expect(next).toBeVisible();
    const bounds = (await next.boundingBox())!; expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await next.click(); await expect(page.locator('.gallery-heading strong')).toHaveText(zhName(index));
  }
  await page.getByRole('button', { name: '下一站 · 舊城區', exact: true }).click();
  await expect(page.locator('.gallery-heading strong')).toHaveText('舊城區');
  for (const root of ['port', 'struct', 'spect']) {
    await page.getByRole('button', { name: `下一個字根 · 字根家族 · ${root}`, exact: true }).click();
    await expect(page.locator('.gallery-heading strong')).toHaveText(`字根家族 · ${root}`);
  }
  await page.screenshot({ path: 'test-results/city-mobile-house.png' });
  await page.getByRole('button', { name: '展館地圖', exact: true }).click();
  await expect(page.locator('.room-list > button')).toHaveCount(17);
  await expect(page.locator('.wing-shortcuts > button')).toHaveCount(9);
  await page.locator('.root-grid').first().locator('> button').last().click();
  await expect(page.locator('.gallery-heading strong')).toHaveText('字根家族 · volv');
  await page.getByRole('button', { name: '回到廣場 · 主教座堂廣場', exact: true }).click();
  await expect(page.locator('.gallery-heading strong')).toHaveText('主教座堂廣場');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('mobile checkmarks control the frame glow and honor reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole('button', { name: 'My words 0', exact: true }).click();
  await page.getByRole('button', { name: 'Explore all exhibits', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search vocabulary' }).fill('collaboration');
  const frame = page.locator('.collection-card');
  const checkbox = page.getByRole('checkbox', { name: 'Learned: collaboration', exact: true });
  await expect(frame).toHaveCSS('animation-name', 'learning-glow');
  await checkbox.check();
  await expect(frame).toHaveAttribute('data-checked', 'true');
  await expect(frame).toHaveCSS('animation-name', 'none');
  await checkbox.uncheck();
  await expect(frame).toHaveCSS('animation-name', 'learning-glow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(frame).toHaveCSS('animation-name', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('YouGlish loads on demand, fetches the chosen word, cleans up, and can recover after failure', async ({ page }) => {
  let loads = 0;
  await page.route('https://youglish.com/public/emb/widget.js', async (route) => {
    loads++;
    if (loads === 1) return route.abort();
    // Exercise our official-provider contract without depending on network or video availability.
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
      window.__videoEvents = [];
      window.YG = { Widget: class {
        constructor(host, options) { this.host = host; this.options = options; }
        fetch(word, language) {
          window.__videoEvents.push({ word, language, autoStart: this.options.autoStart });
          this.host.innerHTML = '<iframe title="YouGlish video example" style="width:100%;height:250px"></iframe>';
          this.options.events.onFetchDone({ totalResult: 10 });
          this.options.events.onPlayerReady();
        }
        pause() { window.__videoEvents.push('pause'); }
        close() { window.__videoEvents.push('close'); this.host.remove(); }
      }};
      window.onYouglishAPIReady();
    `,
    });
  });
  await enter(page);
  expect(loads).toBe(0);
  await page.getByRole('button', { name: /The collection/ }).click();
  await page.getByRole('button', { name: 'Watch video examples: serene', exact: true }).click();
  await expect(page.getByText('The video provider is unavailable here. You can retry or open YouGlish.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.youglish-host iframe')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__videoEvents)).toEqual([{ word: 'serene', language: 'english', autoStart: 0 }]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.youglish-host iframe')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__videoEvents.slice(-2))).toEqual(['pause', 'close']);
  await page.getByRole('button', { name: 'Watch video examples: flourish', exact: true }).click();
  await expect(page.locator('.youglish-host iframe')).toBeVisible();
  expect(loads).toBe(2);
  expect(await page.evaluate(() => (window as any).__videoEvents.at(-1))).toEqual({ word: 'flourish', language: 'english', autoStart: 0 });
});
