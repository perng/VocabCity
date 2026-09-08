import { test, expect, type Page } from "@playwright/test";

async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("vocabhall.locale.v1", "");
    const NativeAudio = window.Audio;
    const probe = { clips: [] as HTMLAudioElement[], starts: [] as string[] };
    (window as any).__pronunciation = probe;
    window.Audio = class extends NativeAudio {
      constructor(url?: string) {
        super(url);
        probe.clips.push(this);
      }
      play() {
        probe.starts.push(this.src.split("/").pop()!);
        return super.play();
      }
    };
  });
}

async function starts(page: Page) {
  return page.evaluate(() => (window as any).__pronunciation.starts as string[]);
}

async function allStopped(page: Page) {
  return page.evaluate(() =>
    ((window as any).__pronunciation.clips as HTMLAudioElement[]).every(
      (clip) => clip.paused || clip.ended,
    ),
  );
}

test("opening and switching exhibits pronounces each word once and cancels older audio", async ({ page }) => {
  await observeAudio(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Start exploring", exact: true }).click();
  await page.getByRole("button", { name: "Floor map", exact: true }).click();
  await page.locator(".room-list > button").filter({ hasText: "Everyday Wonders" }).click();
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  expect(await starts(page)).toEqual([]);
  await page.mouse.click(1160, 446);
  await expect(page.getByRole("heading", { name: "curiosity", exact: true })).toBeVisible();
  expect(await starts(page)).toEqual(["curiosity.m4a"]);
  await expect.poll(() => page.evaluate(() =>
    ((window as any).__pronunciation.clips[0] as HTMLAudioElement).currentTime,
  )).toBeGreaterThan(0.05);
  await page.getByLabel("Playback speed").selectOption("0.75");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "delicate", exact: true })).toBeVisible();
  expect(await starts(page)).toEqual(["curiosity.m4a", "delicate.m4a"]);
  expect(await page.evaluate(() => {
    const clips = (window as any).__pronunciation.clips as HTMLAudioElement[];
    return { oldStopped: clips[0].paused, latestRate: clips[1].playbackRate };
  })).toEqual({ oldStopped: true, latestRate: 0.75 });

  await page.getByRole("button", { name: "Previous exhibit", exact: true }).click();
  expect(await starts(page)).toEqual(["curiosity.m4a", "delicate.m4a", "curiosity.m4a"]);
  expect(await page.evaluate(() =>
    ((window as any).__pronunciation.clips as HTMLAudioElement[]).slice(0, -1).every((clip) => clip.paused),
  )).toBe(true);
  await page.getByRole("button", { name: "Close exhibit", exact: true }).click();
  await expect.poll(() => allStopped(page)).toBe(true);

  await page.getByRole("button", { name: "The collection54", exact: true }).click();
  await page.getByRole("button", { name: "curiosity", exact: true }).click();
  expect(await starts(page)).toEqual(["curiosity.m4a", "delicate.m4a", "curiosity.m4a", "curiosity.m4a"]);
  await page.getByRole("checkbox", { name: "Learned: curiosity", exact: true }).check();
  await page.getByLabel("Translation language").selectOption("ja_JP");
  await page.getByRole("button", { name: "Keep this word", exact: true }).click();
  expect(await starts(page)).toHaveLength(4);
  await page.getByRole("button", { name: "Close exhibit", exact: true }).click();
  await expect.poll(() => allStopped(page)).toBe(true);
});

test("mobile collection and garden exhibits pronounce on opening, with working pause and replay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await observeAudio(page);
  await page.goto("/");
  await page.getByRole("button", { name: "My words 0", exact: true }).click();
  await page.getByRole("button", { name: "Explore all exhibits", exact: true }).click();
  expect(await starts(page)).toEqual([]);
  await page.getByRole("button", { name: "serene", exact: true }).click();
  expect(await starts(page)).toEqual(["serene.m4a"]);
  await page.getByRole("button", { name: "Listen to word", exact: true }).click();
  await expect.poll(() => allStopped(page)).toBe(true);
  await page.getByRole("button", { name: "Listen to word", exact: true }).click();
  expect(await starts(page)).toEqual(["serene.m4a", "serene.m4a"]);
  await page.getByRole("button", { name: "Close exhibit", exact: true }).click();
  await expect.poll(() => allStopped(page)).toBe(true);

  await page.getByRole("button", { name: "Visit the garden", exact: true }).click();
  await page.locator(".garden-exhibits summary").click();
  await page.getByRole("button", { name: "flourish", exact: true }).click();
  await expect(page.locator(".exhibit-sheet")).toContainText("Garden /");
  expect(await starts(page)).toEqual(["serene.m4a", "serene.m4a", "flourish.m4a"]);
  await expect.poll(() => page.evaluate(() =>
    ((window as any).__pronunciation.clips.at(-1) as HTMLAudioElement).currentTime,
  )).toBeGreaterThan(0.05);
  await page.getByRole("button", { name: "Close exhibit", exact: true }).click();
  await expect.poll(() => allStopped(page)).toBe(true);
});
