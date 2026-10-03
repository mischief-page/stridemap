import { backgroundOf, composePrint, drawCloseUp, loadSvg } from './product-preview';
import { checkout, mockupStatus, products, startMockups, type ProductKind, type ShopProduct } from './shop';

/**
 * The "Order a print" panel: product type, size and frame, price, an instant
 * close-up of the poster as that product, optional room scenes from Printful,
 * and checkout through Stripe.
 */

const KIND_LABELS: Record<ProductKind, string> = {
  poster: 'Poster',
  framed: 'Framed',
  canvas: 'Canvas',
  metal: 'Metal',
  magnet: 'Magnet',
  coaster: 'Coasters',
  notebook: 'Notebook',
};

export interface OrderPanelDeps {
  /** The poster's print version for a product (its shape, no mark; routes only for small products). */
  artworkFor(product: ShopProduct): Promise<string>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** "Framed poster with mat, 18×24 in" → "18×24 in with mat". */
const sizeLabel = (p: ShopProduct) => p.name.replace(/^[^,]+, /, '') + (/ with mat/.test(p.name) ? ' with mat' : '');

export function orderPanel(deps: OrderPanelDeps): { refresh(): void } {
  const kinds = $('productKinds');
  const sizeSelect = $<HTMLSelectElement>('productSize');
  const optionSelect = $<HTMLSelectElement>('productOption');
  const canvas = $<HTMLCanvasElement>('productPreview');
  const roomButton = $<HTMLButtonElement>('roomScenes');
  const roomStatus = $('roomStatus');
  const roomImages = $('roomImages');
  const checkoutButton = $<HTMLButtonElement>('checkout');
  const errorBox = $('orderError');

  let catalog: ShopProduct[] = [];
  let kind: ProductKind = 'framed';
  /** Bumped on every change, so slow work for an earlier choice is dropped. */
  let generation = 0;
  let artwork: { generation: number; svg: string; img: HTMLImageElement } | null = null;

  const showError = (message: string | null) => {
    errorBox.textContent = message ?? '';
    errorBox.hidden = !message;
  };

  const product = () => catalog.find((p) => p.id === sizeSelect.value)!;
  const optionId = () => optionSelect.value;

  function buildKinds() {
    kinds.replaceChildren();
    for (const k of Object.keys(KIND_LABELS) as ProductKind[]) {
      if (!catalog.some((p) => p.kind === k)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.textContent = KIND_LABELS[k];
      b.setAttribute('aria-checked', String(k === kind));
      b.addEventListener('click', () => {
        kind = k;
        buildKinds();
        buildSizes();
      });
      kinds.append(b);
    }
  }

  function buildSizes() {
    const sizes = catalog.filter((p) => p.kind === kind);
    sizeSelect.replaceChildren(
      ...sizes.map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: `${sizeLabel(p)} — $${p.priceUsd}` })),
    );
    // Default to the middle size, the most common poster size.
    sizeSelect.selectedIndex = Math.min(1, sizes.length - 1);
    buildOptions();
  }

  function buildOptions() {
    const p = product();
    const options = p.options;
    $('productOptionField').hidden = options.length < 2;
    optionSelect.replaceChildren(...options.map((o) => Object.assign(document.createElement('option'), { value: o.id, textContent: o.label })));
    update();
  }

  async function update() {
    const p = product();
    const mine = ++generation;
    showError(null);
    $('productPrice').textContent = `$${p.priceUsd}`;
    $<HTMLAnchorElement>('productDetails').href = `products.html#${p.kind}`;
    $('productDescription').textContent = p.description;
    roomImages.replaceChildren();
    roomStatus.textContent = '';
    roomButton.disabled = true;
    checkoutButton.disabled = true;
    try {
      const svg = await deps.artworkFor(p);
      const img = await loadSvg(svg);
      if (mine !== generation) return;
      artwork = { generation: mine, svg, img };
      drawCloseUp(canvas, p, optionId(), img, backgroundOf(svg), Math.min(288, canvas.parentElement!.clientWidth));
      roomButton.disabled = false;
      checkoutButton.disabled = false;
    } catch (err) {
      if (mine === generation) showError(`Couldn't draw the preview: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Printful room scenes: started on request, polled until ready; when Printful is busy, tried again shortly. */
  async function roomScenes(attempt = 1) {
    if (!artwork || artwork.generation !== generation) return;
    const mine = generation;
    const p = product();
    roomButton.disabled = true;
    roomStatus.textContent = 'Making room scenes… (about 10 seconds)';
    try {
      const started = await startMockups(p.id, optionId(), composePrint(p, artwork.img, backgroundOf(artwork.svg)));
      if (started.status === 'busy') {
        if (attempt >= 4) throw new Error('Printful is busy; try again in a minute');
        roomStatus.textContent = 'Printful is busy making other previews; trying again in 30 seconds…';
        setTimeout(() => void roomScenes(attempt + 1), 30_000);
        return;
      }
      let state = started;
      while (state.status === 'pending') {
        await new Promise((r) => setTimeout(r, 2500));
        if (mine !== generation) return;
        state = await mockupStatus(state.id);
      }
      if (mine !== generation) return;
      if (state.status === 'failed' || !state.images.length) throw new Error('Printful couldn’t make them this time');
      roomStatus.textContent = '';
      roomImages.replaceChildren(
        ...state.images.map((src, i) => {
          const a = Object.assign(document.createElement('a'), { href: src, target: '_blank', rel: 'noopener' });
          a.append(Object.assign(document.createElement('img'), { src, alt: `${p.name} in a room, view ${i + 1}`, loading: 'lazy' }));
          return a;
        }),
      );
    } catch (err) {
      if (mine === generation) roomStatus.textContent = `Couldn't make room scenes: ${err instanceof Error ? err.message : String(err)}.`;
    } finally {
      if (mine === generation) roomButton.disabled = false;
    }
  }

  async function startCheckout() {
    if (!artwork) return;
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Opening checkout…';
    showError(null);
    try {
      location.href = await checkout(product().id, optionId(), artwork.svg, location.href.split('#')[0]!);
    } catch (err) {
      showError(`Couldn't open checkout: ${err instanceof Error ? err.message : String(err)}`);
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Checkout';
    }
  }

  sizeSelect.addEventListener('change', buildOptions);
  optionSelect.addEventListener('change', () => void update());
  roomButton.addEventListener('click', () => void roomScenes());
  checkoutButton.addEventListener('click', () => void startCheckout());

  products().then(
    (list) => {
      catalog = list;
      buildKinds();
      buildSizes();
    },
    (err) => showError(`Prints are unavailable right now: ${err instanceof Error ? err.message : String(err)}`),
  );

  return {
    /** The poster changed: redraw the product preview (room scenes are for the old design). */
    refresh() {
      if (catalog.length) void update();
    },
  };
}

/** After Stripe: thanks (with the order number) or a note that checkout was canceled. */
export function orderReturnBanner(): void {
  const params = new URLSearchParams(location.search);
  const order = params.get('order');
  if (!order) return;
  const banner = $('orderBanner');
  banner.textContent =
    order === 'canceled'
      ? 'Checkout canceled. Nothing was charged.'
      : `Thank you! Your order number is ${order}. You'll get a receipt from Stripe, and Printful will email tracking when it ships.`;
  banner.hidden = false;
  params.delete('order');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
}
