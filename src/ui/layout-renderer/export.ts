// Phase 7 — SVG / PNG export helpers.
//
// Both exports operate on a live <svg> element passed by the caller. SVG
// export serialises the DOM directly so Illustrator / Inkscape can re-edit
// the file. PNG export rasterises through a canvas at 2× pixel density to
// give a presentation-grade output.
//
// Browser-only: relies on URL.createObjectURL + DOMSerializer + canvas.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Serialise an in-DOM <svg> element to a self-contained SVG document
 * (with xmlns + xml prologue) and return it as a string.
 */
export function serialiseSvg(svg: SVGSVGElement): string {
  // Clone the node so we can safely add xmlns + width/height attrs without
  // mutating the live DOM.
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  if (!cloned.getAttribute('xmlns')) cloned.setAttribute('xmlns', SVG_NS);
  if (!cloned.getAttribute('xmlns:xlink')) {
    cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  const serialiser = new XMLSerializer();
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serialiser.serializeToString(cloned);
}

export function downloadSvg(svg: SVGSVGElement, fileName: string): void {
  const xml = serialiseSvg(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, fileName);
}

export async function downloadPng(
  svg: SVGSVGElement,
  fileName: string,
  pixelRatio = 2
): Promise<void> {
  const xml = serialiseSvg(svg);
  const widthAttr = parseFloat(svg.getAttribute('width') ?? '720');
  const heightAttr = parseFloat(svg.getAttribute('height') ?? '480');

  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthAttr * pixelRatio));
    canvas.height = Math.max(1, Math.round(heightAttr * pixelRatio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    // Light background so the rasterised PNG is readable on dark slides.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/png'
      );
    });
    triggerDownload(pngBlob, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click has time to enqueue the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
