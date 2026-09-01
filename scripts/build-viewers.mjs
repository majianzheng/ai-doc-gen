/**
 * Build the browser document-viewer bundle used by the admin UI preview pane.
 *
 * Bundles the renderers into a single IIFE (`viewers.bundle.js`):
 *   - docx-preview     -> Word .docx  (HTML rendering)
 *   - xlsx (SheetJS)   -> Excel      (grid + sheet export)
 *   - pdfjs-dist       -> PDF        (canvas pagination)
 *   - pptx-preview     -> PowerPoint (slide rendering)
 *
 * Browser entry: src/admin/preview/entry.js  (exports the viewer API)
 * Output:        src/admin/public/vendor/viewers.bundle.js
 *
 * Run with:  node scripts/build-viewers.mjs
 * (portable across POSIX/Windows — paths are built with join(root, ...))
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url)); // project root
const entry = join(root, 'src', 'admin', 'preview', 'entry.js');
const vendorDir = join(root, 'src', 'admin', 'public', 'vendor');
const outfile = join(vendorDir, 'viewers.bundle.js');

mkdirSync(vendorDir, { recursive: true });

// copy the pdf.js worker next to the bundle (referenced via <meta name="pdf-worker">)
const pdfWorkerSrc = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const pdfWorkerOut = join(vendorDir, 'pdf.worker.min.mjs');
try {
  copyFileSync(pdfWorkerSrc, pdfWorkerOut);
  console.log(`[viewers] copied pdf.js worker -> ${pdfWorkerOut}`);
} catch {
  console.error('[viewers] WARNING: pdfjs-dist worker not found; PDF preview will fall back to main-thread rendering.');
}

build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'AIDocViewers',
  platform: 'browser',
  target: ['es2020'],
  write: true,
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: '/* ai-doc admin preview bundle (docx-preview + xlsx + pdfjs + pptx-preview). Built by scripts/build-viewers.mjs */',
  },
})
  .then(() => {
    // Patch a known pptx-preview bug: its theme parser (PPTXPreviewer) expects
    // <a:lnStyleLst><a:ln> to be an *array*, but pptxgenjs emits a single
    // <a:ln> node, so the parser returns one object -> .map() throws and the
    // whole deck is silently dropped (theme/slide count = 0). Coerce to array.
    const file = readFileSync(outfile, 'utf8');
    const lineRe = /(\["a:theme","a:themeElements","a:fmtScheme","a:lnStyleLst","a:ln"\])\)\|\|\[\];this\.borderScheme=(\w+)\./g;
    let patched = 0;
    const output = file.replace(lineRe, (_m, path, v) => {
      patched += 1;
      return `${path})||[];Array.isArray(${v})||(${v}=[${v}]);this.borderScheme=${v}.`;
    });
    if (!patched) {
      console.error('[viewers] WARNING: pptx-preview line-style patch target not found (bundle may have changed).');
    } else {
      writeFileSync(outfile, output);
      console.log(`[viewers] patched pptx-preview a:ln single-node bug (${patched} occurrence(s))`);
    }
    const kb = Math.round(statSync(outfile).size / 1024);
    console.log(`[viewers] bundled -> ${outfile} (${kb} KB)`);
  })
  .catch((err) => {
    console.error('[viewers] build failed:', err.message ?? String(err));
    if (err.errors?.length) {
      console.error(err.errors.map((e) => `${e.text} @ ${e.location?.file}:${e.location?.line}`).join('\n'));
    }
    process.exit(1);
  });
