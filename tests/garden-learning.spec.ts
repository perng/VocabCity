import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import data from "../src/collection.json" with { type: "json" };
import { OUTDOOR_DISPLAYS } from "../src/layout";

const serene = data.exhibits.find((e) => e.word === "serene")!;

async function enter(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("vocabhall.locale.v1", ""),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
}

async function clickOutdoorControl(
  page: Page,
  x: number,
  y: number,
  z: number,
) {
  const canvas = (await page.locator("canvas").boundingBox())!;
  // The garden shortcut leaves the visitor 4.3 m in front of serene's display.
  const camera = new PerspectiveCamera(
    68,
    canvas.width / canvas.height,
    0.08,
    330,
  );
  camera.position.set(-9, 1.78, -80.7);
  camera.rotation.set(0.2, 0, 0, "YXZ");
  camera.updateMatrixWorld();
  const point = new Vector3(x, y, z).project(camera);
  await page.mouse.click(
    canvas.x + ((point.x + 1) * canvas.width) / 2,
    canvas.y + ((1 - point.y) * canvas.height) / 2,
  );
}

test("outdoor checkbox and video raycasts work, and learned state follows the word indoors", async ({
  page,
}) => {
  await page.route("https://youglish.com/public/emb/widget.js", (route) =>
    route.abort(),
  );
  await enter(page);
  await page
    .getByRole("button", { name: "Visit the garden", exact: true })
    .click();
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "The Quiet Garden",
  );
  await page.locator(".garden-exhibits summary").click();
  await expect(page.locator(".garden-word-list button")).toHaveCount(6);
  await page.getByRole("button", { name: "serene", exact: true }).click();
  await expect(page.locator(".exhibit-sheet")).toContainText("Garden /");
  await expect(
    page.getByRole("checkbox", { name: "Learned: serene", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Close exhibit", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".minimap [data-world-z]")
          .getAttribute("data-world-z"),
      ),
    )
    .toBeCloseTo(-80.7, 1);
  await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
  await clickOutdoorControl(page, -7.35, 4.32, -84.82);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("vocabhall.learned.v1") || "[]"),
      ),
    )
    .toEqual([serene.id]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/outdoor-learned.png",
    animations: "disabled",
  });
  // A second click restores the glow, without opening the flashcard.
  await clickOutdoorControl(page, -7.35, 4.32, -84.82);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("vocabhall.learned.v1")),
    )
    .toBe("[]");
  await clickOutdoorControl(page, -7.35, 4.32, -84.82);
  await clickOutdoorControl(page, -10.06, 1.335, -84.9);
  await expect(
    page.getByRole("dialog", { name: "Video examples: serene", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open this word on YouGlish" }),
  ).toHaveAttribute("href", "https://youglish.com/pronounce/serene/english");
  await page.getByRole("button", { name: "Close video", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /The collection/ }).click();
  const checkbox = page.getByRole("checkbox", {
    name: "Learned: serene",
    exact: true,
  });
  await expect(checkbox).toBeChecked();
  const card = page.locator(".collection-card").filter({ has: checkbox });
  await expect(card).toHaveAttribute("data-checked", "true");
  await page.getByRole("button", { name: "serene", exact: true }).click();
  await expect(page.locator(".exhibit-art")).toHaveAttribute(
    "data-checked",
    "true",
  );
  await expect(
    page.getByRole("checkbox", { name: "Learned: serene", exact: true }),
  ).toBeChecked();
});

test("mobile checkmarks control the frame glow and honor reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByRole("button", { name: "My words 0", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore all exhibits", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search vocabulary" })
    .fill("collaboration");
  const frame = page.locator(".collection-card");
  const checkbox = page.getByRole("checkbox", {
    name: "Learned: collaboration",
    exact: true,
  });
  await expect(frame).toHaveCSS("animation-name", "learning-glow");
  await checkbox.check();
  await expect(frame).toHaveAttribute("data-checked", "true");
  await expect(frame).toHaveCSS("animation-name", "none");
  await checkbox.uncheck();
  await expect(frame).toHaveCSS("animation-name", "learning-glow");
  await page.screenshot({
    path: "test-results/learning-mobile.png",
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(frame).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("all outdoor banners, paintings, and glosses have clear viewing areas", async ({
  page,
}) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Visit the garden", exact: true })
    .click();
  await expect(page.locator(".gallery-heading strong")).toHaveText(
    "The Quiet Garden",
  );
  for (const display of OUTDOOR_DISPLAYS) {
    await page.locator(".garden-exhibits summary").click();
    await page.getByRole("button", { name: display.word, exact: true }).click();
    await page
      .getByRole("button", { name: "Close exhibit", exact: true })
      .click();
    const position = new Vector3(0, 1.78, 4.3)
      .applyAxisAngle(new Vector3(0, 1, 0), display.yaw)
      .add(new Vector3(display.x, 0, display.z));
    await expect
      .poll(async () =>
        Number(
          await page
            .locator(".minimap [data-world-z]")
            .getAttribute("data-world-z"),
        ),
      )
      .toBeCloseTo(position.z, 1);
    await expect(page.locator(".scene")).not.toHaveClass(/room-transition/);
    const bounds = (await page.locator("canvas").boundingBox())!;
    const camera = new PerspectiveCamera(
      68,
      bounds.width / bounds.height,
      0.08,
      330,
    );
    camera.position.copy(position);
    camera.rotation.set(0.2, display.yaw, 0, "YXZ");
    camera.updateMatrixWorld();
    // Raycasting fails if an opaque sign, tree, or object is in front of these areas.
    for (const [y, z] of [
      [4.32, 0.177],
      [2.85, 0.177],
      [0.82, 0.05],
    ]) {
      const point = new Vector3(0, y, z)
        .applyAxisAngle(new Vector3(0, 1, 0), display.yaw)
        .add(new Vector3(display.x, 0, display.z))
        .project(camera);
      await page.mouse.click(
        bounds.x + ((point.x + 1) * bounds.width) / 2,
        bounds.y + ((1 - point.y) * bounds.height) / 2,
      );
      await expect(
        page.getByRole("dialog", {
          name: `Vocabulary exhibit: ${display.word}`,
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close exhibit", exact: true })
        .click();
    }
    if (display.word === "habitat") {
      await page.mouse.move(4, 4);
      await page.screenshot({
        path: "test-results/garden-clear-sightline.png",
        animations: "disabled",
      });
    }
  }
});

test("YouGlish loads on demand, fetches the chosen word, cleans up, and can recover after failure", async ({
  page,
}) => {
  let loads = 0;
  await page.route(
    "https://youglish.com/public/emb/widget.js",
    async (route) => {
      loads++;
      if (loads === 1) return route.abort();
      // Exercise our official-provider contract without depending on network/video availability.
      await route.fulfill({
        contentType: "application/javascript",
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
    },
  );
  await enter(page);
  expect(loads).toBe(0);
  await page.getByRole("button", { name: /The collection/ }).click();
  await page
    .getByRole("button", { name: "Watch video examples: serene", exact: true })
    .click();
  await expect(
    page.getByText(
      "The video provider is unavailable here. You can retry or open YouGlish.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".youglish-host iframe")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__videoEvents)).toEqual([
    { word: "serene", language: "english", autoStart: 0 },
  ]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".youglish-host iframe")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).__videoEvents.slice(-2)),
  ).toEqual(["pause", "close"]);
  await page
    .getByRole("button", {
      name: "Watch video examples: flourish",
      exact: true,
    })
    .click();
  await expect(page.locator(".youglish-host iframe")).toBeVisible();
  expect(loads).toBe(2);
  expect(
    await page.evaluate(() => (window as any).__videoEvents.at(-1)),
  ).toEqual({ word: "flourish", language: "english", autoStart: 0 });
});
