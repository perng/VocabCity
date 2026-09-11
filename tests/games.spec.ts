import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import collection from '../src/collection.json' with { type: 'json' };
import { displayPlacement, displayScale, ROOT_START, rootRoomTransform } from '../src/layout';
import { addStamp, makeRounds, PASSPORT_KEY } from '../src/games';
const words = collection.exhibits;
const pool = words.filter(e => e.room === ROOT_START || e.families?.some(f => f.room === ROOT_START));

async function enter(page: Page, chinese = false) {
  await page.addInitScript(({ chinese }) => {
    localStorage.setItem('vocabhall.locale.v1', chinese ? 'zh_TW' : '');
    const NativeAudio = window.Audio;
    (window as any).__gameAudio = [];
    (window as any).__gamePlayers = [];
    window.Audio = class extends NativeAudio {
      play() { (window as any).__gameAudio.push(this.src); (window as any).__gamePlayers.push(this); return super.play(); }
    };
  }, { chinese });
  await page.goto('/');
  await page.getByRole('button', { name: chinese ? '博物館遊戲' : 'Museum games', exact: true }).click();
}
async function audioTarget(page: Page) {
  const clip = await page.evaluate(() => (window as any).__gameAudio.at(-1) as string);
  return pool.find(e => clip.endsWith(e.audio!))!;
}
async function project(page: Page, point: Vector3) {
  const pose = await page.evaluate(() => {
    const c = (window as any).__museum.camera;
    return { x: c.position.x, y: c.position.y, z: c.position.z, pitch: c.rotation.x, yaw: c.rotation.y };
  });
  const rect = (await page.locator('canvas').boundingBox())!;
  const c = new PerspectiveCamera(68, rect.width / rect.height, .08, 330);
  c.position.set(pose.x, pose.y, pose.z); c.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); c.updateMatrixWorld();
  point.project(c);
  return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
}
async function chooseArtwork(page: Page, id: string) {
  const buttons = page.locator('.game-answer-tray button');
  const image = pool.find(e => e.id === id)!.image;
  await buttons.filter({ has: page.locator(`img[src$="${image}"]`) }).click();
}

test('curator quests allow retries, finish a three-word round, and persist a room stamp', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Curator’s Quest', exact: true }).click();
  await expect(page.locator('.game-overlay')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const clue = await page.locator('.game-clue').innerText();
    const target = pool.find(e => e.definition === clue)!;
    expect(target).toBeTruthy();
    await page.getByRole('button', { name: 'Nearby paintings', exact: true }).click();
    if (i === 0) {
      await chooseArtwork(page, pool.find(e => e.id !== target.id)!.id);
      await expect(page.getByRole('status')).toContainText('Not quite');
      await expect(page.locator('.game-rounds')).toHaveAttribute('aria-label', '0 / 3');
      await page.getByRole('button', { name: 'Hint', exact: true }).click();
      await expect(page.locator('.game-hint')).toContainText(target.word[0].toUpperCase());
    }
    await chooseArtwork(page, target.id);
    await expect(page.locator('.game-prompt[data-correct=true] h2')).toHaveText(target.word);
    await page.getByRole('button', { name: i === 2 ? 'Collect my stamp' : 'Next word', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'A stamp for your curiosity.' })).toBeVisible();
  await expect(page.locator('.games-review > div')).toHaveCount(3);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PASSPORT_KEY)).toHaveLength(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.learned.v1') || '[]'))).toEqual([]);
  await page.getByRole('button', { name: 'Keep wandering', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Museum games', exact: true }).click();
  await expect(page.locator('.games-passport b')).toHaveText('1 / 6');
});

test('listen and step accepts walking, tile clicks, and answer buttons, then removes every game prop', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  await page.getByRole('button', { name: 'Listen and Step', exact: true }).click();
  let target = await audioTarget(page);
  await expect.poll(() => page.evaluate(() => (window as any).__museum.gameGroup?.children.length)).toBe(4);
  await page.getByRole('button', { name: 'Answer buttons', exact: true }).click();
  const buttons = page.locator('.tile-answer-tray button');
  await buttons.filter({ hasNotText: target.word }).first().click();
  await expect(page.locator('.game-feedback')).toBeVisible();
  await page.getByRole('button', { name: target.word, exact: true }).click();
  await expect(page.locator('.game-prompt[data-correct=true]')).toBeVisible();
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  target = await audioTarget(page);
  const tile = await page.evaluate(id => {
    const g = (window as any).__museum.gameGroup;
    const tile = g.children.find((p: any) => p.userData.gameAnswer === id);
    return { x: tile.position.x, z: tile.position.z };
  }, target.id);
  const origin = rootRoomTransform(ROOT_START);
  const world = async (axis: string) => Number(await page.locator(`.minimap [data-world-${axis}]`).getAttribute(`data-world-${axis}`));
  // Move sideways on the starting line, then walk across the tile and stop on it.
  await page.keyboard.down(tile.x < 0 ? 'a' : 'd');
  try { await expect.poll(async () => Math.abs((await world('x')) - (origin.x + tile.x)), { intervals: [50] }).toBeLessThan(.35); }
  finally { await page.keyboard.up(tile.x < 0 ? 'a' : 'd'); }
  await page.keyboard.down('w');
  try { await expect.poll(async () => Math.abs((await world('z')) - (origin.z + tile.z)), { intervals: [50] }).toBeLessThan(.3); }
  finally { await page.keyboard.up('w'); }
  await expect(page.locator('.game-prompt[data-correct=true] h2')).toHaveText(target.word);
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  target = await audioTarget(page);
  const worldTile = await page.evaluate(id => {
    const m = (window as any).__museum, g = m.gameGroup;
    const t = g.children.find((p: any) => p.userData.gameAnswer === id);
    const p = g.localToWorld(t.position.clone());
    return { x: p.x, y: p.y, z: p.z };
  }, target.id);
  const xy = await project(page, new Vector3(worldTile.x, worldTile.y, worldTile.z));
  await page.mouse.click(xy.x, xy.y);
  await expect(page.locator('.game-prompt[data-correct=true] h2')).toHaveText(target.word);
  await page.getByRole('button', { name: 'Collect my stamp', exact: true }).click();
  await expect(page.locator('.games-complete')).toBeVisible();
  await page.getByRole('button', { name: 'Keep wandering', exact: true }).click();
  expect(await page.evaluate(() => {
    const m = (window as any).__museum;
    const floors: boolean[] = []; m.scene.traverse((o: any) => { if (o.userData.floorInfo !== undefined) floors.push(o.visible); });
    return { game: m.game, props: m.gameGroup, textures: m.gameTextures.length, floors: floors.every(Boolean), blocked: m.blocked };
  })).toEqual({ game: null, props: null, textures: 0, floors: true, blocked: false });
});

test('missing labels accept a drag onto a real painting and restore every banner on exit', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Restore the Labels', exact: true }).click();
  const word = await page.locator('.loose-label span').innerText();
  const target = pool.find(e => e.word === word)!;
  await expect.poll(() => page.evaluate(() => (window as any).__museum.gameMasks.length)).toBe(3);
  // Approach the chosen painting, as a visitor would, to make it fill the view.
  // The existing museum's public navigation method is used only for positioning.
  await page.evaluate(id => {
    const m = (window as any).__museum;
    m.goToExhibit(m.options.exhibits.find((e: any) => e.id === id), m.game.room);
  }, target.id);
  await expect.poll(() => page.evaluate(() => !!(window as any).__museum.transition)).toBe(false);
  const family = target.families?.find(f => f.room === ROOT_START);
  const p = displayPlacement(ROOT_START, family?.slot ?? target.slot, 6), scale = displayScale(ROOT_START);
  const point = new Vector3(0, 2.85 * scale, .18 * scale).applyAxisAngle(new Vector3(0, 1, 0), p.yaw).add(new Vector3(p.x, 0, p.z));
  const xy = await project(page, point);
  const label = (await page.locator('.loose-label').boundingBox())!;
  await page.mouse.move(label.x + label.width / 2, label.y + label.height / 2);
  await page.mouse.down(); await page.mouse.move(xy.x, xy.y, { steps: 20 }); await page.mouse.up();
  await expect(page.locator('.game-prompt[data-correct=true] h2')).toHaveText(target.word);
  await expect.poll(() => page.evaluate(() => (window as any).__museum.gameMasks.length)).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__museum.gameMasks.length)).toBe(0);
  await page.mouse.click(xy.x, xy.y);
  await expect(page.getByRole('dialog', { name: `Vocabulary exhibit: ${target.word}` })).toBeVisible();
});

test('phone games use Traditional Chinese and expose compact tap controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, true);
  await expect(page.getByRole('heading', { name: '玩一下，記住一個字。' })).toBeVisible();
  await expect(page.locator('.games-dialog')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/games-phone-menu.png' });
  await page.getByRole('button', { name: '聽音踩單字', exact: true }).click();
  const target = await audioTarget(page);
  await expect.poll(() => page.evaluate(() => (window as any).__gamePlayers.at(-1).currentTime)).toBeGreaterThan(.05);
  await page.getByRole('button', { name: '提示', exact: true }).click();
  await expect(page.locator('.game-hint')).toBeVisible();
  await page.screenshot({ path: 'test-results/games-phone-step.png' });
  await page.getByRole('button', { name: '按鈕作答', exact: true }).click();
  await page.getByRole('button', { name: target.word, exact: true }).click();
  await expect(page.getByRole('button', { name: '下一個單字', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: '結束遊戲', exact: true }).click();
  await expect(page.getByRole('button', { name: '展館地圖', exact: true })).toBeVisible();
});

 test('small houses offer distinct answers and repeat completions do not duplicate stamps', () => {
  const rounds = makeRounds(pool.slice(0, 2) as any, []);
  expect(rounds).toHaveLength(2);
  expect(new Set(rounds.map(r => r.target.id)).size).toBe(2);
  for (const round of rounds) {
    expect(round.choices).toHaveLength(2);
    expect(round.choices.filter(e => e.id === round.target.id)).toHaveLength(1);
  }
  const unseen = pool[0];
  const preferred = makeRounds(pool as any, pool.slice(1).map(e => e.id));
  expect(preferred[0].target.id).toBe(unseen.id);
  const stamp = { mode: 'quest' as const, room: 'root-port', earnedAt: '2026-09-11' };
  expect(addStamp([stamp], { ...stamp, earnedAt: '2026-09-12' })).toEqual([stamp]);
  expect(addStamp([stamp], { ...stamp, room: 'root-struct' })).toHaveLength(2);
});
