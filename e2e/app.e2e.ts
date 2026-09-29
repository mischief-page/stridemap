import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { SAMPLE_EXPORT } from './global-setup';

const PAGE = `file://${resolve('dist-single/stridemap.html')}`;

/** The SVG behind the preview image. */
const previewSvg = (page: Page) =>
  page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('#preview img');
    return img ? (await fetch(img.src)).text() : '';
  });

/** Waits until the preview shows the latest settings. */
const settled = (page: Page) =>
  page.waitForFunction(() => {
    const preview = document.getElementById('preview')!;
    return !preview.classList.contains('updating') && preview.querySelector('img');
  });

const activePreset = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>('#presetCards [aria-checked="true"]')?.dataset.id ?? null);

// Any script error in the page fails the test.
let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test('opens on the Afterglow poster with sample data', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  const svg = await previewSvg(page);
  expect(svg).toContain('viewBox="0 0 1200 1600"');
  expect(svg).toContain('>Every Step<');
  expect(svg).toMatch(/\d+ activities · [\d,]+ (mi|km)/);
  expect(await activePreset(page)).toBe('afterglow');
  await expect(page.locator('#status')).toContainText('300 of 300');
});

test('reads an Apple Health export from a file', async ({ page }) => {
  await page.goto(PAGE);
  await page.setInputFiles('#file', SAMPLE_EXPORT);
  await expect(page.locator('#status')).toContainText('40 of 40', { timeout: 30_000 });
  await settled(page);
  expect(await previewSvg(page)).toContain('<path');
});

test('each style preset applies its look', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  for (const [id, background] of [
    ['gallery', '#fbfaf7'],
    ['ember', '#16171a'],
    ['terracotta', '#f4ece1'],
    ['sketch', '#f3efe6'],
    ['afterglow', '#0b0f19'],
  ]) {
    await page.click(`.preset-card[data-id="${id}"]`);
    await settled(page);
    const svg = await previewSvg(page);
    expect(svg).toContain(`<rect width="100%" height="100%" fill="${background}"/>`);
    expect(svg.includes('stridemap-pencil-grain')).toBe(id === 'sketch');
    expect(await activePreset(page)).toBe(id);
  }
});

test('own text keeps the preset; look changes make it custom', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  await page.fill('#title', 'My Year');
  await settled(page);
  expect(await activePreset(page)).toBe('afterglow');
  expect(await previewSvg(page)).toContain('>My Year<');

  await page.fill('#colorB', '#ff0000');
  await settled(page);
  expect(await activePreset(page)).toBeNull();
  await expect(page.locator('#presetNote')).toContainText('Custom style');
  expect(await previewSvg(page)).toContain('#ff0000');
});

test('filters and date ranges change what is drawn', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  await page.uncheck('#types input[value="running"]');
  await settled(page);
  const withoutRuns = await page.locator('#status').textContent();
  expect(withoutRuns).not.toContain('300 of 300');
  await page.click('[data-range="all"]');
  await page.check('#types input[value="running"]');
  await settled(page);
  await expect(page.locator('#status')).toContainText('300 of 300');
});

test('downloads the SVG', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
  expect(download.suggestedFilename()).toBe('stridemap.svg');
});

test('the made-with mark is on by default and can be turned off', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  expect(await previewSvg(page)).toContain('>made with stridemap<');
  await page.uncheck('#mark');
  await settled(page);
  expect(await previewSvg(page)).not.toContain('made with');
  // Keeping or removing the mark is the person's choice, not part of the style.
  expect(await activePreset(page)).toBe('afterglow');
});

test('the footer links to the privacy page', async ({ page }) => {
  await page.goto(PAGE);
  await page.click('footer >> text=Privacy');
  await expect(page.locator('h1')).toHaveText('Privacy');
  await expect(page.locator('.lead')).toContainText('never leave your device');
  await page.click('text=Back to stridemap');
  await expect(page.locator('#presetCards .preset-card')).toHaveCount(5);
});
