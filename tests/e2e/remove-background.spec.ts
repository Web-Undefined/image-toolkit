import { test, expect } from '@playwright/test';
import UPNG from 'upng-js';

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

test('removes the background and downloads a transparent PNG', async ({ page }) => {
  await page.goto('/remove-background');
  await page.getByTestId('file-input').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(64, 64),
  });
  // The first run downloads + initializes the model, so allow generous time.
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('preview')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-no-bg\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/remove-background');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/compress-image"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
});
