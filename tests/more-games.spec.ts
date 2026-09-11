import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import collection from '../src/collection.json' with { type: 'json' };
import type { Exhibit } from '../src/types';
import { familyPieces, assembleWord, makeFamilyRounds, MARKET_MISSIONS, memorySentence, PASSPORT_KEY } from '../src/games';
import { ROOT_START } from '../src/layout';
const exhibits = collection.exhibits as Exhibit[];
const pool = exhibits.filter(e => e.room === ROOT_START || e.families?.some(f => f.room === ROOT_START));

async function enter(page: Page, chinese = false) {
  await page.addInitScript(({ chinese }) => {
    localStorage.setItem('vocabhall.locale.v1', chinese ? 'zh_TW' : '');
    const NativeAudio = window.Audio;
    (window as any).__gameAudio = [];
    window.Audio = class extends NativeAudio {
      play() { (window as any).__gameAudio.push(this.src); return super.play(); }
    };
    (window as any).__requests = [];
    // The browser may have no installed English voice in CI. Verify the speech
    // request contract here; original word recordings still play natively.
    speechSynthesis.speak = speech => { (window as any).__requests.push(speech.text); speech.onend?.(new SpeechSynthesisEvent('end')); };
  }, { chinese });
  await page.goto('/');
  await page.getByRole('button', { name: chinese ? '博物館遊戲' : 'Museum games', exact: true }).click();
}
async function masks(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).__museum;
    return { banners: m.gameMasks.length, hidden: m.hiddenFloor.length, props: m.gameGroup?.children.length ?? 0, room: m.game?.room };
  });
}
async function choosePainting(page: Page, target: Exhibit) {
  await page.locator('.game-answer-tray button').filter({ has: page.locator(`img[src$="${target.image}"]`) }).click();
}

test('word workshop assembles reviewed spelling changes, finds paintings, and preserves older stamps', async ({ page }) => {
  test.setTimeout(90000);
  const support = pool.find(e => e.word === 'support')!;
  await page.addInitScript(({ checked, key }) => {
    localStorage.setItem('vocabhall.learned.v1', JSON.stringify(checked));
    localStorage.setItem(key, JSON.stringify([{ mode: 'quest', room: 'root-port', earnedAt: '2026-09-10' }]));
  }, { checked: pool.filter(e => e !== support).map(e => e.id), key: PASSPORT_KEY });
  await enter(page);
  await page.getByRole('button', { name: 'Build a Word Family', exact: true }).click();
  await expect(page.locator('.game-clue')).toHaveText(support.definition);
  await expect.poll(async () => (await masks(page)).banners).toBe(6);
  await expect(page.locator('.word-part-tray')).toContainText('sub → sup');
  await page.getByRole('button', { name: 'Add part: port', exact: true }).click();
  await page.getByRole('button', { name: 'Build this word', exact: true }).click();
  await expect(page.locator('.game-feedback')).toContainText('different order');
  await expect(page.locator('.game-rounds')).toHaveAttribute('aria-label', '0 / 3');
  await page.getByRole('button', { name: 'Remove part: port', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    const clue = await page.locator('.game-clue').innerText();
    const target = pool.find(e => e.definition === clue)!;
    const parts = familyPieces(target, ROOT_START)!;
    for (let j = 0; j < parts.length; j++) {
      const button = page.getByRole('button', { name: `Add part: ${parts[j].joined}`, exact: true });
      if (i === 0 && j === 0) await button.dragTo(page.getByLabel('Word workbench', { exact: true }));
      else await button.click();
    }
    await page.getByRole('button', { name: 'Build this word', exact: true }).click();
    await expect(page.locator('.extra-game-prompt h2')).toHaveText(target.word);
    await expect(page.locator('.game-rounds')).toHaveAttribute('aria-label', `${i} / 3`);
    await page.getByRole('button', { name: 'Nearby paintings', exact: true }).click();
    if (i === 0) {
      await choosePainting(page, pool.find(e => e.id !== target.id)!);
      await expect(page.locator('.game-feedback')).toContainText('Not quite');
    }
    await choosePainting(page, target);
    await expect(page.locator('.game-prompt[data-correct=true]')).toBeVisible();
    expect((await page.evaluate(() => (window as any).__gameAudio.at(-1)) as string).endsWith(target.audio!)).toBe(true);
    await page.getByRole('button', { name: i === 2 ? 'Collect my stamp' : 'Next word', exact: true }).click();
  }
  await expect(page.locator('.games-complete')).toBeVisible();
  const stamps = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PASSPORT_KEY);
  expect(stamps.map((s: any) => s.mode)).toEqual(['quest', 'family']);
  expect(stamps[0].earnedAt).toBe('2026-09-10');
  expect(stamps[1].room).toBe(collection.rooms[ROOT_START].id);
  expect(await masks(page)).toMatchObject({ banners: 0, hidden: 0, props: 0 });
  await page.getByRole('button', { name: 'Try another game', exact: true }).click();
  await expect(page.locator('.game-menu-card')).toHaveCount(6);
  await expect(page.locator('.games-passport b')).toHaveText('2 / 6');
});

test('market neighbours accept a scene click, speak requests, offer specific retries and award a market stamp', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  await page.getByRole('button', { name: 'Market Missions', exact: true }).click();
  await expect.poll(async () => (await masks(page)).props).toBe(3);
  expect((await masks(page)).room).toBe(12);
  const startX = await page.evaluate(() => (window as any).__museum.camera.position.x);
  await page.keyboard.down('w');
  try { await expect.poll(() => page.evaluate(() => (window as any).__museum.camera.position.x)).toBeGreaterThan(startX + 1); }
  finally { await page.keyboard.up('w'); }
  // Click the first actual wooden figure, without using the conversation shortcut.
  const scene = await page.evaluate(() => {
    const m = (window as any).__museum, c = m.camera, actor = m.gameGroup.children[0];
    return { x: c.position.x, y: c.position.y, z: c.position.z, pitch: c.rotation.x, yaw: c.rotation.y, ax: actor.position.x, az: actor.position.z };
  });
  const rect = (await page.locator('canvas').boundingBox())!;
  const camera = new PerspectiveCamera(68, rect.width / rect.height, .08, 330);
  camera.position.set(scene.x, scene.y, scene.z); camera.rotation.set(scene.pitch, scene.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
  const point = new Vector3(scene.ax, 1.4, scene.az).project(camera);
  await page.mouse.click(rect.x + (point.x + 1) * rect.width / 2, rect.y + (1 - point.y) * rect.height / 2);
  for (let i = 0; i < MARKET_MISSIONS.length; i++) {
    const mission = MARKET_MISSIONS[i];
    if (i > 0) await page.getByRole('button', { name: 'Meet this neighbour', exact: true }).click();
    await expect(page.locator('.market-request')).toContainText(mission.request);
    expect(await page.evaluate(() => (window as any).__requests.at(-1))).toBe(mission.request);
    const wrong = mission.choices.find(c => c.word !== mission.word)!;
    await page.getByRole('button', { name: wrong.reply, exact: true }).click();
    await expect(page.locator('.game-feedback')).toHaveText(wrong.feedback!);
    await expect(page.locator('.game-rounds')).toHaveAttribute('aria-label', `${i} / 3`);
    await page.getByRole('button', { name: mission.choices.find(c => c.word === mission.word)!.reply, exact: true }).click();
    await expect(page.locator('.market-thanks')).toContainText(mission.thanks);
    await page.getByRole('button', { name: i === 2 ? 'Collect my stamp' : 'Next neighbour', exact: true }).click();
  }
  await expect(page.locator('.games-review > div')).toHaveCount(3);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0], PASSPORT_KEY)).toMatchObject({ mode: 'market', room: 'market' });
  await page.getByRole('button', { name: 'Keep wandering', exact: true }).click();
  expect(await masks(page)).toMatchObject({ banners: 0, hidden: 0, props: 0 });
  expect(await page.evaluate(() => (window as any).__museum.blocked)).toBe(false);
});

test('memory walk studies real artworks, hides labels, recalls three forms and revisits a missed word', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  await page.getByRole('button', { name: 'Memory Walk', exact: true }).click();
  const names = await page.locator('.memory-study-cards strong').allTextContents();
  const targets = names.map(word => pool.find(e => e.word === word)!);
  await expect(page.locator('.memory-study-cards button')).toHaveCount(3);
  expect((await masks(page)).banners).toBe(0);
  await page.getByRole('button', { name: `Study painting: ${names[0]}`, exact: true }).click();
  expect((await page.evaluate(() => (window as any).__gameAudio.at(-1)) as string).endsWith(targets[0].audio!)).toBe(true);
  await page.getByRole('button', { name: 'I’m ready to remember', exact: true }).click();
  await expect(page.locator('.memory-study-cards')).toHaveCount(0);
  expect(await masks(page)).toMatchObject({ banners: 6, hidden: 13 });
  await page.locator('.memory-choices button').filter({ hasNotText: targets[0].word }).first().click();
  await expect(page.locator('.game-feedback')).toContainText('another try');
  await expect(page.locator('.game-rounds')).toHaveAttribute('aria-label', '0 / 3');
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  await page.getByRole('button', { name: 'Play the clue', exact: true }).click();
  expect((await page.evaluate(() => (window as any).__gameAudio.at(-1)) as string).endsWith(targets[1].audio!)).toBe(true);
  await page.getByRole('button', { name: targets[1].definition, exact: true }).click();
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  if (memorySentence(targets[2])) await expect(page.locator('.memory-sentence')).toContainText('________');
  await page.getByRole('button', { name: targets[2].word, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collect my stamp', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next word', exact: true }).click();
  await expect(page.locator('.memory-revisit')).toBeVisible();
  await expect(page.locator('.memory-recall-art')).toHaveAttribute('src', new RegExp(targets[0].image));
  await page.getByRole('button', { name: targets[0].word, exact: true }).click();
  await page.getByRole('button', { name: 'Collect my stamp', exact: true }).click();
  await expect(page.locator('.games-review > div')).toHaveCount(3);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0].mode, PASSPORT_KEY)).toBe('memory');
  expect(await masks(page)).toMatchObject({ banners: 0, hidden: 0, props: 0 });
});

test('new games have usable Traditional Chinese controls on a phone and restore the scene on exit', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, true);
  for (const mode of ['字根造字工坊', '市集小任務', '記憶散步']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(page.locator('.extra-game-prompt')).toBeVisible();
    if (mode === '字根造字工坊') {
      await page.locator('.word-part-tray button').first().click();
      await expect(page.getByRole('button', { name: '拼好了', exact: true })).toBeEnabled();
    }
    if (mode === '市集小任務') {
      await page.getByRole('button', { name: '走近打個招呼', exact: true }).click();
      await page.getByRole('button', { name: '中文提示', exact: true }).click();
      await expect(page.locator('.game-hint')).toContainText('麵包');
    }
    await page.screenshot({ path: `test-results/${mode}-phone.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const overflow = await page.locator('.extra-game-prompt').evaluate(e => e.scrollWidth > e.clientWidth);
    expect(overflow).toBe(false);
    await page.getByRole('button', { name: '回到遊戲選單', exact: true }).click();
    await expect(page.locator('.game-menu-card')).toHaveCount(6);
    expect(await masks(page)).toMatchObject({ banners: 0, hidden: 0, props: 0 });
  }
  await page.getByRole('button', { name: '關閉遊戲', exact: true }).click();
});

test('family rounds exclude guessed splits, preserve allomorphs and do not mutate source data', () => {
  const source = JSON.stringify(pool);
  const support = pool.find(e => e.word === 'support')!;
  const rounds = makeFamilyRounds(pool, ROOT_START, pool.filter(e => e !== support).map(e => e.id));
  expect(rounds[0].target.word).toBe('support');
  const pieces = rounds[0].pieces;
  expect(pieces[0]).toMatchObject({ surface: 'sub', joined: 'sup' });
  expect(assembleWord(pieces.map((piece, i) => ({ key: String(i), piece })))).toBe('support');
  expect(familyPieces({ ...support, families: undefined }, ROOT_START)).toBeNull();
  expect(JSON.stringify(pool)).toBe(source);
  for (const e of pool) {
    const blank = memorySentence(e);
    if (blank) expect(blank.toLowerCase()).not.toMatch(new RegExp(`\\b${e.word}\\b`, 'i'));
  }
});

test('theme houses keep local memory words while the workshop chooses a reviewed root house', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Close games', exact: true }).click();
  const theme = collection.rooms.findIndex(r => (r as any).house?.kind === 'theme');
  await page.evaluate(index => (window as any).__museum.goToRoom(index), theme);
  await expect.poll(() => page.evaluate(() => (window as any).__museum.reportedPose.room)).toBe(theme);
  await page.getByRole('button', { name: 'Museum games', exact: true }).click();
  await expect(page.locator('.games-location')).toContainText(collection.rooms[theme].name);
  await page.getByRole('button', { name: 'Build a Word Family', exact: true }).click();
  await expect.poll(async () => (await masks(page)).room).toBe(ROOT_START);
  await page.getByRole('button', { name: 'Back to games', exact: true }).click();
  await page.getByRole('button', { name: 'Memory Walk', exact: true }).click();
  const names = await page.locator('.memory-study-cards strong').allTextContents();
  const local = exhibits.filter(e => e.room === theme || e.families?.some(f => f.room === theme));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every(word => local.some(e => e.word === word))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-overlay')).toHaveCount(0);
  expect(await masks(page)).toMatchObject({ banners: 0, hidden: 0, props: 0 });
});
