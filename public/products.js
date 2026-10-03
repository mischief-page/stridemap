// Prints & products page: photo galleries, and live sizes and prices from the
// print shop (the page lists the sizes without prices if the shop can't be reached).
(() => {
  const SHOP = 'https://print-shop.matt-melchiori.workers.dev';

  for (const gallery of document.querySelectorAll('.gallery')) {
    const photos = gallery.dataset.photos.split(' ');
    const alt = gallery.dataset.alt;
    const main = Object.assign(document.createElement('img'), { className: 'main', src: `products/${photos[0]}.jpg`, alt: `${alt}, sample photo 1` });
    const thumbs = document.createElement('div');
    thumbs.className = 'thumbs';
    photos.forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Show photo ${i + 1}`);
      button.setAttribute('aria-pressed', String(i === 0));
      button.append(Object.assign(document.createElement('img'), { src: `products/${name}.jpg`, alt: '', loading: 'lazy' }));
      button.addEventListener('click', () => {
        main.src = `products/${name}.jpg`;
        main.alt = `${alt}, sample photo ${i + 1}`;
        for (const b of thumbs.children) b.setAttribute('aria-pressed', String(b === button));
      });
      thumbs.append(button);
    });
    gallery.append(main, thumbs);
  }

  fetch(`${SHOP}/v1/products`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(({ products }) => {
      for (const list of document.querySelectorAll('.sizes[data-kind]')) {
        const items = products.filter((p) => p.kind === list.dataset.kind);
        if (!items.length) continue;
        list.replaceChildren(
          ...items.map((p) => {
            const li = document.createElement('li');
            // "Framed poster with mat, 18×24 in" → "18×24 in with mat".
            const size = p.name.replace(/^[^,]+, /, '') + (/ with mat/.test(p.name) ? ' with mat' : '') + (p.kind === 'coaster' ? ', each 3.74×3.74 in' : '');
            const options = p.options.length > 1 ? ` (${p.options.map((o) => o.label.replace(/ frame$/, '').toLowerCase()).join(', ')})` : '';
            li.append(Object.assign(document.createElement('span'), { textContent: size + options }), Object.assign(document.createElement('span'), { className: 'price', textContent: `$${p.priceUsd}` }));
            return li;
          }),
        );
      }
    })
    .catch(() => {});
})();
