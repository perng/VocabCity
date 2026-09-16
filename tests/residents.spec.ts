import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import collection from '../src/collection.json' with { type: 'json' };
import type { Exhibit } from '../src/types';
import { RESIDENTS, ENCOUNTERS_KEY, nearbyResident, residentRounds } from '../src/residents';
import { areaAt, withinGrounds } from '../src/layout';
const exhibits = collection.exhibits as Exhibit[];

async function enter(page: Page, chinese = false) {
  await page.addInitScript(chinese => localStorage.setItem('vocabhall.locale.v1', chinese ? 'zh_TW' : ''), chinese);
  await page.goto('/');
  await page.getByRole('button', { name: chinese ? '開始漫遊' : 'Start exploring', exact: true }).click();
}
async function visit(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open museum floor map', exact: true }).click();
  await page.locator('.resident-directory button').filter({ hasText: name }).click();
  await expect(page.getByRole('button', { name: `Talk to ${name}`, exact: true })).toBeVisible();
}
async function answer(page: Page, miss = false) {
  const clue = await page.locator('.resident-clue').innerText();
  const target = exhibits.find(e => e.definition === clue)!;
  if (miss) {
    await page.locator('.resident-choices button').filter({ hasNotText: target.word }).first().click();
    await expect(page.locator('.resident-feedback')).toContainText('Not quite');
    await expect(page.getByRole('button', { name: 'Next question', exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: target.word, exact: true }).click();
  await expect(page.locator('.resident-feedback')).toContainText(target.example);
  return target;
}

test('residents have reachable meeting points and varied source-backed local questions', () => {
  for (const npc of RESIDENTS) {
    const pose = { x: npc.x + Math.sin(npc.yaw) * 3.5, z: npc.z + Math.cos(npc.yaw) * 3.5, room: npc.area };
    expect(withinGrounds(npc.x, npc.z)).toBe(true);
    expect(withinGrounds(pose.x, pose.z)).toBe(true);
    expect(areaAt(pose.x, pose.z)).toBe(npc.area);
    expect(nearbyResident(pose)?.id).toBe(npc.id);
    expect(nearbyResident({ ...pose, room: -1 })).toBeNull();
    const rounds = residentRounds(npc, exhibits, [], []);
    expect(rounds).toHaveLength(3);
    expect(new Set(rounds.map(r => r.target.id)).size).toBe(3);
    for (const round of rounds) {
      expect(round.choices).toHaveLength(4);
      expect(round.choices.filter(c => c.id === round.target.id)).toHaveLength(1);
      expect(new Set(round.choices.map(c => c.definition)).size).toBe(4);
    }
    const next = residentRounds(npc, exhibits, [], rounds.map(r => r.target.id));
    expect(next.every(r => !rounds.some(previous => previous.target.id === r.target.id))).toBe(true);
  }
});

test('walk up to a resident, retry a question, finish and keep progress across visits', async ({ page }) => {
  test.setTimeout(90000);
  await enter(page);
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Vocab chat: Luca' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__museum.blocked)).toBe(true);
  const before = await page.evaluate(() => (window as any).__museum.camera.position.toArray());
  await page.keyboard.down('w');
  await page.getByRole('button', { name: 'Show hint', exact: true }).click();
  await expect(page.locator('.resident-hint')).toBeVisible();
  await page.keyboard.up('w');
  expect(await page.evaluate(() => (window as any).__museum.camera.position.toArray())).toEqual(before);
  const words: string[] = [];
  for (let i = 0; i < 3; i++) {
    words.push((await answer(page, i === 0)).id);
    await page.getByRole('button', { name: i === 2 ? 'Finish conversation' : 'Next question', exact: true }).click();
  }
  await expect(page.locator('.resident-complete')).toContainText('2 / 3');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sailor, ENCOUNTERS_KEY)).toEqual({ visits: 1, best: 2, words });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocabhall.learned.v1')!))).toEqual([]);
  await page.screenshot({ path: 'test-results/resident-complete-desktop.png' });
  await page.getByRole('button', { name: 'Keep wandering', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__museum.blocked)).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Start exploring', exact: true }).click();
  await page.getByRole('button', { name: 'Talk to Luca', exact: true }).click();
  const clue = await page.locator('.resident-clue').innerText();
  const target = exhibits.find(e => e.definition === clue);
  expect(words).not.toContain(target?.id);
  await page.keyboard.press('Escape');
  await expect(page.locator('.resident-dialog')).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sailor.visits, ENCOUNTERS_KEY)).toBe(1);
});

test('map finds all six permanent residents and a real scene click opens a conversation', async ({ page }) => {
  test.setTimeout(120000);
  await enter(page);
  for (const npc of RESIDENTS) {
    await visit(page, npc.name);
    const canStand = await page.evaluate(() => { const m = (window as any).__museum; return m.canMove(m.camera.position.x, m.camera.position.z); });
    expect(canStand, npc.name).toBe(true);
    if (npc.id === 'sailor') {
      await page.screenshot({ path: 'test-results/resident-harbour-desktop.png' });
      const scene = await page.evaluate(() => { const c = (window as any).__museum.camera; return { position: c.position.toArray(), pitch: c.rotation.x, yaw: c.rotation.y }; });
      const rect = (await page.locator('canvas').boundingBox())!;
      const camera = new PerspectiveCamera(68, rect.width / rect.height, .08, 330);
      camera.position.fromArray(scene.position); camera.rotation.set(scene.pitch, scene.yaw, 0, 'YXZ'); camera.updateMatrixWorld();
      const point = new Vector3(npc.x, 1.45, npc.z).project(camera);
      await page.mouse.click(rect.x + (point.x + 1) * rect.width / 2, rect.y + (1 - point.y) * rect.height / 2);
    } else await page.getByRole('button', { name: `Talk to ${npc.name}`, exact: true }).click();
    await expect(page.getByRole('dialog', { name: `Vocab chat: ${npc.name}` })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.keyboard.down('s');
  await expect(page.locator('.resident-invite')).toHaveCount(0);
  await page.keyboard.up('s');
  await page.getByRole('button', { name: 'Museum games', exact: true }).click();
  await expect(page.locator('.resident-invite')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__museum.scene.children.filter((c: any) => c.name.startsWith('resident:')).length)).toBe(6);
});

test('Traditional Chinese phone conversation is usable and tolerates corrupt saved progress', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(key => localStorage.setItem(key, '{"sailor":{"visits":-1,"best":99,"words":null}}'), ENCOUNTERS_KEY);
  await enter(page, true);
  await page.getByRole('button', { name: '聊聊吧， Luca', exact: true }).click();
  await expect(page.locator('.resident-sheet')).toContainText('水手');
  await expect(page.locator('.resident-sheet h3')).toHaveText('哪個單字符合這個意思？');
  await page.getByRole('button', { name: '顯示提示', exact: true }).click();
  await expect(page.locator('.resident-hint')).toBeVisible();
  await page.screenshot({ path: 'test-results/resident-quiz-phone.png' });
  expect(await page.locator('.resident-dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: '結束對話', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__museum.blocked)).toBe(false);
});
