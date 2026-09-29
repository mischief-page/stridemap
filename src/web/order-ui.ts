import { CATALOG, type Product } from '../print/catalog';

/**
 * The "Order a print" panel: one card per product with its price. Returns a
 * function that marks the chosen product (null for none).
 */
export function productCards(container: HTMLElement, onPick: (p: Product) => void): (id: string | null) => void {
  for (const p of CATALOG) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'product';
    card.dataset.id = p.id;
    card.setAttribute('role', 'radio');
    card.innerHTML = `<strong></strong><span class="price">$${p.priceUsd}</span><small></small>`;
    card.querySelector('strong')!.textContent = p.name;
    card.querySelector('small')!.textContent = p.description;
    card.addEventListener('click', () => onPick(p));
    container.append(card);
  }
  return (id) => {
    for (const card of container.children) card.setAttribute('aria-checked', String(card.getAttribute('data-id') === id));
  };
}
