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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect(page.locator("canvas")).toBeVisible();
  for (const exhibit of data.exhibits) {
    const image = await request.get(`/${exhibit.image}`);
    expect(image.ok(), exhibit.word).toBe(true);
    expect(image.headers()["content-type"]).toContain("image/webp");
    const audio = await request.get(`/${exhibit.audio}`);
    expect(audio.ok(), `${exhibit.word} pronunciation`).toBe(true);
    expect((await audio.body()).byteLength).toBeGreaterThan(1000);
    for (const clip of [
      exhibit.exampleAudio,
      ...exhibit.senses.map((s) => ("audio" in s ? s.audio : null)),
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

test("a painting opens by raycast; meanings, audio, saved words, and discovery persist", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await page.getByRole("button", { name: "Floor map", exact: true }).click();
  await page.locator(".room-list > button").filter({ hasText: "Everyday Wonders" }).click();
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  // Click the center of curiosity's painting in the enlarged east gallery.
  const recording = page.waitForResponse((response) =>
    response.url().endsWith("/audio/curiosity.m4a"),
  );
  await page.mouse.click(1160, 446);
  const dialog = page.getByRole("dialog", {
    name: "Vocabulary exhibit: curiosity",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect((await recording).ok()).toBe(true);
  await expect(dialog.locator(".audio-status")).toContainText("Listening to word");
  const source = data.exhibits.find((e) => e.word === "curiosity")!;
  await expect(
    dialog.getByText(source.definition, { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Translation language").selectOption("ja_JP");
  await expect(
    dialog.getByText(source.translations.ja_JP, { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep this word", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Saved to my words" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "delicate", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "My words 1", exact: true }).click();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "curiosity", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".visit-progress strong")).toContainText("2");
});

test("the broad promenade connects every hall and the outdoor garden without doorways", async ({
  page,
}) => {
  test.setTimeout(65000);
  await enter(page);
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await page.getByRole("button", { name: "Floor map", exact: true }).click();
  await page.locator(".room-list > button").filter({ hasText: "Everyday Wonders" }).click();
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  const marker = page.locator(".minimap [data-world-z]");
  const z = async () => Number(await marker.getAttribute("data-world-z"));
  const x = async () => Number(await marker.getAttribute("data-world-x"));
  const before = await z();
  // Walk off-center: the old narrow arches blocked this route between rooms.
  await page.keyboard.down("d");
  await expect.poll(x).toBeGreaterThan(4.5);
  await page.keyboard.up("d");
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await expect.poll(z, { timeout: 22000 }).toBeLessThan(-73);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  expect(await z()).toBeLessThan(before - 80);
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "The Quiet Garden",
  );
  await page.screenshot({
    animations: "disabled",
    path: "test-results/garden-walk.png",
  });

  // Return through the same fully open boundary, without teleporting.
  await page.keyboard.down("s");
  await expect.poll(z, { timeout: 6000 }).toBeGreaterThan(-69);
  await page.keyboard.up("s");
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "Ideas at Work",
  );

  // Jump links remain convenient in the substantially larger space.
  for (const name of [
    "Everyday Wonders",
    "Out in the World",
    "Ideas at Work",
    "The Quiet Garden",
  ]) {
    await page.getByRole("button", { name: "Floor map", exact: true }).click();
    await page.locator(".room-list > button").filter({ hasText: name }).click();
    await expect(page.locator(".gallery-heading strong")).toHaveText(name);
  }
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/garden-desktop.png",
  });
  await page
    .getByRole("button", { name: "Back to the halls", exact: true })
    .click();
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "Ideas at Work",
  );
  await page.screenshot({
    animations: "disabled",
    path: "test-results/gallery-ideas.png",
  });
});

test("gallery walls and the garden pool remain solid while open paths stay walkable", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await page.getByRole("button", { name: "Floor map", exact: true }).click();
  await page.locator(".room-list > button").filter({ hasText: "Everyday Wonders" }).click();
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  const marker = page.locator(".minimap [data-world-x]");
  const x = async () => Number(await marker.getAttribute("data-world-x"));
  await page.keyboard.down("Shift");
  await page.keyboard.down("d");
  await page.waitForTimeout(2300);
  await page.keyboard.up("d");
  await page.keyboard.up("Shift");
  expect(await x()).toBeGreaterThan(10.5);
  expect(await x()).toBeLessThanOrEqual(11.4);

  await page
    .getByRole("button", { name: "Visit the garden", exact: true })
    .click();
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "The Quiet Garden",
  );
  // Head down the promenade then approach the pool from its clear western side.
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await marker.getAttribute("data-world-z")), {
      timeout: 6000,
    })
    .toBeLessThan(-90);
  await page.keyboard.up("w");
  await page.keyboard.down("d");
  await page.waitForTimeout(2500);
  await page.keyboard.up("d");
  expect(await x()).toBeGreaterThan(6);
  expect(await x()).toBeLessThan(6.7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/garden-mobile.png",
  });
  await page
    .getByRole("button", { name: "Back to the halls", exact: true })
    .click();
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "Ideas at Work",
  );
});

test("guided tour covers every exhibit and finishes at the entrance", async ({
  page,
}) => {
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
    "The Welcome Hall",
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
  await expect(page.locator(".collection-card")).toHaveCount(1);
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
