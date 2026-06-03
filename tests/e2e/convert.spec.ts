import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/sample.heic', import.meta.url));

for (const { path, ext } of [
  { path: '/heic-to-jpg', ext: 'jpg' },
  { path: '/heic-to-png', ext: 'png' },
  { path: '/heic-to-pdf', ext: 'pdf' },
]) {
  test(`converts HEIC on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.getByTestId('file-input').setInputFiles(fixture);
    const downloadButton = page.getByTestId('download');
    await expect(downloadButton).toBeVisible({ timeout: 30_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  });
}
