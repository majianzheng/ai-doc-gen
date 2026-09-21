import type { Generator, GenerateContext } from './generator.js';
import type { TextInput } from './types.js';

/**
 * Plain-text document generator (txt / html / xml / json / source code ...).
 *
 * 纯文本：不经过任何 Markdown/排版解析——给定什么内容就存什么。`filename`
 * 的扩展名决定下载文件名与 Content-Type（见 core.ts 的 textMimeType）。
 * 支持可选的 `encoding`（默认 utf-8）与 `lineEnding`（默认 LF）。
 */

export const TEXT_ENCODINGS = ['utf-8', 'utf8', 'ascii', 'latin1', 'ucs2', 'utf-16le', 'utf16le', 'base64', 'hex'] as const;

/** Normalize a caller-supplied encoding to a Node BufferEncoding + BOM flag. */
export function normalizeEncoding(encoding: string | undefined): { encoding: BufferEncoding; bom: boolean } {
  const raw = (encoding ?? 'utf-8').toLowerCase().replace(/_/g, '-');
  const bom = /^(utf-8|utf8)-bom$/.test(raw);
  const e = bom ? raw.replace(/-bom$/, '') : raw;
  let enc: BufferEncoding;
  switch (e) {
    case 'utf-8':
    case 'utf8': enc = 'utf8'; break;
    case 'ascii': enc = 'ascii'; break;
    case 'latin1': enc = 'latin1'; break;
    case 'utf-16le':
    case 'utf16le': enc = 'utf16le'; break;
    case 'ucs2': enc = 'ucs2'; break;
    case 'base64': enc = 'base64'; break;
    case 'hex': enc = 'hex'; break;
    default: enc = 'utf8';
  }
  return { encoding: enc, bom };
}

/** Convert content to the requested line ending (default LF). */
export function normalizeLineEndings(content: string, lineEnding: string | undefined): string {
  const crlf = (lineEnding ?? 'lf').toLowerCase() === 'crlf';
  if (crlf) return content.replace(/\r\n|\r/g, '\n').replace(/\n/g, '\r\n');
  return content.replace(/\r\n|\r/g, '\n');
}

export const textGenerator: Generator<'text'> = {
  format: 'text',
  mimeType: 'text/plain',
  extension: 'txt',
  async generate(input: unknown, _ctx?: GenerateContext): Promise<Buffer> {
    const t = (input ?? {}) as TextInput;
    const text = normalizeLineEndings(String(t.content ?? ''), t.lineEnding);
    const { encoding: enc, bom } = normalizeEncoding(t.encoding);
    const body = Buffer.from(text, enc);
    return bom ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), body]) : body;
  },
};
