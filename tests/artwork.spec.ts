import { test, expect } from "@playwright/test";
import collection from "../src/collection.json" with { type: "json" };

test("all 493 museum artworks load at native resolution, with coordinated halls and a responsive larger view", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單字典藏493", exact: true }).click();
  const images = page.locator(".collection-art img");
  await expect(images).toHaveCount(collection.exhibits.length);
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.every((node) => {
          const image = node as HTMLImageElement;
          return (
            image.complete &&
            image.naturalWidth >= 1024 &&
            image.naturalHeight >= 1024 &&
            image.src.includes("/artwork/museum-v1/")
          );
        }),
      ),
    )
    .toBe(true);
  for (const [room, info] of collection.rooms.entries()) {
    const works = collection.exhibits.filter(
      (exhibit) => exhibit.room === room,
    );
    expect(new Set(works.map((work) => work.artwork.style)).size).toBe(1);
    // A root room also shows family words that hang in a thematic gallery.
    const shared = collection.exhibits.filter(
      (exhibit) => exhibit.families?.some((family) => family.room === room) && exhibit.room !== room,
    );
    expect(works.length + shared.length).toBe(
      "house" in info ? info.house.words.length : 6,
    );
    expect(works.every((work) => work.originalImage !== work.image)).toBe(true);
  }
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
