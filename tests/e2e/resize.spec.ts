import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import UPNG from 'upng-js';

const heicFixture = fileURLToPath(new URL('../fixtures/sample.heic', import.meta.url));

function makePngBuffer(w: number, h: number): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 11) % 256;
    data[i * 4 + 1] = (i * 37) % 256;
    data[i * 4 + 2] = (i * 59) % 256;
    data[i * 4 + 3] = 255;
  }
  return Buffer.from(UPNG.encode([data.buffer], w, h, 0));
}

test('resizes a HEIC image to 800px wide as JPG', async ({ page }) => {
  await page.goto('/resize-image');
  // default width is 800, lock on → sample.heic (4032x3024) → 800x600
  await page.getByTestId('file-input').setInputFiles(heicFixture);
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-800x600\.jpg$/);
});

test('resizes a square PNG and keeps PNG format', async ({ page }) => {
  await page.goto('/resize-image');
  await page.getByTestId('file-input').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(256, 256),
  });
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  // 256x256 → width 800 lock on → 800x800
  expect(download.suggestedFilename()).toMatch(/-800x800\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/resize-image');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/compress-image"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
});
