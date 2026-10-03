# stridemap

Turn your Apple Health or Strava walks and runs into a shareable piece of art.

Every route starts from the same point and heads off in the direction you actually went, so years of workouts form a color-graded spider web. Color shows either your **pace** along each route, or **how often** you've been down each street.

Your data never leaves your device. The export is read in your browser (or on your machine with the CLI), and the output has no real coordinates in it, unless you turn on the optional street map, which shows the real place your routes start from.

## Use it

1. Get your data as a zip:
   - **Apple Health:** on your iPhone, open **Health**, tap your profile picture, then **Export All Health Data**. This makes `export.zip` (it can take a few minutes).
   - **Strava:** on strava.com, open **Settings → My Account → Download or Delete Your Account → Get Started**, then **Request Your Archive**. Strava emails you a link to the zip.
2. Run the web app (below) and drop the zip onto the page, as it is.
3. Pick a style, type a title, adjust anything else, then download a PNG (sized for sharing or for printing) or an SVG.

The page opens on an example poster made from sample data, so you can try every setting before finding your export.

## Run it as a single file

```sh
npm install
npm run build:single   # writes dist-single/stridemap.html
```

`stridemap.html` is fully self-contained (about 270 KB). Double-click it to open it in your browser. No server or internet connection is needed, and you can copy it anywhere.

## Develop

Requires Node 20 or later.

```sh
npm install
npm run dev          # web app at http://localhost:5173
npm test             # unit tests
npm run test:e2e     # browser tests (Chrome + WebKit) against the built single-file page
npm run typecheck
npm run sample-export -- out/sample-export.zip 60   # a fake Health export for trying the import
npx tsx scripts/make-sample-strava.ts out/strava-export.zip 30   # a fake Strava download
```

Render from the command line:

```sh
npm run cli -- --sample --out out/sample.svg
npm run cli -- ~/Downloads/export.zip --mode frequency --types running --from 2025-01-01 --out out/runs.svg
```

Start from a finished style with `--preset gallery|ember|afterglow|terracotta|sketch`; any other look option overrides it:

```sh
npm run cli -- --sample --preset gallery --title "Two Years on Foot" --name "Alex" --out out/gallery.svg
```

CLI options: `--aspect 3:2|4:3|5:4|7:5|iso|16:9|1:1` (default 3:2 landscape; add `--portrait`), `--mode pace|frequency`, `--types running,walking,hiking`, `--from`/`--to` (dates), `--fit 50..100`, `--squash 0.3..1`, `--smooth 0..40` (pixels), `--pencil 0.3..3` (hand-drawn wobble; turns on the pencil style) with `--grain 0..1`, `--color-a`, `--color-b`, `--background`, `--line-width`, `--opacity`, `--blend screen|multiply|normal`, `--scale bar|rings|off`, `--units km|mi`, `--scale-color` (defaults to white or black to suit the background).

Legend options (the legend appears when any of the first three are given): `--title "…"`, `--name "…"`, `--dates`, `--date-format month|day|year`, `--legend-position top-left|top-center|top-right|bottom-left|bottom-center|bottom-right`, `--legend-font sans|serif|mono|rounded`, `--legend-size 0.5..2`, `--legend-caps`, `--legend-color`, `--legend-backdrop halo|panel|none`, `--no-mark` (leave off the small "made with stridemap" mark), `--no-legend` (no title or details), `--stats` (a totals line such as "412 runs · 2,318 mi"), `--color-key` (a small key saying what the colors mean), `--text-band` (keep the legend in its own band so routes never run under it).

Street map behind the routes (optional; for when most routes start from the same place): `--map` centres it where most routes start, `--map-at "41.8781, -87.6298"` on a point, or `--map-address "…"` on an address (looked up with OpenStreetMap's Nominatim, the only step that sends anything off your machine). `--background-strength 0.05..0.8`, `--map-others true|anchored|omit` (routes starting elsewhere: where they really went, the default; from the map's point; or left out). Map tiles come from [OpenFreeMap](https://openfreemap.org).

```sh
npm run cli -- ~/Downloads/export.zip --preset gallery --map --out out/map.svg
```

Or a faint chart of distance over time behind the routes: `--distance total` (running total, climbing) or `--distance monthly` (distance per month). It takes the same `--background-strength`; add `--distance-markers` for milestone lines (500 mi, 1,000 mi…).

## Deploy

The site is hosted on Cloudflare (static assets on Workers), currently at https://stridemap.matt-melchiori.workers.dev.

Every push to `main` deploys automatically once the unit and browser tests pass (the `deploy` job in `.github/workflows/ci.yml`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets). To deploy by hand:

```sh
npx wrangler login   # once per machine
npm run deploy       # builds and publishes
```

Configuration is in `wrangler.jsonc`; security headers are in `public/_headers`.

## Prints

Prints are ordered through the private print shop service (Stripe Checkout, fulfilled by Printful); the page's order panel (still behind `?orders` until launch) talks to it. To check how a print will look:

```sh
npm run print-file -- --preset ember --size 18x24     # 300 DPI print file in out/print/ (takes every CLI option too)
```

## How it works

See [DESIGN.md](DESIGN.md) for the rules and the pipeline.

```
src/
  parse/    Apple Health or Strava zip → workouts with GPS tracks (streaming, works in a Web Worker); FIT, GPX, TCX, CSV readers
  map/      optional street map: most common start, map tiles, address search
  core/     cleaning, pace, real-world frequency heat, anchoring and fitting
  render/   scene → SVG; style.ts (every drawing option and its allowed values, no libraries)
  app/      settings.ts (every setting, shared by page and CLI), presets.ts, poster.ts (the PosterEngine all drawing goes through)
  sample/   synthetic workouts for demos and tests
  web/      the browser app: controls table, engine (worker client), preview, preset cards
scripts/    command-line renderer and print files (options.ts: the shared, checked options); fake-export generators
e2e/        browser tests
```

**Please never commit a real Health export**, even to a branch. Use the synthetic data for tests and examples.

## License

[MIT](LICENSE)
