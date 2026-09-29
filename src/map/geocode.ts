import type { GeoPoint } from './anchor';

/**
 * Looks up an address with OpenStreetMap's Nominatim. Its usage policy allows
 * searches a person asks for (no search-as-you-type), at most one a second,
 * with attribution. This is the only time an address leaves the device, so
 * the page only calls it when someone presses Find.
 */
const SEARCH = 'https://nominatim.openstreetmap.org/search';
export const GEOCODE_ATTRIBUTION = 'Search by Nominatim, © OpenStreetMap contributors';

let lastCall = 0;

export async function geocode(
  address: string,
  fetchFn: typeof fetch = fetch,
  headers: Record<string, string> = {},
): Promise<(GeoPoint & { label: string }) | null> {
  const wait = lastCall + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const url = `${SEARCH}?${new URLSearchParams({ q: address, format: 'jsonv2', limit: '1' })}`;
  const res = await fetchFn(url, { headers });
  if (!res.ok) throw new Error(`address search failed (${res.status})`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name } : null;
}
