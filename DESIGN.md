# stridemap design

stridemap turns a person's outdoor walks and runs into a single piece of art: every route starts from the same point and spreads out in its true direction, forming a color-graded spider web.

## Pipeline

```
export.zip ─► parse ─► clean ─► color values ─► anchor ─► squash ─► fit ─► SVG
             (src/parse)       (src/core)                               (src/render)
```

1. **Parse** (`src/parse`): stream the Apple Health `export.zip`. The large `export.xml` is read with a streaming XML parser and never loaded whole. Only walking, running and hiking workouts are kept. Each workout's GPX route is read from `workout-routes/`.
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
- **Distance rings**: dashed circles around the anchor at tidy distances, labelled.
- **None**.

When long routes are squashed, distance from the anchor is no longer linear and a bar would be wrong, so rings are drawn instead, spaced by the same squash as the routes. The scale color can be chosen; by default it is white or black depending on how light the background is. Labels always get a halo in the background color.

### Legend
An optional legend with up to three lines: a **title**, a **name**, and the **dates shown**. The dates are the first and last workout actually drawn, so they follow the filters, formatted as months ("Jan 2024 – Aug 2025"), days or years in the viewer's locale.

Formatting and placement:
- Placement: top or bottom × left, center or right. Text aligns to its side. If the legend takes the bottom-left corner, the scale bar moves to the bottom right.
- Font: sans, serif, mono or rounded. Only system fonts, so the single-file page works offline.
- Size (50–200%), color (automatic white/black to suit the background, or chosen), and the title optionally in spaced capitals.
- Backdrop: a halo in the background color, a translucent panel, or none. The SVG can't measure text, so the panel width is estimated from the character count.

The title also becomes the SVG's `<title>`. All user text is XML-escaped.

## Performance
A person's history can be thousands of workouts and millions of GPS points, so:
- **All heavy work runs in a Web Worker** that holds the workouts. The page only sends settings and receives SVG. While a redraw is running, only the newest settings are kept, so dragging a slider never queues stale frames.
- **Work is cached at the level it depends on**:
  - per workout, computed once: GPS cleanup, anchored shape, pace
  - per selection (filters): the real-world visit grid and each workout's visit values
  - per filters + layout: the scene (fit, squash, color range)
  - per scene + route style: the drawn routes, so legend and scale edits don't redraw them
- Visit-grid cells use numeric keys, and each cell's 3×3 neighbourhood is computed once.
- Percentiles for the color range come from an even sample of at most 200,000 values.

With 1,500 workouts (4.3 M points), a settings change takes about 0.4–0.9 s to redraw, and the page's main thread is never blocked for more than 50 ms.

## Privacy
- Everything runs locally: in the browser (parsing happens in a Web Worker) or in the CLI. Nothing is uploaded.
- Anchoring discards absolute location. The output contains only positions relative to each workout's start, scaled to the canvas, so it can't be used to recover coordinates such as a home address. (A distinctive route shape could still be recognisable to someone who knows the area.)
- Real exports must never be committed. `.gitignore` excludes zips and export files, and tests use synthetic data only.

## Not yet decided / next
- Embeddable output: a `<script>` + web component or `<iframe>` snippet, in addition to SVG/PNG download.
- Per-activity pace scales (so walks aren't always at the cool end).
- Multi-stop color scales.
