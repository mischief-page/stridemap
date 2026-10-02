import type { ShopProduct } from './shop';

/**
 * Pictures of the poster as a product, drawn in the page from the product's
 * own print version: an instant, sharp close-up (frame, mat, canvas edge,
 * metal sheen…), and the composed print image Printful turns into room scenes.
 */

export function loadSvg(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.src = url;
  return img.decode().then(
    () => img,
    (err) => {
      URL.revokeObjectURL(url);
      throw err;
    },
  );
}

/** The artwork's background, as the renderer draws it. */
export function backgroundOf(svg: string): string {
  return svg.slice(0, 4096).match(/<rect width="100%" height="100%" fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? '#ffffff';
}

/** The print area in the artwork's orientation, and the face inside it, in inches. */
function printLayout(p: ShopProduct, landscape: boolean) {
  const { widthIn, heightIn, insetXIn, insetYIn } = p.print;
  return landscape
    ? { w: heightIn, h: widthIn, face: { x: insetYIn, y: insetXIn, w: heightIn - 2 * insetYIn, h: widthIn - 2 * insetXIn } }
    : { w: widthIn, h: heightIn, face: { x: insetXIn, y: insetYIn, w: widthIn - 2 * insetXIn, h: heightIn - 2 * insetYIn } };
}

/** Draws the artwork scaled to fit (centered) inside a rectangle. */
function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * The whole print area as the shop will print it (artwork in the face,
 * background around it), as a PNG data URL for Printful's room scenes.
 */
export function composePrint(p: ShopProduct, img: HTMLImageElement, background: string, longSidePx = 1500): string {
  const landscape = img.naturalWidth > img.naturalHeight;
  const L = printLayout(p, landscape);
  const k = longSidePx / Math.max(L.w, L.h);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(L.w * k), height: Math.round(L.h * k) });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawContained(ctx, img, L.face.x * k, L.face.y * k, L.face.w * k, L.face.h * k);
  return canvas.toDataURL('image/png');
}

const FRAMES: Record<string, { color: string; edge: string }> = {
  black: { color: '#1b1b1b', edge: '#000000' },
  white: { color: '#f2f1ee', edge: '#d9d6d0' },
  oak: { color: '#b07d4f', edge: '#7d5432' },
};

/**
 * A close-up of the product on a soft wall, at `size` CSS pixels (drawn at the
 * screen's pixel density so fine route lines stay sharp).
 */
export function drawCloseUp(canvas: HTMLCanvasElement, p: ShopProduct, optionId: string, img: HTMLImageElement, background: string, size: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // A soft wall.
  const wall = ctx.createLinearGradient(0, 0, 0, size);
  wall.addColorStop(0, '#f1eee9');
  wall.addColorStop(1, '#e4e0d9');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, size, size);

  const landscape = img.naturalWidth > img.naturalHeight;
  const artShape = img.naturalWidth / img.naturalHeight;
  // The product's outer size: the poster plus any frame, at most 78% of the view.
  const frame = p.kind === 'framed' ? FRAMES[optionId] ?? FRAMES.black! : null;
  const mat = p.id.includes('mat');
  const longIn = Math.max(p.print.widthIn - 2 * p.print.insetXIn, p.print.heightIn - 2 * p.print.insetYIn);
  const frameIn = frame ? 0.75 : 0;
  const matIn = mat ? 2.2 : 0;
  const outerShape = (() => {
    const [w, h] = landscape ? [longIn, longIn / artShape] : [longIn * artShape, longIn];
    return (w + 2 * (frameIn + matIn)) / (h + 2 * (frameIn + matIn));
  })();
  const box = size * 0.78;
  const ow = outerShape >= 1 ? box : box * outerShape;
  const oh = outerShape >= 1 ? box / outerShape : box;
  const ox = (size - ow) / 2;
  const oy = (size - oh) / 2 - size * 0.02;
  const inch = oh / ((landscape ? longIn / artShape : longIn) + 2 * (frameIn + matIn));

  const shadow = (blur: number, dy: number, alpha: number, draw: () => void) => {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = dy;
    draw();
    ctx.restore();
  };
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

  switch (p.kind) {
    case 'framed': {
      shadow(size * 0.04, size * 0.015, 0.35, () => {
        ctx.fillStyle = frame!.color;
        ctx.fillRect(ox, oy, ow, oh);
      });
      // Frame bevel: a darker inner edge.
      const f = frameIn * inch;
      ctx.fillStyle = frame!.edge;
      ctx.fillRect(ox + f - 1.5, oy + f - 1.5, ow - 2 * f + 3, oh - 2 * f + 3);
      if (mat) {
        ctx.fillStyle = '#fbfaf7';
        ctx.fillRect(ox + f, oy + f, ow - 2 * f, oh - 2 * f);
        const m = (frameIn + matIn) * inch;
        ctx.fillStyle = background;
        ctx.fillRect(ox + m, oy + m, ow - 2 * m, oh - 2 * m);
        drawContained(ctx, img, ox + m, oy + m, ow - 2 * m, oh - 2 * m);
        // The mat's cut edge casts a thin shadow on the print.
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ox + m + 0.75, oy + m + 0.75, ow - 2 * m - 1.5, oh - 2 * m - 1.5);
      } else {
        drawContained(ctx, img, ox + f, oy + f, ow - 2 * f, oh - 2 * f);
      }
      // Acrylic front: a faint diagonal sheen.
      const sheen = ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
      sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
      sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(ox + f, oy + f, ow - 2 * f, oh - 2 * f);
      break;
    }
    case 'canvas': {
      // The wrapped side, seen slightly from the right.
      const depth = size * 0.018;
      shadow(size * 0.035, size * 0.015, 0.3, () => {
        ctx.fillStyle = background;
        ctx.fillRect(ox, oy, ow + depth, oh + depth * 0.4);
      });
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(ox + ow, oy + depth * 0.4, depth, oh);
      drawContained(ctx, img, ox, oy, ow, oh);
      break;
    }
    case 'metal': {
      shadow(size * 0.05, size * 0.025, 0.35, () => {
        ctx.fillStyle = background;
        ctx.fillRect(ox, oy, ow, oh);
      });
      drawContained(ctx, img, ox, oy, ow, oh);
      const gloss = ctx.createLinearGradient(ox, oy, ox + ow * 0.6, oy + oh);
      gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
      gloss.addColorStop(0.35, 'rgba(255,255,255,0.03)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(ox, oy, ow, oh);
      break;
    }
    case 'magnet': {
      const r = ow * 0.06;
      shadow(size * 0.03, size * 0.012, 0.3, () => {
        ctx.fillStyle = background;
        roundRect(ox, oy, ow, oh, r);
        ctx.fill();
      });
      ctx.save();
      roundRect(ox, oy, ow, oh, r);
      ctx.clip();
      drawContained(ctx, img, ox, oy, ow, oh);
      ctx.restore();
      break;
    }
    case 'notebook': {
      const r = ow * 0.025;
      shadow(size * 0.03, size * 0.015, 0.3, () => {
        ctx.fillStyle = background;
        roundRect(ox, oy, ow, oh, r);
        ctx.fill();
      });
      ctx.save();
      roundRect(ox, oy, ow, oh, r);
      ctx.clip();
      drawContained(ctx, img, ox, oy, ow, oh);
      ctx.restore();
      // Wire-o binding along the left edge.
      ctx.strokeStyle = '#9a9a9a';
      ctx.lineWidth = Math.max(1.5, ow * 0.012);
      const loops = 22;
      for (let i = 0; i < loops; i++) {
        const y = oy + oh * 0.04 + ((oh * 0.92) / (loops - 1)) * i;
        ctx.beginPath();
        ctx.ellipse(ox + ow * 0.02, y, ow * 0.035, oh * 0.008, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    default: {
      // Poster: paper on the wall.
      shadow(size * 0.03, size * 0.012, 0.25, () => {
        ctx.fillStyle = background;
        ctx.fillRect(ox, oy, ow, oh);
      });
      drawContained(ctx, img, ox, oy, ow, oh);
    }
  }
}
