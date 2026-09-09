import { test, expect, type Page } from '@playwright/test';
import collection from '../src/collection.json' with { type: 'json' };

async function enter(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vocabhall.locale.v1', ''));
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Handy 990 mascot waving hello' })).toBeVisible();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
}
async function visit(page: Page, name: string) {
  await page.getByRole('button', { name: 'Floor map', exact: true }).click();
  await page.locator('.room-list > button').filter({ hasText: name }).click();
  await expect(page.locator('.gallery-heading strong')).toHaveText(name);
  await expect(page.locator('.scene')).not.toHaveClass(/room-transition/);
}

test('the mascot gate opens into an atrium with clear walking routes to both wings', async ({ page }) => {
  test.setTimeout(65000);
  await enter(page);
  const marker = page.locator('.minimap [data-world-x]');
  const x = async () => Number(await marker.getAttribute('data-world-x'));
  const z = async () => Number(await marker.getAttribute('data-world-z'));
  expect(await z()).toBe(61);
  await page.screenshot({ path: 'test-results/entrance-gate.png' });
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect.poll(z, { timeout: 12000, intervals: [50] }).toBeLessThan(29);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await expect(page.locator('.gallery-heading strong')).toHaveText('The Welcome Hall');
  await page.screenshot({ path: 'test-results/entrance-atrium.png' });
  await page.keyboard.down('Shift');
  await page.keyboard.down('a');
  await expect.poll(x, { timeout: 9000, intervals: [50] }).toBeLessThan(-25);
  await page.keyboard.up('a');
  await expect(page.locator('.gallery-heading strong')).toHaveText('Rooted in Nature');
  await page.keyboard.down('d');
  await expect.poll(x, { timeout: 14000, intervals: [50] }).toBeGreaterThan(25);
  await page.keyboard.up('d');
  await page.keyboard.up('Shift');
  await expect(page.locator('.gallery-heading strong')).toHaveText('Better Together');
  expect(await z()).toBeGreaterThan(24);
  expect(await z()).toBeLessThan(32);
});

test('all new galleries are reachable, have solid end walls, and expose recorded vocabulary', async ({ page }) => {
  test.setTimeout(60000);
  await enter(page);
  expect(collection.exhibits).toHaveLength(90);
  expect(new Set(collection.exhibits.map(e => e.word)).size).toBe(90);
  for (const [index, room] of collection.rooms.slice(0, 9).entries()) {
    await visit(page, room.name);
    if (index === 3 || index === 6) await page.screenshot({ path: `test-results/wing-${index === 3 ? 'west' : 'east'}.png` });
    if (index === 5 || index === 8) {
      await page.keyboard.down('Shift');
      await page.keyboard.down('w');
      await page.waitForTimeout(4200);
      await page.keyboard.up('w');
      await page.keyboard.up('Shift');
      const x = Math.abs(Number(await page.locator('.minimap [data-world-x]').getAttribute('data-world-x')));
      expect(x).toBeGreaterThan(100);
      expect(x).toBeLessThanOrEqual(101.4);
    }
  }
  for (const word of ['agriculture', 'ecosystem', 'radiant', 'community', 'cherish', 'welcome']) {
    await page.getByRole('button', { name: 'The collection90', exact: true }).click();
    const recording = page.waitForResponse(r => r.url().endsWith(`/audio/${word}.m4a`));
    await page.getByRole('button', { name: word, exact: true }).click();
    await expect(page.getByRole('heading', { name: word, exact: true })).toBeVisible();
    expect((await recording).ok()).toBe(true);
    const sentence = page.waitForResponse(r => r.url().endsWith(`/audio/${word}-example-0.m4a`));
    await page.getByRole('button', { name: 'Listen to sentence', exact: true }).click();
    expect((await sentence).ok()).toBe(true);
    await page.keyboard.press('Escape');
  }
});

test('the Traditional Chinese mascot welcome and expanded floor map fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '嗨，歡迎來到單字博物館！' })).toBeVisible();
  await expect(page.getByRole('img', { name: '單手刷990 吉祥物揮手歡迎你' })).toBeVisible();
  const start = page.getByRole('button', { name: '開始漫遊', exact: true });
  const box = (await start.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(844);
  await page.screenshot({ path: 'test-results/entrance-mobile.png' });
  await start.click();
  await page.getByRole('button', { name: '展館地圖', exact: true }).click();
  await expect(page.locator('.room-list > button')).toHaveCount(17);
  await expect(page.locator('.expanded-floorplan')).toBeVisible();
  await page.screenshot({ path: 'test-results/map-mobile.png' });
  await page.locator('.wing-shortcuts button').filter({ hasText: '東翼' }).click();
  await expect(page.locator('.gallery-heading strong')).toHaveText('一起更美好');
});

test('a short browser panel shows the mascot, welcome heading, and start button without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 410 });
  await page.goto('/');
  for (const target of [
    page.getByRole('img', { name: '單手刷990 吉祥物揮手歡迎你' }),
    page.getByRole('heading', { name: '嗨，歡迎來到單字博物館！' }),
    page.getByRole('button', { name: '開始漫遊', exact: true }),
    page.getByRole('button', { name: '展館地圖', exact: true }),
  ]) {
    await expect(target).toBeVisible();
    const bounds = (await target.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(70);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(410);
  }
  const card = await page.locator('.welcome-card').boundingBox();
  const start = await page.getByRole('button', { name: '開始漫遊', exact: true }).boundingBox();
  expect(start!.y + start!.height).toBeLessThanOrEqual(card!.y + card!.height);
  await page.screenshot({ path: 'test-results/entrance-short-panel.png', animations: 'disabled' });
});
