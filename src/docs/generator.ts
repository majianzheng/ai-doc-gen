import { z } from 'zod';
import type { DocFormat } from './types.js';

/**
 * A document generator produces a binary buffer (the finished office/PDF file)
 * from validated, plain-JSON input.
 *
 * Generators are registered by format in the registry (`./index.ts`) and are
 * fully isolated from storage / transport concerns, which makes it trivial to
 * add a new format (e.g. `csv`, `md`) later.
 */
export interface Generator<F extends DocFormat = DocFormat> {
  format: F;
  mimeType: string;
  extension: string;
  /** zod schema describing the accepted input for documentation / validation */
  inputSchema?: z.ZodTypeAny;
  generate(input: unknown): Promise<Buffer>;
}
