/**
 * A thin client for Prodigi's print API (https://www.prodigi.com/print-api/docs/reference/).
 * Keys come from the environment (.env.local locally, never the repo). The free
 * test environment (PRODIGI_API_KEY / PRODIGI_API_URL) is the default; useLive()
 * switches to PRODIGI_LIVE_API_KEY / PRODIGI_LIVE_API_URL, where orders are real.
 */
let live = false;
export function useLive(): void {
  live = true;
}
const baseUrl = () =>
  (live ? process.env.PRODIGI_LIVE_API_URL : process.env.PRODIGI_API_URL) ??
  (live ? 'https://api.prodigi.com/v4.0' : 'https://api.sandbox.prodigi.com/v4.0');
export const isLive = () => live;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = live ? process.env.PRODIGI_LIVE_API_KEY : process.env.PRODIGI_API_KEY;
  if (!key) throw new Error(`${live ? 'PRODIGI_LIVE_API_KEY' : 'PRODIGI_API_KEY'} is not set (put it in .env.local).`);
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json()) as T & { outcome?: string };
  if (!res.ok) throw new Error(`Prodigi ${init?.method ?? 'GET'} ${path}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** Pixel size of the product's print area (what the image must be). */
export async function printSize(sku: string): Promise<{ width: number; height: number }> {
  const { product } = await call<{ product: { variants: { printAreaSizes: Record<string, { horizontalResolution: number; verticalResolution: number }> }[] } }>(
    `/products/${sku}`,
  );
  const area = product.variants[0]!.printAreaSizes.default!;
  return { width: area.horizontalResolution, height: area.verticalResolution };
}

export interface Recipient {
  name: string;
  email?: string;
  address: { line1: string; line2?: string; townOrCity: string; stateOrCounty: string; postalOrZipCode: string; countryCode: string };
}

export interface PrintItem {
  sku: string;
  /** e.g. { color: 'black' } for frames */
  attributes?: Record<string, string>;
  imageUrl: string;
}

/** Price of one print shipped to a country, in USD. Quotes are free and create nothing. */
export async function quote(item: Omit<PrintItem, 'imageUrl'>, countryCode = 'US') {
  const { quotes } = await call<{ quotes: { costSummary: Record<string, { amount: string }> }[] }>('/quotes', {
    method: 'POST',
    body: JSON.stringify({
      shippingMethod: 'Standard',
      destinationCountryCode: countryCode,
      currencyCode: 'USD',
      items: [{ sku: item.sku, copies: 1, attributes: item.attributes ?? {}, assets: [{ printArea: 'default' }] }],
    }),
  });
  const c = quotes[0]!.costSummary;
  return { items: Number(c.items!.amount), shipping: Number(c.shipping!.amount), total: Number(c.totalCost!.amount) };
}

/** Places an order. With a live key this is a real, charged order. */
export async function createOrder(item: PrintItem, recipient: Recipient, reference: string) {
  const { order } = await call<{ order: { id: string; status: { stage: string } } }>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      merchantReference: reference,
      shippingMethod: 'Standard',
      recipient,
      items: [
        {
          sku: item.sku,
          copies: 1,
          sizing: 'fillPrintArea',
          attributes: item.attributes ?? {},
          assets: [{ printArea: 'default', url: item.imageUrl }],
        },
      ],
    }),
  });
  return order;
}

export interface OrderStatus {
  id: string;
  status: { stage: string; issues: { errorCode?: string; description?: string }[]; details: Record<string, string> };
  items: { sku: string; status: string }[];
  shipments?: { carrier?: { name?: string }; tracking?: { number?: string; url?: string } }[];
}

export async function getOrder(id: string): Promise<OrderStatus> {
  return (await call<{ order: OrderStatus }>(`/orders/${id}`)).order;
}
