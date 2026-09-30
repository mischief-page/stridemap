import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { SAMPLE_EXPORT } from './global-setup';
import { makeTile } from '../test/mvt';

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

/** Opens the page with every settings group expanded, so tests can reach the controls. */
const visit = async (page: Page, url: string) => {
  await page.goto(url);
  await page.evaluate(() => document.querySelectorAll('details.group').forEach((d) => ((d as HTMLDetailsElement).open = true)));
};

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
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  const svg = await previewSvg(page);
  expect(svg).toContain('viewBox="0 0 1200 1600"');
  expect(svg).toContain('>My Workouts<');
  expect(svg).toMatch(/\d+ activities · [\d,]+ (mi|km)/);
  expect(await activePreset(page)).toBe('afterglow');
  await expect(page.locator('#status')).toContainText('300 of 300');
});

test('reads an Apple Health export from a file', async ({ page }) => {
  await visit(page, PAGE);
  await page.setInputFiles('#file', SAMPLE_EXPORT);
  await expect(page.locator('#status')).toContainText('40 of 40', { timeout: 30_000 });
  await settled(page);
  expect(await previewSvg(page)).toContain('<path');
});

test('each style preset applies its look', async ({ page }) => {
  await visit(page, `${PAGE}?sample`);
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
  await visit(page, `${PAGE}?sample`);
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
  await visit(page, `${PAGE}?sample`);
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
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvg')]);
  expect(download.suggestedFilename()).toBe('stridemap.svg');
});

test('the made-with mark is on by default and can be turned off', async ({ page }) => {
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  expect(await previewSvg(page)).toContain('>made with stridemap<');
  await page.uncheck('#mark');
  await settled(page);
  expect(await previewSvg(page)).not.toContain('made with');
  // Keeping or removing the mark is the person's choice, not part of the style.
  expect(await activePreset(page)).toBe('afterglow');
});

test('the footer links to the privacy page', async ({ page }) => {
  await visit(page, PAGE);
  await page.click('footer >> text=Privacy');
  await expect(page.locator('h1')).toHaveText('Privacy');
  await expect(page.locator('.lead')).toContainText('never leave your device');
  await page.click('text=Back to stridemap');
  await expect(page.locator('#presetCards .preset-card')).toHaveCount(5);
});

test('settings groups start collapsed and open on click', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  const groups = page.locator('details.group');
  await expect(groups).toHaveCount(8);
  expect(await groups.evaluateAll((els) => els.filter((d) => (d as HTMLDetailsElement).open).length)).toBe(0);
  // The drop zone and downloads stay visible; the active style shows while collapsed.
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#downloadSvg')).toBeVisible();
  await expect(page.locator('#styleHint')).toHaveText('Afterglow');
  await expect(page.locator('#colorB')).toBeHidden();
  await page.click('summary:has-text("Colors")');
  await expect(page.locator('#colorB')).toBeVisible();
});

test('the order panel is hidden until switched on, and sets the print shape', async ({ page }) => {
  await visit(page, `${PAGE}?sample`);
  await expect(page.locator('#orderSection')).toBeHidden();

  await visit(page, `${PAGE}?sample&orders`);
  await settled(page);
  await expect(page.locator('#products .product')).toHaveCount(6);
  await page.click('.product[data-id="metal-16x20"]');
  await settled(page);
  // 16×20 is 5:4; the Afterglow poster is portrait, so 1200×1500.
  expect(await previewSvg(page)).toContain('viewBox="0 0 1200 1500"');
  await expect(page.locator('#productNote')).toContainText('$189');
  // A print shape that doesn't fit clears the choice.
  await page.selectOption('#aspect', '1:1');
  await expect(page.locator('.product[aria-checked="true"]')).toHaveCount(0);
});

test('draws a street map behind the routes when asked, from mocked tiles', async ({ page, context }) => {
  const tiles: string[] = [];
  await context.route('https://tiles.openfreemap.org/planet', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ tiles: ['https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf'] }), headers: { 'access-control-allow-origin': '*' } }),
  );
  await context.route('https://tiles.openfreemap.org/t/**', (route) => {
    tiles.push(route.request().url());
    return route.fulfill({ body: Buffer.from(makeTile({ transportation: [{ type: 2, props: { class: 'primary' }, points: [[0, 2048], [4096, 2048]] }] })), headers: { 'access-control-allow-origin': '*' } });
  });
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  expect(await previewSvg(page)).not.toContain('class="map"');

  await page.check('#underlay input[value="map"]');
  await expect(page.locator('#mapStatus')).toContainText('where most routes start');
  await settled(page);
  const svg = await previewSvg(page);
  expect(svg).toContain('class="map"');
  expect(svg).toContain('OpenStreetMap contributors');
  expect(tiles.length).toBeGreaterThan(0);
  // By default routes from elsewhere are drawn where they went, if they cross the picture.
  await expect(page.locator('#mapStatus')).toContainText('229 routes start here');
  await expect(page.locator('#mapStatus')).toContainText('of 71 starting elsewhere cross the picture');
  await page.check('#mapOthers input[value="omit"]');
  await expect(page.locator('#status')).toContainText('229 of 300');
  await expect(page.locator('#mapStatus')).toContainText('71 starting elsewhere are left out');
  await page.check('#mapOthers input[value="anchored"]');
  await expect(page.locator('#status')).toContainText('300 of 300');
  await expect(page.locator('#squash')).toBeDisabled();

  // A point typed by hand; far from every route, so the map is off and routes are drawn as usual.
  await page.check('#mapPlace input[value="custom"]');
  await page.fill('#mapAt', '10, 10');
  await expect(page.locator('#mapStatus')).toContainText('No routes shown start within 300 m');
  await settled(page);
  expect(await previewSvg(page)).not.toContain('class="map"');
});

test('distance over time can go behind the routes', async ({ page }) => {
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  await expect(page.locator('#underlayStrength')).toBeHidden();
  await page.check('#underlay input[value="distance"]');
  await expect(page.locator('#distanceShape')).toBeVisible();
  await expect(page.locator('#underlayStrength')).toBeVisible();
  await expect(page.locator('#mapAt')).toBeHidden();
  await settled(page);
  expect(await previewSvg(page)).toContain('class="distance"');
  await page.check('#distanceMarkers');
  await settled(page);
  expect(await previewSvg(page)).toMatch(/<text[^>]*>[\d,]+ (mi|km)<\/text>/);
  await page.selectOption('#distanceShape', 'monthly');
  await settled(page);
  expect(await previewSvg(page)).toContain('class="distance"');
  await page.check('#underlay input[value="none"]');
  await settled(page);
  expect(await previewSvg(page)).not.toContain('class="distance"');
});
