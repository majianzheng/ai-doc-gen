import type { ImageItem } from './types.js';

/**
 * Image resolution helpers shared by all generators.
 *
 * Accepted input forms (exactly one per image):
 *  - `data`: base64-encoded bytes, optionally a full `data:` URI
 *  - `url`:  http(s) URL downloaded at generation time
 *  - `svg`:  raw SVG XML markup
 *
 * The resolver normalizes every form into raw bytes plus a detected format,
 * and rasterizes SVG -> PNG (via @resvg/resvg-js) when the target format
 * (PDF / XLSX) cannot embed vector SVG.
 */

const FETCH_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export interface ResolvedImage {
  kind: 'raster' | 'svg';
  /** detected format: png | jpeg | gif | webp | bmp | svg */
  format: string;
  /** canonical MIME type */
  mimeType: string;
  buffer: Buffer;
  width?: number;
  height?: number;
  align?: 'left' | 'center' | 'right';
  caption?: string;
}

export function normalizeBase64(input: string): Buffer {
  const s = input.trim();
  if (/^data:/i.test(s)) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(s);
    if (!m) throw new Error('invalid data: URI for image');
    if (!m[2]) throw new Error('image data: URIs must be base64-encoded (;base64,)');
    return Buffer.from(m[3], 'base64');
  }
  return Buffer.from(s, 'base64');
}

function detectFormat(buffer: Buffer, declaredMime?: string): { format: string; mimeType: string } {
  const len = buffer.length;
  const b = (i: number) => buffer[i];
  if (len >= 4 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { format: 'png', mimeType: 'image/png' };
  if (len >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { format: 'jpeg', mimeType: 'image/jpeg' };
  if (len >= 6 && b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return { format: 'gif', mimeType: 'image/gif' };
  if (len >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return { format: 'webp', mimeType: 'image/webp' };
  if (len >= 2 && b(0) === 0x42 && b(1) === 0x4d) return { format: 'bmp', mimeType: 'image/bmp' };
  const mime = (declaredMime ?? '').toLowerCase();
  if (mime.includes('svg') || (len > 0 && b(0) === 0x3c)) {
    const head = buffer.subarray(0, Math.min(len, 256)).toString('utf8').trimStart();
    if (head.startsWith('<') && (head.includes('svg') || head.includes('<svg') || /<\?xml/i.test(head))) {
      return { format: 'svg', mimeType: 'image/svg+xml' };
    }
  }
  if (mime.includes('png')) return { format: 'png', mimeType: 'image/png' };
  if (mime.includes('jpeg') || mime.includes('jpg')) return { format: 'jpeg', mimeType: 'image/jpeg' };
  if (mime.includes('gif')) return { format: 'gif', mimeType: 'image/gif' };
  if (mime.includes('webp')) return { format: 'webp', mimeType: 'image/webp' };
  if (mime.includes('svg')) return { format: 'svg', mimeType: 'image/svg+xml' };
  throw new Error(
    'unable to detect image type from the provided bytes. Supported: PNG, JPEG, GIF, WebP, BMP, SVG. Provide `mimeType`, use a data: URI, or send SVG markup.',
  );
}

/**
 * Resolves one image item into normalized bytes + detected format.
 * Throws a descriptive error for unusable input (missing source, bad URL, ...).
 */
export async function resolveImage(item: ImageItem): Promise<ResolvedImage> {
  let buffer: Buffer;
  let declaredMime: string | undefined;

  const sources = [item.data !== undefined, item.url !== undefined, item.svg !== undefined].filter(Boolean).length;
  if (sources === 0) throw new Error('an image item must provide one of: data (base64), url, svg');
  if (sources > 1) throw new Error('an image item must provide exactly one of: data (base64), url, svg');

  if (item.url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(item.url, { signal: controller.signal, redirect: 'follow' });
    } catch (err) {
      throw new Error(`failed to download image from '${item.url}': ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new Error(`failed to download image from '${item.url}': HTTP ${resp.status}`);
    const array = new Uint8Array(await resp.arrayBuffer());
    if (array.byteLength === 0) throw new Error(`image download from '${item.url}' returned an empty body`);
    if (array.byteLength > MAX_IMAGE_BYTES) throw new Error(`image from '${item.url}' exceeds the ${MAX_IMAGE_BYTES >> 20} MB limit`);
    buffer = Buffer.from(array);
    const ct = resp.headers.get('content-type');
    declaredMime = ct && !ct.includes('text/html') ? ct : undefined;
    if (!declaredMime && !item.mimeType) {
      const dispo = resp.headers.get('content-disposition') ?? '';
      const nm = /filename="?([^";]+)"?/.exec(dispo)?.[1]?.toLowerCase();
      if (nm) declaredMime = mimeFromExtension(nm);
    }
  } else if (item.svg !== undefined) {
    buffer = Buffer.from(item.svg, 'utf8');
    declaredMime = 'image/svg+xml';
  } else {
    buffer = normalizeBase64(item.data as string);
    declaredMime = item.mimeType;
  }

  const { format, mimeType } = detectFormat(buffer, declaredMime);
  return {
    kind: format === 'svg' ? 'svg' : 'raster',
    format,
    mimeType,
    buffer,
    width: item.width,
    height: item.height,
    align: item.align,
    caption: item.caption,
  };
}

function mimeFromExtension(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    case 'svg': return 'image/svg+xml';
    default: return undefined;
  }
}

/** Intrinsic pixel dimensions of common image formats, or null when unknown. */
export function intrinsicSize(buffer: Buffer, format: string): { width: number; height: number } | null {
  try {
    if (format === 'png') {
      if (buffer.length < 24) return null;
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (format === 'jpeg') {
      return jpegSize(buffer);
    }
    if (format === 'gif') {
      if (buffer.length < 10) return null;
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (format === 'webp') {
      if (buffer.length < 30) return null;
      return { width: buffer.readUInt32LE(26) & 0x3fffffff, height: buffer.readUInt32LE(30) & 0x3fffffff };
    }
    if (format === 'bmp') {
      if (buffer.length < 26) return null;
      return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
    }
    if (format === 'svg') {
      const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
      return svgSize(head);
    }
  } catch {
    /* fall through */
  }
  return null;
}

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= buffer.length) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const marker = buffer[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const segLen = buffer.readUInt16BE(i + 2);
    if (segLen < 2 || i + segLen + 2 > buffer.length) break;
    // SOF0/1/2 etc. (except DHT/DAC etc.) carry the dimensions right after the marker
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + segLen;
  }
  return null;
}

function svgSize(head: string): { width: number; height: number } | null {
  try {
    const tag = /<svg[^>]*>/i.exec(head);
    if (!tag) return { width: 400, height: 300 };
    const attrs = tag[0];
    const wm = /(?:^|\s)width\s*=\s*"([^"]+)"/i.exec(attrs);
    const hm = /(?:^|\s)height\s*=\s*"([^"]+)"/i.exec(attrs);
    const vb = /(?:^|\s)viewBox\s*=\s*"([^"]+)"/i.exec(attrs);
    const toPx = (v: string): number => {
      const n = parseFloat(v);
      if (/cm$/i.test(v)) return n * 37.795;
      if (/mm$/i.test(v)) return n * 3.7795;
      if (/in$/i.test(v)) return n * 96;
      if (/pt$/i.test(v)) return n * 1.333;
      if (/pc$/i.test(v)) return n * 16;
      return n;
    };
    if (wm && hm) return { width: toPx(wm[1]) || 400, height: toPx(hm[1]) || 300 };
    if (vb) {
      const p = vb[1].split(/[\s,]+/).map(Number);
      if (p.length === 4 && p[2] > 0 && p[3] > 0) return { width: p[2], height: p[3] };
    }
    return { width: 400, height: 300 };
  } catch {
    return { width: 400, height: 300 };
  }
}

/**
 * Compute a concrete render size from the optional width/height constraints
 * plus the image's intrinsic dimensions. Falls back to a 4:3 default.
 */
export function computeSize(
  wanted: { width?: number; height?: number } | undefined,
  intrinsic: { width: number; height: number } | null,
  defaultWidth: number,
): { width: number; height: number } {
  const ratio = intrinsic ? intrinsic.width / intrinsic.height : 4 / 3;
  if (wanted?.width && wanted?.height) return { width: wanted.width, height: wanted.height };
  if (wanted?.width) return { width: wanted.width, height: Math.round(wanted.width / ratio) };
  if (wanted?.height) return { width: Math.round(wanted.height * ratio), height: wanted.height };
  return { width: defaultWidth, height: Math.round(defaultWidth / ratio) };
}

/** Rasterize SVG markup to PNG using @resvg/resvg-js. */
export async function svgToPng(svg: Buffer): Promise<{ png: Buffer; width: number; height: number }> {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg.toString('utf8'), {
    background: 'transparent',
    fitTo: { mode: 'original' },
  });
  const rendered = resvg.render();
  if (!rendered.width || !rendered.height) throw new Error('failed to rasterize SVG image');
  return { png: Buffer.from(rendered.asPng()), width: rendered.width, height: rendered.height };
}
/** Cache key for an image item (its identity by source). */
function imageCacheKey(item: ImageItem): string {
  if (item.url) return 'url:' + item.url;
  if (item.svg !== undefined) return 'svg:' + item.svg.slice(0, 200);
  const d = item.data ?? '';
  return 'data:' + (d.startsWith('data:') ? d.slice(0, 256) : d.slice(0, 256));
}

/**
 * resolveImage wrapped with a per-call cache so a document that is rendered
 * twice (e.g. a PDF whose TOC needs a source pass to know page numbers) only
 * downloads / decodes each image once.
 */
export async function resolveImageCached(
  items: ImageItem[],
): Promise<{ get(item: ImageItem): Promise<ResolvedImage>; clear(): void }> {
  const cache = new Map<string, Promise<ResolvedImage>>();
  const get = (item: ImageItem): Promise<ResolvedImage> => {
    const key = imageCacheKey(item);
    let p = cache.get(key);
    if (!p) {
      p = resolveImage(item);
      cache.set(key, p);
    }
    return p;
  };
  return { get, clear: () => cache.clear() };
}
