/**
 * The print shop's API (the private print-shop service, shared by the "Your
 * data is beautiful" visualizations). Products and prices come from the shop,
 * so the page never holds costs or supplier details.
 */
export const SHOP_URL = 'https://print-shop.matt-melchiori.workers.dev';
const APP = 'stridemap';

export type ProductKind = 'poster' | 'framed' | 'canvas' | 'metal' | 'magnet' | 'notebook';

export interface ShopProduct {
  id: string;
  kind: ProductKind;
  name: string;
  description: string;
  priceUsd: number;
  /** Long side ÷ short side of the artwork. */
  shape: number;
  orientations: 'any' | 'portrait';
  /** 'routes-only': no text (small products). */
  design: 'full' | 'routes-only';
  /** Print area and the face inside it, inches, portrait. */
  print: { widthIn: number; heightIn: number; insetXIn: number; insetYIn: number };
  options: { id: string; label: string }[];
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${SHOP_URL}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

let catalog: Promise<ShopProduct[]> | null = null;

export function products(): Promise<ShopProduct[]> {
  catalog ??= call<{ products: ShopProduct[] }>('/v1/products').then(({ status, body }) => {
    if (status !== 200) throw new Error("the shop isn't answering");
    return body.products;
  });
  catalog.catch(() => (catalog = null));
  return catalog;
}

export type MockupResult = { status: 'pending' | 'completed' | 'failed'; id: string; images: string[] };
export type MockupState = MockupResult | { status: 'busy' };

/** Starts Printful room scenes for a composed preview image (PNG data URL). */
export async function startMockups(productId: string, optionId: string, image: string): Promise<MockupState> {
  const { status, body } = await call<MockupState & { error?: string }>('/v1/mockups', {
    method: 'POST',
    body: JSON.stringify({ app: APP, productId, optionId, image }),
  });
  if (status === 503 || status === 429) return { status: 'busy' };
  if (status !== 200) throw new Error(body.error ?? `the shop answered ${status}`);
  return body;
}

export async function mockupStatus(id: string): Promise<MockupResult> {
  const { status, body } = await call<MockupResult & { error?: string }>(`/v1/mockups/${encodeURIComponent(id)}`);
  if (status !== 200) throw new Error(body.error ?? `the shop answered ${status}`);
  return body;
}

/** Opens a checkout for this artwork; resolves to Stripe's page. */
export async function checkout(productId: string, optionId: string, svg: string, returnUrl: string): Promise<string> {
  const { status, body } = await call<{ checkoutUrl?: string; error?: string }>('/v1/checkout', {
    method: 'POST',
    body: JSON.stringify({ app: APP, productId, optionId, svg, returnUrl }),
  });
  if (status !== 200 || !body.checkoutUrl) throw new Error(body.error ?? `the shop answered ${status}`);
  return body.checkoutUrl;
}
