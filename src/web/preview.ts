/**
 * Shows the SVG as an image rather than live SVG in the page. The browser then
 * draws the thousands of paths (and the pencil grain filter) once, instead of
 * again on every scroll or repaint. The new image is fully decoded before it
 * replaces the old one, so there's no flicker; a result that arrives after a
 * newer one is dropped.
 */
let previewSeq = 0;
let previewUrl = '';

export async function showPreview(container: HTMLElement, svg: string): Promise<boolean> {
  const mine = ++previewSeq;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.alt = 'Preview of your route artwork';
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

export function downloadSvg(svg: string): void {
  download(new Blob([svg], { type: 'image/svg+xml' }), 'stridemap.svg');
}

/** A PNG at twice the image's size, for sharp prints and screens. */
export async function downloadPng(svg: string, size: { width: number; height: number }): Promise<void> {
  const scale = 2;
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await img.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: size.width * scale, height: size.height * scale });
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  canvas.toBlob((blob) => blob && download(blob, 'stridemap.png'), 'image/png');
}
