import { randomUUID } from 'node:crypto';
import type { DocFormat, DocInputs, GeneratedDocument } from './docs/types.js';
import { getGenerator } from './docs/index.js';
import type { Storage } from './storage/storage.js';

/**
 * Orchestrates document generation: validates input, runs the isolated
 * generator to produce a Buffer, uploads it to storage and returns a public
 * download link. Shared by the MCP tools and the REST API / Dify plugin.
 */
export class DocumentService {
  constructor(
    private readonly storage: Storage,
    private readonly options: { basePath?: string } = {},
  ) {}

  async generate<F extends DocFormat>(format: F, rawInput: DocInputs[F]): Promise<GeneratedDocument> {
    const generator = getGenerator(format);
    const buffer = await generator.generate(rawInput);

    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const base = [this.options.basePath, datePath].filter(Boolean).join('/');
    const key = `${base}/${randomUUID().slice(0, 8)}.${generator.extension}`;
    const keyCleaned = key.split('/').filter(Boolean).join('/');

    const stored = await this.storage.put(buffer, {
      key: keyCleaned,
      mimeType: generator.mimeType,
    });

    return {
      format,
      filename: keyCleaned.split('/').pop() as string,
      url: stored.url,
      size: buffer.length,
      mimeType: generator.mimeType,
      storageKey: stored.key,
      createdAt: new Date().toISOString(),
    };
  }
}
