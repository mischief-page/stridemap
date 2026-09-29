# stridemap

Turn your Apple Health walks and runs into a shareable piece of art.

Every route starts from the same point and heads off in the direction you actually went, so years of workouts form a color-graded spider web. Color shows either your **pace** along each route, or **how often** you've been down each street.

Your data never leaves your device. The export is read in your browser (or on your machine with the CLI), and the output has no real coordinates in it.

## Use it

1. On your iPhone, open **Health**, tap your profile picture, then **Export All Health Data**. This makes `export.zip` (it can take a few minutes).
2. Run the web app (below) and drop `export.zip` onto the page.
3. Pick colors and filters, then download an SVG or PNG.

No iPhone export handy? Click **Try with sample data**, or open the page with `?sample`.

## Run it as a single file

```sh
npm install
npm run build:single   # writes dist-single/stridemap.html
```

`stridemap.html` is fully self-contained (about 220 KB). Double-click it to open it in your browser. No server or internet connection is needed, and you can copy it anywhere.

## Develop

Requires Node 20 or later.

```sh
npm install
npm run dev          # web app at http://localhost:5173
npm test             # unit tests
npm run test:e2e     # browser tests (Chrome + WebKit) against the built single-file page
npm run typecheck
npm run sample-export -- out/sample-export.zip 60   # a fake Health export for trying the import
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

Legend options (the legend appears when any of the first three are given): `--title "…"`, `--name "…"`, `--dates`, `--date-format month|day|year`, `--legend-position top-left|top-center|top-right|bottom-left|bottom-center|bottom-right`, `--legend-font sans|serif|mono|rounded`, `--legend-size 0.5..2`, `--legend-caps`, `--legend-color`, `--legend-backdrop halo|panel|none`, `--no-mark` (leave off the small "made with stridemap" mark), `--stats` (a totals line such as "412 runs · 2,318 mi"), `--text-band` (keep the legend in its own band so routes never run under it).

## Deploy

The site is hosted on Cloudflare (static assets on Workers), currently at https://stridemap.matt-melchiori.workers.dev.

Every push to `main` deploys automatically once the unit and browser tests pass (the `deploy` job in `.github/workflows/ci.yml`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets). To deploy by hand:

```sh
npx wrangler login   # once per machine
npm run deploy       # builds and publishes
```

Configuration is in `wrangler.jsonc`; security headers are in `public/_headers`.

## Print proofs (Prodigi)

Settings live in `.env.local` (never committed): `PRODIGI_API_KEY`, `PRODIGI_API_URL`, `R2_BUCKET`, `R2_PUBLIC_URL`, and the recipient (`PRINT_TO_NAME`, `PRINT_TO_LINE1`, `PRINT_TO_CITY`, `PRINT_TO_STATE`, `PRINT_TO_ZIP`, optional `PRINT_TO_EMAIL`, `PRINT_TO_LINE2`).

```sh
npm run print-file -- --preset ember --sku GLOBAL-FAP-18X24     # 300 DPI print file in out/print/
npm run print-order -- --file out/print/ember-GLOBAL-FAP-18X24.png --sku GLOBAL-FAP-18X24
```

With a live key, `print-order` shows the price and stops unless given `--confirm-live`: live orders are charged and shipped.

## How it works

See [DESIGN.md](DESIGN.md) for the rules and the pipeline.

```
src/
  parse/    export.zip → workouts with GPS tracks (streaming, works in a Web Worker)
  core/     cleaning, pace, real-world frequency heat, anchoring and fitting
  render/   scene → SVG; settings.ts (every setting, shared by page and CLI); presets.ts
  sample/   synthetic workouts for demos and tests
  web/      the browser app: controls table, engine (worker client), preview, preset cards
scripts/    command-line renderer; fake-export generator
e2e/        browser tests
```

**Please never commit a real Health export**, even to a branch. Use the synthetic data for tests and examples.

## License

[MIT](LICENSE)
