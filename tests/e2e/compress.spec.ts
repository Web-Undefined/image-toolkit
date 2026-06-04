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

test('compresses a HEIC image to a smaller JPG', async ({ page }) => {
  await page.goto('/compress-image');
  await page.getByTestId('file-input').setInputFiles(heicFixture);
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-compressed\.jpg$/);
});

test('compresses a PNG and keeps PNG format', async ({ page }) => {
  await page.goto('/compress-image');
  await page.getByTestId('file-input').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(256, 256),
  });
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-compressed\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/compress-image');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-png"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-pdf"]')).toBeVisible();
});
