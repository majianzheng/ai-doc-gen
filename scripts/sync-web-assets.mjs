import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcPublic = join(root, 'src', 'admin', 'public');
const webPublic = join(root, 'web', 'public');
const assetSrc = join(root, 'src', 'assets');
const assetDest = join(root, 'dist', 'assets');

// Sync the static assets the Vue app references (viewers bundle, pdf worker,
// favicon) into the Vite public dir so the build copies them to dist.
await mkdir(webPublic, { recursive: true });
await cp(join(srcPublic, 'vendor'), join(webPublic, 'vendor'), { recursive: true });
await cp(join(srcPublic, 'favicon.svg'), join(webPublic, 'favicon.svg'), { recursive: true });
console.log(`[web] synced admin public assets -> ${webPublic}`);

// Copy runtime style-template assets (fonts / default-presentation.pptx) next
// to the compiled server code.
try {
  await cp(assetSrc, assetDest, { recursive: true });
  console.log(`[copy] ${assetSrc} -> ${assetDest}`);
} catch {
  /* no src/assets directory */
}
