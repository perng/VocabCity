import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import collection from '../src/collection.json' with { type: 'json' };
import { galleryTransform, inGallery, placeExhibitSlot } from '../src/layout';

async function enter(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vocabhall.locale.v1', ''));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
}
async function visit(page: Page, room: number) {
  await page.getByRole('button', { name: 'Floor map', exact: true }).click();
  await page.locator('.room-list > button').filter({ hasText: collection.rooms[room].name }).click();
  await expect(page.locator('.scene')).not.toHaveClass(/room-transition/);
  await expect(page.locator('.gallery-heading strong')).toHaveText(collection.rooms[room].name);
}
const world = (page: Page, axis: 'x' | 'z') => async () => Number(await page.locator(`.minimap [data-world-${axis}]`).getAttribute(`data-world-${axis}`));

// Project real exhibit controls from the camera destination reached through the UI.
async function clickDisplay(page: Page, room: number, slot: number, x: number, y: number, z: number) {
  const p = placeExhibitSlot(room, slot), placement = inGallery(room, p.x, p.z, p.yaw);
  const canvas = (await page.locator('canvas').boundingBox())!;
  const camera = new PerspectiveCamera(68, canvas.width / canvas.height, 0.08, 330);
  const axis = new Vector3(0, 1, 0), normal = new Vector3(0, 0, 1).applyAxisAngle(axis, placement.yaw);
  camera.position.set(placement.x, 1.78, placement.z).addScaledVector(normal, 4.3);
  camera.rotation.set(0.2, placement.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
  const point = new Vector3(x, y, z).applyAxisAngle(axis, placement.yaw).add(new Vector3(placement.x, 0, placement.z)).project(camera);
  expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
  await page.mouse.click(canvas.x + (point.x + 1) * canvas.width / 2, canvas.y + (1 - point.y) * canvas.height / 2);
}

test('visitors can walk from the garden through six settings and stop safely at the waterfront rail', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page); await visit(page, 9);
  const z = world(page, 'z');
  await page.keyboard.down('Shift'); await page.keyboard.down('s');
  await expect.poll(z, { timeout: 6000, intervals: [50] }).toBeGreaterThan(-111);
  await page.keyboard.up('s');
  await expect(page.locator('.gallery-heading strong')).toHaveText('The Quiet Garden');
  await page.keyboard.down('w');
  for (let room = 9; room <= 14; room++) {
    await expect.poll(z, { timeout: 16000, intervals: [50] }).toBeLessThan(galleryTransform(room).z + 5);
    await page.keyboard.up('w');
    await expect(page.locator('.gallery-heading strong')).toHaveText(collection.rooms[room].name);
    await page.screenshot({ path: `test-results/place-${room}.png` });
    await page.keyboard.down('w');
  }
  await expect.poll(z, { timeout: 16000, intervals: [50] }).toBeLessThan(-351);
  await page.waitForTimeout(500);
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  expect(await z()).toBeGreaterThanOrEqual(-351.4);
  expect(Math.abs(await world(page, 'x')())).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/waterfront-overlook.png' });
});

test('each new setting opens its paintings and plays the source word and sentence recordings', async ({ page }) => {
  test.setTimeout(75000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__placeAudio = [] as HTMLAudioElement[];
    window.Audio = class extends NativeAudio {
      constructor(url?: string) { super(url); (window as any).__placeAudio.push(this); }
    };
  });
  await enter(page);
  for (let room = 9; room < 15; room++) {
    await visit(page, room);
    const exhibit = collection.exhibits.find(e => e.room === room && e.slot === 0)!;
    await page.getByRole('button', { name: 'The collection90', exact: true }).click();
    await page.getByRole('button', { name: exhibit.word, exact: true }).click();
    await page.getByRole('button', { name: 'Close exhibit', exact: true }).click();
    await expect.poll(world(page, 'z')).toBeCloseTo(
      galleryTransform(room).z + placeExhibitSlot(room, 0).z + Math.cos(placeExhibitSlot(room, 0).yaw) * 4.3, 1,
    );
    await expect(page.locator('.scene')).not.toHaveClass(/room-transition/);
    const before = await page.evaluate(() => (window as any).__placeAudio.length as number);
    await clickDisplay(page, room, 0, 0, 2.85, 0.18);
    await expect(page.getByRole('heading', { name: exhibit.word, exact: true })).toBeVisible();
    // A replay can use the browser's media cache without another HTTP response.
    await expect.poll(() => page.evaluate(() => (window as any).__placeAudio.length as number)).toBe(before + 1);
    await expect.poll(() => page.evaluate(() => {
      const audio = (window as any).__placeAudio.at(-1) as HTMLAudioElement;
      return audio.currentTime;
    })).toBeGreaterThan(0.05);
    expect(await page.evaluate(() => ((window as any).__placeAudio.at(-1) as HTMLAudioElement).src)).toContain(`/audio/${exhibit.word}.m4a`);
    const sentence = page.waitForResponse(r => r.url().endsWith(`/audio/${exhibit.word}-example-0.m4a`));
    await page.getByRole('button', { name: 'Listen to sentence', exact: true }).click();
    expect((await sentence).ok()).toBe(true);
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('all six market stalls have reachable paintings, checkboxes and video links in every orientation', async ({ page }) => {
  test.setTimeout(75000);
  await page.route('https://youglish.com/public/emb/widget.js', route => route.abort());
  await enter(page); await visit(page, 12);
  for (const exhibit of collection.exhibits.filter(e => e.room === 12)) {
    await page.getByRole('button', { name: 'The collection90', exact: true }).click();
    await page.getByRole('button', { name: exhibit.word, exact: true }).click();
    await page.getByRole('button', { name: 'Close exhibit', exact: true }).click();
    await expect(page.locator('.scene')).not.toHaveClass(/room-transition/);
    const p = placeExhibitSlot(12, exhibit.slot);
    await expect.poll(world(page, 'z')).toBeCloseTo(galleryTransform(12).z + p.z + Math.cos(p.yaw) * 4.3, 1);
    await clickDisplay(page, 12, exhibit.slot, 1.65, 4.32, 0.18);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.learned.v1') || '[]'))).toContain(exhibit.id);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await clickDisplay(page, 12, exhibit.slot, -1.06, 1.335, 0.1);
    await expect(page.getByRole('dialog', { name: `Video examples: ${exhibit.word}`, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open this word on YouGlish' })).toHaveAttribute('href', `https://youglish.com/pronounce/${exhibit.word}/english`);
    await page.getByRole('button', { name: 'Close video', exact: true }).click();
    await page.screenshot({ path: `test-results/market-${exhibit.word}.png` });
  }
  // The plaza offers genuine lateral exploration beyond the old 24 m corridor.
  await visit(page, 12);
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  await expect.poll(world(page, 'z'), { timeout: 8000, intervals: [50] }).toBeLessThan(-235);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await expect.poll(world(page, 'x'), { timeout: 8000, intervals: [50] }).toBeGreaterThan(18);
  await page.keyboard.up('d'); await page.keyboard.up('Shift');
  await expect(page.locator('.gallery-heading strong')).toHaveText('The Discovery Market');
});

test('a phone can follow the localized next-stop route through all six places', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: '開始漫遊', exact: true }).click();
  await page.getByRole('button', { name: '到花園走走', exact: true }).click();
  for (const name of ['綠蔭漫步', '光影宮殿', '故事街角', '尋字市集', '微光洞窟', '水岸露臺', '靜謐花園']) {
    const next = page.getByRole('button', { name: `下一站 · ${name}`, exact: true });
    await expect(next).toBeVisible();
    const bounds = (await next.boundingBox())!; expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await next.click(); await expect(page.locator('.gallery-heading strong')).toHaveText(name);
  }
  await page.getByRole('button', { name: '展館地圖', exact: true }).click();
  await expect(page.locator('.room-list > button')).toHaveCount(17);
  await page.screenshot({ path: 'test-results/places-map-mobile.png' });
});
