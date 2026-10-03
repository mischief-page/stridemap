# stridemap design

stridemap turns a person's outdoor walks and runs into a single piece of art: every route starts from the same point and spreads out in its true direction, forming a color-graded spider web.

## Pipeline

```
export.zip ─► parse ─► clean ─► color values ─► anchor ─► squash ─► fit ─► SVG
             (src/parse)       (src/core)                               (src/render)
```

1. **Parse** (`src/parse`): stream the zip and tell which kind it is by what's inside. Only walking, running and hiking workouts are kept, then prepared once into a compact form, and the raw tracks are freed.
   - **Apple Health export** (has `export.xml`): the large `export.xml` is read with a streaming XML parser and never loaded whole. Each workout's GPX route is read from `workout-routes/` with a small purpose-built scanner (route files are most of an export; this is ~3× faster than a general XML parser).
   - **Strava account download** (has `activities.csv`): the CSV lists each activity's type, date and track file. Types Run, Trail Run, Walk and Hike are kept; rides, swims, virtual runs and the rest are skipped without opening their files, and manual entries have no file. Tracks are FIT (most), GPX or TCX, usually gzipped (detected by content, since Strava's file names are sometimes wrong), and unzipped with the browser's own `DecompressionStream`. FIT is read by a small decoder of our own (`fit.ts`) that takes only time, position and speed from record messages and the sport from the session message, skipping everything else by size, including developer fields; it handles both byte orders, compressed timestamps and chained files. Garmin's FIT SDK is 1.4 MB and under its own license, so it's used only in tests, to build FIT files and check our decoder against its output. If the export is in another language (so activity types aren't recognised), the sport is read from each FIT file instead.
   - Distance is always worked out from the track, so both sources are measured the same way.
   - **Duplicates:** the same outing recorded twice (by the watch and by another app that also writes to Health, say) is kept once. Two workouts are duplicates when they share at least 80% of the shorter one's time and start within 200 m, whatever type each app gave it; the copy with more GPS points is kept. The page says how many were counted once.
2. **Clean** (`src/core/clean.ts`): drop warm-up fixes at the start of a track until horizontal accuracy is 12 m or better, drop any fix worse than 30 m, and drop jumps faster than 12 m/s.
3. **Color values** (`src/core/values.ts`): compute a value for every point (see Color below).
4. **Anchor** (`src/core/layout.ts`): convert each track to meters east (x) and north (y) of its first point. Every workout starts at (0, 0), north is up and east is right, and a kilometer is the same length wherever in the world it was run.
5. **Squash** (optional): pull long routes inward by raising distance from the anchor to a power (1 = true scale, 0.5 = square root). Direction is unchanged.
6. **Fit**: choose a bounding box and scale it uniformly onto the canvas, centered.
7. **Render** (`src/render/svg.ts`): draw the routes as SVG.

## Rules

### Anchoring and direction
- The beginning of every workout is anchored to the same place on the grid.
- Each workout follows its GPS track from the anchor: north goes up, south down, east right, west left.
- Distances are in meters on the ground, so shapes aren't distorted by latitude.

### Canvas shape
The image has a fixed print shape chosen by the person, independent of the browser window: 3:2 (default, 24×36 in posters), 4:3 (18×24 in), 5:4 (8×10, 16×20 in), 7:5 (5×7 in, 50×70 cm), ISO A-series (√2), 16:9, or square, in landscape or portrait. The short side is always 1200 px so text and line weights look the same across shapes. The preview takes the same shape, and the SVG clips its content to the canvas so embeds match the download.

### Fit and centering
- Default: the box is set so that **95%** of workouts fit fully on each side. The other 5% run off the edge, so one unusually long route doesn't shrink everything else into a dot. This percentile is a setting (50–100; 100 fits everything).
- Setting: **Squash long routes** (radial exponent, 0.3–1), for people who'd rather keep every route on the canvas.
- The fitted box is centered on the canvas with padding. The anchor is therefore not necessarily at the exact center.

### Color
The person picks two colors: **A** (cool) and **B** (hot). Colors are blended in OKLCH so the middle of the scale stays vivid rather than going grey.

Two color modes:

- **Pace**: color changes *along* each route. Pace is taken from the speed the watch recorded (or from distance/time where missing) and smoothed over 20 seconds. Slow is A and fast is B. The scale is clipped to the 5th–95th percentile so a single glitch can't stretch it. Walks and runs share one scale, so walks sit toward A.
- **How often**: measured in **real-world space**, not in the anchored drawing. The world is split into 15 m cells, and each cell counts the number of *distinct* workouts that passed through it. A street is therefore hot when it was actually visited often, wherever those workouts started. That heat is then painted onto the anchored drawing. To tolerate GPS error, a point takes the busiest cell in its 3×3 neighbourhood. Counts are shown on a log scale from 1 visit (A) to the 99th percentile (B).

### Filters
- Activity types: runs, walks, hikes.
- Date range.
- Indoor workouts and workouts without a GPS route are always excluded.
- Frequency heat is computed from the filtered set only.

### Rendering
- Tracks are simplified to 1 px accuracy (Ramer–Douglas–Peucker) at the output size.
- Segments are grouped into 32 color steps with one `<path>` per step, drawn cool-to-hot so the hottest lines are on top. This keeps the SVG in the hundreds of kilobytes for hundreds of workouts.
- Blend modes: *glow* (`screen`, for dark backgrounds), *ink* (`multiply`, for light backgrounds), or none.

### Smoothing
Optional, measured in image pixels (0–40), so the same setting looks the same whatever the fit or squash. Each route is resampled at even spacing along its length and blurred with a Gaussian of that radius. The window narrows symmetrically near the ends, so every route still starts exactly on the anchor. The smoothed route is then simplified and drawn as a Catmull–Rom curve (cubic Béziers) through the kept points, with tangents taken from the whole route so color changes don't cause kinks. Colors are unchanged: each point keeps its pace or visit value. Heavy smoothing cuts corners, so routes get slightly shorter than true scale.

### Pencil style (experimental)
An optional hand-drawn look. [Rough.js](https://roughjs.com/) (MIT) redraws each color step's path with a slight wobble and bow, tracing every segment twice a little apart; route corners stay in place. Each color step has a fixed seed, so the preview, download and print match. A fractal-noise SVG filter then removes specks of each stroke to give graphite grain, sized in image units so it looks the same at print resolution. Rough.js's own output is about 6× larger than needed, so its drawing commands are re-serialized compactly (redundant moves dropped, relative offsets); pencil files end up about 4× the size of clean ones. Settings: wobble (Rough.js roughness 0.3–3) and grain (0–1). A "paper & graphite" preset sets a warm paper background, grey-to-black lines and ink blending.

### Distance scale
So viewers can judge how long routes are, the image carries a distance scale in km or miles (the web app defaults to miles for US, Liberia and Myanmar locales):
- **Bar** (default): bottom-left, about a fifth of the drawing wide, rounded to the nearest 1, 2 or 5 × 10ⁿ.
- **Distance rings**: dashed circles around the anchor at tidy distances, labelled along the quietest of 16 directions (the one with the fewest routes near its line), so the labels aren't drawn over.
- **None**.

When long routes are squashed, distance from the anchor is no longer linear and a bar would be wrong, so rings are drawn instead, spaced by the same squash as the routes. The scale color can be chosen; by default it is white or black depending on how light the background is. Labels always get a halo in the background color.

### Background (optional)
One quiet layer can go behind the routes: none (default), a street map, or distance over time. They're alternatives, never stacked. One "strength" setting (default 25%) sets how faint it is. The background isn't part of a style, so presets leave it alone.

#### Distance over time
A faint area chart of the distance covered across the dates shown. It spans the full width of the art and rises from its bottom edge to at most half its height, with a slightly stronger line along the top edge. It shades from 40% of the way along the color scale (color A is usually close to the background, so starting there would vanish) to color B at the latest date. It has no axes or labels, since the legend already gives the dates and totals. It follows the filters and uses only dates and distances, so it reveals nothing about place.
- *Running total* (default): always climbs. Steep stretches are big training blocks and flat ones are breaks. Sampled at most once per pixel column.
- *Distance per month* (per week for spans under 120 days): peaks and valleys, with empty months drawn as zero so breaks show. The line is smoothed through the midpoints between periods.
- *Milestone markers* (optional): level lines at round distances, 1, 2 or 5 × 10ⁿ apart and about five in all, drawn in the background color and clipped to the area so they read as thin gaps in the fill. Each has a tiny label in the same low-contrast ink as the made-with mark. On the running total the label sits just before the point where the total passes the milestone, like a marker on the ridge ("500 mi"); per month, labels sit at the left ("50 mi/mo").

#### Street map
For people whose routes mostly start from the same place (home), a translucent street map can go behind the routes. With the map on, routes are drawn in their **true position** around the map's point rather than each from its own start, so they line up with the real streets:
- **Where:** by default the most common start. Starts are counted on a 100 m grid, the busiest 3×3 neighbourhood wins, and the point is the average of the starts within 300 m of it. Or the person enters coordinates ("41.8781, -87.6298", as map apps copy them) or searches an address.
- **Routes starting at the point** (within 300 m) are drawn where they went, and the fit is based on them. Squash is off, since it would pull routes off their streets.
- **Routes starting elsewhere**, the person's choice:
  - *Where they really went* (default): also in true position, so they match the map too. Only those that cross the picture are kept; the rest (trips to other places) are left out of the file entirely rather than just clipped, so an image never carries places it doesn't show. The scene is built twice: once to find the area shown, then keeping routes that cross it.
  - *From the map's point*: each from its own start, as without a map. Every route is drawn, but these won't match the streets.
  - *Leave out*.

  The page says how many start at the point, and how many from elsewhere are drawn.
- **Map data:** vector tiles from [OpenFreeMap](https://openfreemap.org) (OpenStreetMap data; free, including commercial use, no key). The zoom is the finest (up to 14) that covers the visible area in at most 144 tiles. Tiles are decoded in the worker, converted to meters in the routes' frame, and cached, so style changes don't refetch.
- **Drawing:** one color (white or black to suit the background), under the routes and clipped with them: parks and woods as a light tint, water a stronger tint, rivers, paths dashed, minor streets thin, major roads bolder. The whole map layer takes the background strength as its opacity. Features outside the art are left out and the rest simplified to 0.75 px. Polygons use the nonzero fill rule, since neighbouring tiles overlap a little.
- **Credit:** "map © OpenMapTiles © OpenStreetMap contributors" in the bottom margin, next to (or instead of) the made-with mark. It is always drawn with a map.
- **Address search** uses OpenStreetMap's Nominatim, only when the person presses Find (its policy: no search-as-you-type, at most one request a second, attribution shown).
- **Offline or failed:** routes are drawn as usual, without the map, and the page says so.

### Style presets
Five finished looks someone can pick and be happy with, shown as cards at the top of the editor, with the title and name fields right under them. The page opens on Ember, showing an example poster made from the sample data (labelled as an example) until someone loads their own export. Each is an 18×24 in portrait poster (the size competitors and our catalog center on) with "How often" coloring, the legend in its own band, and totals plus dates under the title.

| Preset | Look | Legend |
| --- | --- | --- |
| Gallery | Light grey to navy on off-white; ink blend; light smoothing | Serif, spaced capitals, bottom center |
| Ember | Dark rust to orange on charcoal; glow blend | Sans, capitals, bottom center |
| Afterglow | Blue to gold on midnight; glow blend; smoothing 8 | Sans, top left |
| Terracotta | Peach to rust on cream; ink blend; heavy smoothing | Serif, bottom left |
| Sketch | Graphite pencil on warm paper | Mono, bottom right |

A preset sets the look (colors, lines, type, print shape, scale) but never the person's own choices: filters, title and name text, and units. An empty title becomes "My Workouts" so the poster reads as finished. Changing any look control afterwards marks the style as custom. Presets live in `src/render/presets.ts`, shared by the page and the CLI (`--preset`).

### Legend
An optional legend with up to three lines: a **title**, a **name**, and the **dates shown**. The dates are the first and last workout actually drawn, so they follow the filters, formatted as months ("Jan 2024 – Aug 2025"), days or years in the viewer's locale.

Formatting and placement:
- Placement: top or bottom × left, center or right. Text aligns to its side. If the legend takes the bottom-left corner, the scale bar moves to the bottom right.
- Font: sans, serif, mono or rounded. Only system fonts, so the single-file page works offline.
- Size (50–200%), color (automatic white/black to suit the background, or chosen), and the title optionally in spaced capitals.
- Backdrop: a halo in the background color, a translucent panel, or none. The SVG can't measure text, so the panel width is estimated from the character count.

- Color key: an optional small gradient bar between the words "rarely" and "often" (or "slower" and "faster" for pace), so viewers know what the colors mean. Presets turn it on.
- Totals: an optional line such as "412 runs · 2,318 mi" (GPS distance of the workouts drawn, in the chosen units; mixed types read "walks & runs" or "activities"). It shares the last line with the dates.
- Text band: optionally the legend gets its own band at the top or bottom (its height plus 1.5× the padding), and the routes are fitted into, and clipped to, the rest of the canvas, so they never run under the text. The routes fade out over the last 5% of the art next to the band rather than stopping at a hard edge.
- Scale labels use the legend's font, so the poster's type matches.

The title also becomes the SVG's `<title>`. All user text is XML-escaped.

## The page
- **First visit:** the page opens on an example poster from the sample data, with a badge saying so and a "Use my export" button, so there's something to look at and play with straight away. The how-to for getting an export (Apple Health on iPhone, including *Save to Files*; Strava's archive) is one click away, under the drop zone.
- **Loading:** a progress overlay on the poster shows the stage and how far through it is. The previous data stays loaded until the new file succeeds, so a bad file never leaves the page stuck. Files that aren't zips are refused before reading; errors are worded as next steps and shown as an alert, not as status text.
- **Controls:** Your data, then Style (open, with the title and name), then Workouts, Size & scale, Colors, Lines, Text, and Background style, all collapsible. Background style is a three-way switch (None / Street map / Distance) with its strength right under it; each choice's own settings follow as labelled dropdowns whose one-line help changes with the choice. Sliders with internal numbers say what their ends mean ("Zoom in" ↔ "Every route"). The color labels follow the mode (Slow/Fast or Rarely/Often). Typing a title or name turns the text on.
- **Layout:** the poster stays in view while the controls scroll (sticky beside them on wide screens, pinned to the top on phones). On touch screens the drop zone says "Choose your export zip".
- **Downloads:** PNG for sharing (2× the image) or for printing (as large as browsers reliably draw: about 16.7 million pixels, Safari's canvas limit; the option says how large it prints sharply at 300 ppi), and SVG. Files are named after the title and style, e.g. `my-workouts-afterglow.png`.
- **Accessibility:** the file input is visually hidden but focusable; the style cards are one radio group (arrow keys move and pick); help text is linked with `aria-describedby`; the preview's alt text names the poster and how many workouts it shows.

## Ordering prints
Prints are sold through a separate, private print shop service shared by the "Your data is beautiful" visualizations, and made and shipped by Printful. The page's order panel (behind `?orders` until launch):
- Loads products, sizes, frame options and prices from the shop (`src/web/shop.ts`), so the page never holds costs or supplier details.
- Draws the poster's **print version** for the chosen product with a one-off engine render: the product's shape, no "made with" mark, and, for magnets and coasters, the routes alone (under 4 inches is too small for text). Coasters come as a set of four of the same design. Notebooks are always upright.
- Shows an instant, sharp **close-up** of that version as the product, drawn in the page (`src/web/product-preview.ts`): frame color and mat, canvas edge, metal sheen, magnet corners, the four coasters, notebook binding.
- On request, **room scenes** from Printful: the page composes the whole print area as the shop will print it (artwork in the face, background color in any wrap, bleed or mat margin) and the shop asks Printful for mockups. Printful allows two mockup tasks a minute per store, so the page waits and retries when it's busy.
- **Prints & products page** (`public/products.html`): photos of every product made by Printful's mockup generator from sample stridemap posters (a different style per product), with materials, sizes, live prices from the shop, making and shipping times. Linked from the order panel (opening the type being viewed) and the footer.
- **Checkout** sends the print version to the shop, which opens Stripe Checkout; afterwards the page thanks the buyer with their order number.

## Performance
A person's history can be thousands of workouts and millions of GPS points, so:
- **All heavy work runs in a Web Worker** that holds the workouts. The page only sends settings and receives SVG. While a redraw is running, only the newest settings are kept, so dragging a slider never queues stale frames.
- **Work is cached at the level it depends on**:
  - per workout, computed once: GPS cleanup, anchored shape, pace. Only the start point is kept besides the anchored shape; real-world positions are worked back out from them when needed (exact to well under a millimeter), so positions aren't stored twice
  - per selection (filters): the real-world visit grid and each workout's visit values
  - per filters + layout: the scene (fit, squash, color range)
  - per scene + route style: the drawn routes, so legend and scale edits don't redraw them
- Visit-grid cells use numeric keys, and each cell's 3×3 neighbourhood is computed once.
- Percentiles for the color range come from an even sample of at most 200,000 values.

With 1,500 workouts (4.3 M points), a settings change takes about 0.4–0.9 s to redraw, and the page's main thread is never blocked for more than 50 ms.

## Code structure
- **One settings record.** `src/render/settings.ts` defines `EditorState`, every setting a person can change, as one flat record. The page's controls, the presets and the CLI all read and write it, and `toRenderRequest` turns it into the pipeline's filters and layout and the renderer's style. A preset is a complete `Look` (the subset of settings that make up a look). The page binds each setting to the control with the same id in one table (`src/web/controls.ts`).
- **Poster engine.** `src/app/poster.ts` draws every poster, for the page's worker, the command line and the print-file script alike. It owns what's worth keeping between drawings (the prepared workouts, the detected home point, the last few scenes, the visit-count grid, the drawn route shapes, and the map tiles), so a color or legend change redraws without rebuilding, with or without the street map. Nothing is cached in module-level state: a new data set gets a new engine.
- **Layers.** `core/` (data and geometry) depends on nothing; `render/` (drawing) only on `core/`; `map/` (tiles, geocoding) only on `core/`; `app/` (settings, presets, the engine) ties them together; `web/` and `scripts/` are the two front ends. `render/style.ts` holds every drawing option and its allowed values with no libraries, so the page's own script stays small; the drawing libraries load only in the worker.
- **Engine worker.** The page sends settings to a worker that holds the prepared workouts and returns SVG. The worker reads an export by asking the page for byte ranges: Safari won't let a worker read a file (or Blobs) on a page opened from disk, but the page itself can.
- **Tests.** Unit tests (Vitest) cover parsing, the pipeline and rendering; browser tests (Playwright, Chrome and WebKit) drive the built single-file page, including importing a generated fake export.

## Privacy
- Everything runs locally: in the browser (parsing happens in a Web Worker) or in the CLI. Nothing is uploaded.
- Anchoring discards absolute location. The output contains only positions relative to each workout's start, scaled to the canvas, so it can't be used to recover coordinates such as a home address. (A distinctive route shape could still be recognisable to someone who knows the area.)
- The optional street map is the exception, and the page and privacy page say so: an image with a map shows the real place routes start from. Loading tiles tells OpenFreeMap roughly which area is shown (to within a tile, a few km); an address is sent to Nominatim only when Find is pressed. Routes are never sent. The detected start point is worked out on the device.
- A Strava download holds more than routes (profile, photos and more); only `activities.csv` and the walk, run and hike track files are read.
- Real exports must never be committed. `.gitignore` excludes zips and export files, and tests use synthetic data only.

## Not yet decided / next
- Embeddable output: a `<script>` + web component or `<iframe>` snippet, in addition to SVG/PNG download.
- Per-activity pace scales (so walks aren't always at the cool end).
- Multi-stop color scales.
