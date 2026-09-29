import type { Aspect } from '../render/canvas';

/**
 * What we sell. Prices include Budget shipping within the US. Each product's
 * print shape matches one of the editor's print shapes, so choosing a product
 * locks the canvas to it; Prodigi's print areas are portrait, so landscape art
 * is turned a quarter turn in the print file.
 *
 * Costs (Prodigi print + Budget shipping to the US, quoted Sept 29, 2026) are
 * recorded to keep margins visible; they're not shown to customers.
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  kind: 'poster' | 'archival' | 'metal';
  priceUsd: number;
  costUsd: number;
  sku: string;
  attributes?: Record<string, string>;
  /** The editor print shape this product needs. */
  aspect: Aspect;
  /** Prodigi's print area, portrait, in pixels. */
  printPx: { width: number; height: number };
}

export const CATALOG: Product[] = [
  {
    id: 'poster-12x18',
    name: 'Poster, 12×18 in',
    description: 'Enhanced matte art paper, 200gsm',
    kind: 'poster',
    priceUsd: 39,
    costUsd: 21.1,
    sku: 'GLOBAL-FAP-12X18',
    aspect: '3:2',
    printPx: { width: 3600, height: 5400 },
  },
  {
    id: 'poster-18x24',
    name: 'Poster, 18×24 in',
    description: 'Enhanced matte art paper, 200gsm',
    kind: 'poster',
    priceUsd: 49,
    costUsd: 24.1,
    sku: 'GLOBAL-FAP-18X24',
    aspect: '4:3',
    printPx: { width: 5400, height: 7200 },
  },
  {
    id: 'poster-24x36',
    name: 'Poster, 24×36 in',
    description: 'Enhanced matte art paper, 200gsm',
    kind: 'poster',
    priceUsd: 65,
    costUsd: 36.65,
    sku: 'GLOBAL-FAP-24X36',
    aspect: '3:2',
    printPx: { width: 7200, height: 10800 },
  },
  {
    id: 'archival-18x24-photo-rag',
    name: 'Archival print, 18×24 in, Photo Rag',
    description: 'Hahnemühle Photo Rag: 100% cotton, acid-free, smooth matte. Crispest fine lines',
    kind: 'archival',
    priceUsd: 69,
    costUsd: 31.1,
    sku: 'GLOBAL-HPR-18X24',
    aspect: '4:3',
    printPx: { width: 5400, height: 7200 },
  },
  {
    id: 'archival-18x24-german-etching',
    name: 'Archival print, 18×24 in, German Etching',
    description: 'Hahnemühle German Etching: 100% cotton, acid-free, soft etching texture',
    kind: 'archival',
    priceUsd: 69,
    costUsd: 31.1,
    sku: 'GLOBAL-HGE-18X24',
    aspect: '4:3',
    printPx: { width: 5400, height: 7200 },
  },
  {
    id: 'metal-16x20',
    name: 'Metal print, 16×20 in',
    description: 'ChromaLuxe aluminium, satin finish, float-mount hanger. Made for the glowing styles',
    kind: 'metal',
    priceUsd: 189,
    costUsd: 104.85,
    sku: 'GLOBAL-MET-16X20',
    attributes: { finish: 'satin' },
    aspect: '5:4',
    printPx: { width: 4875, height: 6075 },
  },
];

export function findProduct(id: string): Product | undefined {
  return CATALOG.find((p) => p.id === id);
}

/** Card fees: 2.9% + 30¢. */
export function profitUsd(p: Product): number {
  return p.priceUsd - p.costUsd - (p.priceUsd * 0.029 + 0.3);
}
