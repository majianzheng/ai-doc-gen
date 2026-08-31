#!/bin/bash
set -u
docker exec -i ai-doc node - <<'EOF'
const z = require('/app/node_modules/jszip');
const base = 'http://localhost:9000/api/documents';
(async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#2F5496"/><circle cx="60" cy="30" r="20" fill="#E8A33D"/></svg>';
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const post = (fmt, body) => fetch(base + '/' + fmt, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const pptx = await post('pptx', { title: 'Deck', slides: [
    { title: 'S1', tables: [ { columns: [{ key: 'k', header: 'Col' }], rows: [{ k: 'v1' }, { k: 'v2' }] } ], images: [ { data: png, align: 'center', caption: 'png' }, { svg, align: 'center', width: 200 } ] },
    { bullets: ['a', 'b'], images: [ { svg, align: 'center' } ] },
  ] });
  console.log('pptx:', JSON.stringify(pptx));
  const docx = await post('docx', { title: 'T', paragraphs: [{ text: 'p' }], images: [ { data: png, width: 60 }, { svg, align: 'center', caption: 'svg' } ] });
  console.log('docx:', JSON.stringify(docx));
  const xlsx = await post('xlsx', { sheets: [ { name: 'S', rows: [{ a: 1 }], images: [ { svg }, { data: png } ] } ] });
  console.log('xlsx:', JSON.stringify(xlsx));
  if (pptx && !pptx.error) {
    const path = pptx.url.replace(/^https?:\/\/[^/]+/, '');
    const buf = Buffer.from(await (await fetch('http://localhost:9000' + path)).arrayBuffer());
    const zip = await z.loadAsync(buf);
    const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const lines = [];
    for (const n of slideNames) {
      const x = await zip.file(n).async('string');
      lines.push('slide' + n.match(/slide(\d+)/)[1] + ':pic=' + /<p:pic>/.test(x) + ' table=' + /<a:tbl>/.test(x));
    }
    console.log('pptx structure:', lines.join(' | '));
    console.log('pptx media:', Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.(png|svg)$/.test(n)));
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
EOF