import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src', 'admin', 'public');
const dest = join(root, 'dist', 'admin', 'public');
const assetSrc = join(root, 'src', 'assets');
const assetDest = join(root, 'dist', 'assets');

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy] ${src} -> ${dest}`);

// copy bundled style-template assets (e.g. default-presentation.pptx) so they
// sit next to the compiled code at runtime
try {
  await cp(assetSrc, assetDest, { recursive: true });
  console.log(`[copy] ${assetSrc} -> ${assetDest}`);
} catch {
  /* no src/assets directory - nothing to copy */
}
