import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { SAMPLE_EXPORT, SAMPLE_STRAVA } from './global-setup';
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
  // Named after the title and the style.
  expect(download.suggestedFilename()).toBe('my-workouts-afterglow.svg');
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

test('Style starts open, the other groups closed, and they open on click', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  const groups = page.locator('details.group');
  await expect(groups).toHaveCount(7);
  expect(await groups.evaluateAll((els) => els.filter((d) => (d as HTMLDetailsElement).open).map((d) => d.id))).toEqual(['styleGroup']);
  // The drop zone, title and downloads are visible from the start.
  await expect(page.locator('#drop')).toBeVisible();
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#downloadPng')).toBeVisible();
  await expect(page.locator('#styleHint')).toHaveText('Afterglow');
  await expect(page.locator('#colorB')).toBeHidden();
  await page.click('summary:has-text("Colors")');
  await expect(page.locator('#colorB')).toBeVisible();
});

test('opens on an example poster from the sample data', async ({ page }) => {
  await page.goto(PAGE);
  await settled(page);
  await expect(page.locator('#exampleBadge')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Sample data: 300 of 300');
  await expect(page.locator('#dataRange')).toContainText('300 workouts');
});

test('a file that fails to load leaves the current poster working', async ({ page }) => {
  await visit(page, PAGE);
  await settled(page);
  // Not a zip at all: caught before reading.
  await page.setInputFiles('#file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#error')).toContainText("isn't a zip");
  // Named .zip but broken: the engine's error, in plain words.
  await page.setInputFiles('#file', { name: 'export.zip', mimeType: 'application/zip', buffer: Buffer.from('not really a zip') });
  await expect(page.locator('#error')).toContainText("couldn't be opened as a zip");
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#exampleBadge')).toBeVisible();
  // The sample is still loaded, and changes still redraw it.
  const before = await previewSvg(page);
  await page.click('#presetCards [data-id="ember"]');
  await expect.poll(() => previewSvg(page)).not.toBe(before);
  await expect(page.locator('#status')).toContainText('Sample data');
});

test('the upload can be reached and opened from the keyboard', async ({ page, browserName }) => {
  await page.goto(PAGE);
  await settled(page);
  // Safari's Tab skips buttons and file inputs unless full keyboard access is
  // turned on in macOS, so there the input is focused directly.
  if (browserName === 'webkit') await page.focus('#file');
  else await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('file');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Space')]);
  expect(chooser).toBeTruthy();
});

test('typing a title puts it on the poster', async ({ page }) => {
  await visit(page, `${PAGE}?sample`);
  await settled(page);
  await page.uncheck('#legendShow');
  await settled(page);
  await page.fill('#title', 'Chicago Miles');
  await expect(page.locator('#legendShow')).toBeChecked();
  await expect.poll(() => previewSvg(page)).toContain('>Chicago Miles<');
});

test('arrow keys move between styles', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  await page.focus('#presetCards [data-id="afterglow"]');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#styleHint')).toHaveText('Terracotta');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id)).toBe('terracotta');
  // One Tab stop for the group: only the chosen card is in the tab order.
  expect(await page.locator('#presetCards [tabindex="0"]').count()).toBe(1);
});

test('the PNG sizes say how large they are', async ({ page }) => {
  await page.goto(`${PAGE}?sample`);
  await settled(page);
  await expect(page.locator('#pngSize option[value="share"]')).toHaveText('For sharing (2400 × 3200 px)');
  await expect(page.locator('#pngSize option[value="print"]')).toContainText('For printing (35');
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
  await expect(page.locator('#mapStatus')).toContainText('routes start at the center');
  await settled(page);
  const svg = await previewSvg(page);
  expect(svg).toContain('class="map"');
  expect(svg).toContain('OpenStreetMap contributors');
  expect(tiles.length).toBeGreaterThan(0);
  // By default routes from elsewhere are drawn where they went, if they cross the picture.
  await expect(page.locator('#mapStatus')).toContainText('232 routes start at the center');
  await expect(page.locator('#mapStatus')).toContainText('of 68 from elsewhere drawn');
  await page.selectOption('#mapOthers', 'omit');
  await expect(page.locator('#status')).toContainText('232 of 300');
  await expect(page.locator('#mapStatus')).toContainText('68 from elsewhere left out');
  await page.selectOption('#mapOthers', 'anchored');
  await expect(page.locator('#status')).toContainText('300 of 300');
  await expect(page.locator('#squash')).toBeDisabled();

  // A point typed by hand; far from every route, so the map is off and routes are drawn as usual.
  await page.selectOption('#mapPlace', 'custom');
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

test('reads a Strava download (FIT, GPX and TCX tracks) from a file', async ({ page }) => {
  await visit(page, PAGE);
  await page.setInputFiles('#file', SAMPLE_STRAVA);
  await expect(page.locator('#status')).toContainText('20 of 20', { timeout: 30_000 });
  await settled(page);
  expect(await previewSvg(page)).toContain('<path');
});
