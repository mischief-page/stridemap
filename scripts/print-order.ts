/**
 * Orders one print of a rendered print file through Prodigi, for checking how
 * the artwork looks on paper.
 *
 *   npm run print-order -- --file out/print/ember-GLOBAL-FAP-18X24.png --sku GLOBAL-FAP-18X24
 *
 * The file is uploaded to the R2 bucket (public, files deleted after 30 days)
 * so Prodigi can fetch it. Settings come from .env.local:
 *   PRODIGI_API_KEY, PRODIGI_API_URL, R2_BUCKET, R2_PUBLIC_URL, and, for live
 *   orders only, the recipient as PRINT_TO_NAME, PRINT_TO_EMAIL, PRINT_TO_LINE1,
 *   PRINT_TO_LINE2, PRINT_TO_CITY, PRINT_TO_STATE, PRINT_TO_ZIP (US addresses).
 *   Test orders use a placeholder address.
 *
 * Orders go to Prodigi's free test environment unless --live is given; a live
 * order also needs --confirm-live, because live orders are charged and shipped.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { createOrder, isLive, quote, useLive } from '../src/print/prodigi';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    sku: { type: 'string', default: 'GLOBAL-FAP-18X24' },
    color: { type: 'string' },
    'image-url': { type: 'string' },
    live: { type: 'boolean', default: false },
    'confirm-live': { type: 'boolean', default: false },
  },
});
if (values.live) useLive();
if (!values.file && !values['image-url']) throw new Error('Pass --file (a print file from npm run print-file) or --image-url.');

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
};

const item = { sku: values.sku!, attributes: values.color ? { color: values.color } : undefined };
const price = await quote(item);
console.log(`${item.sku}${values.color ? ` (${values.color})` : ''}: $${price.items} print + $${price.shipping} shipping = $${price.total}`);

if (isLive() && !values['confirm-live']) {
  console.log('Live key: nothing ordered. Add --confirm-live to place a real, charged order.');
  process.exit(0);
}

let imageUrl = values['image-url'];
if (!imageUrl) {
  // Unguessable name, so files can't be found by listing guesses.
  const key = `proofs/${randomUUID()}-${basename(values.file!)}`;
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${env('R2_BUCKET')}/${key}`, '--file', values.file!, '--content-type', 'image/png', '--remote'], { stdio: 'inherit' });
  imageUrl = `${env('R2_PUBLIC_URL')}/${key}`;
}

// Test orders go nowhere, so they use a placeholder; only live orders need (and use) a real address.
const recipient = isLive()
  ? {
      name: env('PRINT_TO_NAME'),
      email: process.env.PRINT_TO_EMAIL,
      address: {
        line1: env('PRINT_TO_LINE1'),
        line2: process.env.PRINT_TO_LINE2,
        townOrCity: env('PRINT_TO_CITY'),
        stateOrCounty: env('PRINT_TO_STATE'),
        postalOrZipCode: env('PRINT_TO_ZIP'),
        countryCode: 'US',
      },
    }
  : {
      name: 'Test Order',
      address: { line1: '1 Test Street', townOrCity: 'Chicago', stateOrCounty: 'IL', postalOrZipCode: '60601', countryCode: 'US' },
    };
console.log(`Image: ${imageUrl}`);
const order = await createOrder({ ...item, imageUrl }, recipient, `proof-${Date.now()}`);
console.log(`Ordered: ${order.id} (${order.status.stage}). Track it in the Prodigi dashboard.`);
