/**
 * Shows where a Prodigi order is: each production step, any issues, and tracking.
 *
 *   npm run print-status -- ord_1175284          (test environment)
 *   npm run print-status -- ord_123 --live
 */
import { parseArgs } from 'node:util';
import { getOrder, useLive } from '../src/print/prodigi';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { live: { type: 'boolean', default: false } } });
if (values.live) useLive();
if (!positionals[0]) throw new Error('Pass an order id, e.g. ord_1175284');

const order = await getOrder(positionals[0]);
console.log(`${order.id}: ${order.status.stage}`);
for (const [step, state] of Object.entries(order.status.details)) console.log(`  ${step.padEnd(28)} ${state}`);
for (const issue of order.status.issues) console.log(`  issue: ${issue.errorCode ?? ''} ${issue.description ?? ''}`);
for (const item of order.items) console.log(`  item ${item.sku}: ${item.status}`);
for (const s of order.shipments ?? []) console.log(`  shipped via ${s.carrier?.name ?? '?'}: ${s.tracking?.url ?? s.tracking?.number ?? 'no tracking yet'}`);
