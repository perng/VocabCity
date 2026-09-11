import { test, expect } from "@playwright/test";
import collection from "../src/collection.json" with { type: "json" };

test("every museum artwork loads at native resolution, landmarks mix many media, and the larger view is responsive", async ({
  page,
}) => {
  test.setTimeout(600000);
  await page.goto("/");
  await page.getByRole("button", { name: /^單字典藏/ }).click();
  const images = page.locator(".collection-art img");
  await expect(images).toHaveCount(collection.exhibits.length);
  // Collection cards load lazily, so fetch every painting explicitly and check its native size.
  const failures = await images.evaluateAll((nodes) =>
    Promise.all(
      nodes.map(
        (node) =>
          new Promise<string | null>((resolve) => {
            const src = (node as HTMLImageElement).src;
            const probe = new Image();
            probe.onload = () =>
              resolve(
                probe.naturalWidth >= 1024 && probe.naturalHeight >= 1024 && src.includes("/artwork/museum-v1/")
                  ? null
                  : `${src} ${probe.naturalWidth}x${probe.naturalHeight}`,
              );
            probe.onerror = () => resolve(`${src} failed`);
            probe.src = src;
          }),
      ),
    ).then((results) => results.filter(Boolean)),
  );
  expect(failures).toEqual([]);
  for (const [room, info] of collection.rooms.entries()) {
    const works = collection.exhibits.filter(
      (exhibit) => exhibit.room === room,
    );
    // Landmark groups were restyled across many media; houses keep one series medium
    // unless they were among the first restyled (port and struct).
    const styles = new Set(works.map((work) => work.artwork!.style)).size;
    if (room < 15) expect(styles, info.name).toBeGreaterThanOrEqual(4);
    else if (room < 17) expect(styles, info.name).toBeGreaterThanOrEqual(2);
    // A theme house split across I/II/III may carry two series media from successive imports.
    else expect(styles, info.name).toBeLessThanOrEqual(2);
    // A root room also shows family words that hang in a thematic gallery.
    const shared = collection.exhibits.filter(
      (exhibit) => exhibit.families?.some((family) => family.room === room) && exhibit.room !== room,
    );
    expect(works.length + shared.length).toBe(
      "house" in info ? info.house.words.length : 6,
    );
  }
  // Murals hang frameless on real outdoor walls only: the gate square, quay, arcades, inn courtyard and belvedere.
  const murals = collection.exhibits.filter((exhibit) => exhibit.artwork?.mural);
  expect(murals.length).toBe(12);
  expect(new Set(murals.map((exhibit) => exhibit.room))).toEqual(new Set([0, 1, 3, 7, 8, 11]));
  await page.screenshot({
    path: "test-results/art-collection.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "serene", exact: true }).click();
  await expect(page.locator(".artwork-caption")).toContainText("晨光靜水");
  await page
    .getByRole("button", { name: "欣賞畫作: serene", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "藝術作品: serene",
    exact: true,
  });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("img")).toHaveAttribute(
    "src",
    /museum-v1\/serene.webp/,
  );
  await expect(viewer).toContainText("AI 生成原創作品");
  await page.screenshot({
    path: "test-results/artwork-large.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "serene", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "欣賞畫作: serene", exact: true })
    .click();
  await expect(viewer).toBeVisible();
  const box = (await viewer.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(
    await viewer.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/artwork-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "關閉畫作", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "聽單字", exact: true }),
  ).toBeVisible();
});
