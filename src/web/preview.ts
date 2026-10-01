/**
 * Shows the SVG as an image rather than live SVG in the page. The browser then
 * draws the thousands of paths (and the pencil grain filter) once, instead of
 * again on every scroll or repaint. The new image is fully decoded before it
 * replaces the old one, so there's no flicker; a result that arrives after a
 * newer one is dropped.
 */
let previewSeq = 0;
let previewUrl = '';

export async function showPreview(container: HTMLElement, svg: string, alt: string): Promise<boolean> {
  const mine = ++previewSeq;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.alt = alt;
  img.src = url;
  try {
    await img.decode();
  } catch {
    // Decoding can fail if the image is replaced mid-way; the newer one wins.
  }
  if (mine !== previewSeq) {
    URL.revokeObjectURL(url);
    return false;
  }
  container.replaceChildren(img);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = url;
  return true;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: string, name: string): void {
  download(new Blob([svg], { type: 'image/svg+xml' }), name);
}

/** A PNG of the image at `scale` times its size. */
export async function downloadPng(svg: string, size: { width: number; height: number }, scale: number, name: string): Promise<void> {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('this browser could not make an image that large');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('this browser could not make an image that large');
    download(blob, name);
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
