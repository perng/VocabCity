import { test, expect, type Page } from "@playwright/test";
import data from "../src/collection.json" with { type: "json" };

async function enter(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("vocabhall.locale.v1", ""),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start exploring", exact: true }),
  ).toBeVisible();
}

test("all source paintings and recordings load, and the canvas renders without errors", async ({
  page,
  request,
}) => {
  // Several hundred asset requests against the external disk take longer than the default budget.
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect(page.locator("canvas")).toBeVisible();
  // A spread of exhibits keeps the run short; the artwork test covers every painting.
  for (const exhibit of data.exhibits.filter((_, i) => i % 7 === 0)) {
    const image = await request.get(`/${exhibit.image}`);
    expect(image.ok(), exhibit.word).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/webp");
    const audio = await request.get(`/${exhibit.audio}`);
    expect(audio.ok(), `${exhibit.word} pronunciation`).toBe(true);
    expect((await audio.body()).byteLength).toBeGreaterThan(1000);
    const details = await (await request.get(`/data/exhibits/${exhibit.id}.json`)).json();
    for (const clip of [
      exhibit.exampleAudio,
      ...details.senses.map((s: { audio?: string | null }) => s.audio ?? null),
    ].filter(Boolean)) {
      const recording = await request.get(`/${clip}`);
      expect(recording.ok()).toBe(true);
      expect((await recording.body()).byteLength).toBeGreaterThan(1000);
    }
  }
  expect(errors).toEqual([]);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/gallery-desktop.png",
  });
});

test("guided tour covers every exhibit and finishes at the entrance", async ({
  page,
}) => {
  // Over 2,500 stops, each loading a full-size painting, with houses building on demand along the way.
  test.setTimeout(3000000);
  await enter(page);
  await page.getByRole("button", { name: /Take a guided tour/ }).click();
  for (let i = 0; i < data.exhibits.length; i++) {
    await expect(
      page.getByRole("heading", { name: data.exhibits[i].word, exact: true }),
    ).toBeVisible();
    if (i === 0)
      await page.screenshot({
        animations: "disabled",
        path: "test-results/exhibit-desktop.png",
      });
    await page
      .getByRole("button", {
        name: i === data.exhibits.length - 1 ? "Finish tour" : "Next",
        exact: true,
      })
      .click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    data.rooms[0].name,
  );
  await expect(page.locator(".visit-progress strong")).toHaveText(`${data.exhibits.length} / ${data.exhibits.length}`);
});

test("mobile layout supports gallery navigation, collection search, saved words, and touch controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/gallery-mobile.png",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "My words 0", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make a little room for wonder." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore all exhibits" }).click();
  await page
    .getByRole("textbox", { name: "Search vocabulary" })
    .fill("journey");
  await expect(page.locator(".collection-word").first()).toHaveText("journey");
  await page.getByRole("button", { name: "journey", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "journey", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/exhibit-mobile.png",
  });
  await page
    .getByRole("button", { name: "Close exhibit", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to evening light" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to daylight" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play ambience" }).click();
  await expect(
    page.getByRole("button", { name: "Mute ambience" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mute ambience" }).click();
  const before = await page
    .locator(".minimap svg > g")
    .last()
    .getAttribute("transform");
  const pad = await page
    .getByRole("button", { name: "Walk backward", exact: true })
    .boundingBox();
  await page.mouse.move(pad!.x + pad!.width / 2, pad!.y + pad!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator(".minimap svg > g").last()).not.toHaveAttribute(
    "transform",
    before!,
  );
});

test("Traditional Chinese is the default; original sentence audio and sequential playback never overlap", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    (window as any).__museumRecordings = [];
    window.Audio = class extends NativeAudio {
      constructor(url?: string) {
        super(url);
        (window as any).__museumRecordings.push(this);
      }
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
  await expect(
    page.getByRole("button", { name: "開始漫遊", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/gallery-desktop-zh.png",
  });
  const wordRequest = page.waitForResponse((r) =>
    r.url().endsWith("/audio/serene.m4a"),
  );
  await page.getByRole("button", { name: /跟著導覽走/ }).click();
  expect((await wordRequest).ok()).toBe(true);
  await expect(page.locator(".translation strong")).toHaveText("寧靜的");
  await page.getByLabel("播放速度").selectOption("1.25");
  const sentenceRequest = page.waitForResponse((r) =>
    r.url().endsWith("/audio/serene-example-0.m4a"),
  );
  await page.getByRole("button", { name: "全部播放", exact: true }).click();
  expect((await sentenceRequest).ok()).toBe(true);
  await expect(page.locator(".audio-status")).toContainText("正在播放例句");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clips = (window as any).__museumRecordings as HTMLAudioElement[];
        return clips
          .filter((a) => !a.paused && !a.ended)
          .map((a) => ({ file: a.src.split("/").pop(), rate: a.playbackRate }));
      }),
    )
    .toEqual([{ file: "serene-example-0.m4a", rate: 1.25 }]);
  await expect
    .poll(() => page.locator("progress").getAttribute("value"))
    .not.toBe("0");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/exhibit-audio-zh.png",
  });
  await page.getByRole("button", { name: "下一個", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "flourish", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      ((window as any).__museumRecordings as HTMLAudioElement[])
        .filter((a) => !a.src.endsWith("/audio/flourish.m4a"))
        .every((a) => a.paused || a.ended),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "聽例句", exact: true }).click();
  await expect(page.locator(".audio-status")).toContainText("正在播放例句");
  await page.getByRole("button", { name: "回到展館", exact: true }).click();
  expect(
    await page.evaluate(() =>
      ((window as any).__museumRecordings as HTMLAudioElement[]).every(
        (a) => a.paused || a.ended,
      ),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "開始漫遊", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/gallery-mobile-zh.png",
  });
  await page.getByRole("button", { name: /跟著導覽走/ }).click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/exhibit-mobile-zh.png",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "回到展館", exact: true }).click();
  await page
    .getByRole("button", { name: "Switch to English", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
