#!/bin/bash
# server-side new-feature verification
set -u
BASE="http://127.0.0.1:9100"
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#2F5496"/><circle cx="60" cy="30" r="20" fill="#E8A33D"/></svg>'
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
SVG_B64=$(printf '%s' "$SVG" | base64 -w0)

# PPTX: svg image + table on one slide, svg on another
PPTX_JSON=$(printf '{"title":"Deck","slides":[{"title":"S1","tables":[{"columns":[{"key":"k","header":"Col"}],"rows":[{"k":"v1"},{"k":"v2"}]}],"images":[{"data":"%s","align":"center","caption":"png"},{"svg":"%s","align":"center","width":200}]},{"bullets":["a","b"],"images":[{"svg":"%s"}]}]}' "$PNG_B64" "$SVG_B64" "$SVG_B64")
[ -f /tmp/t_pptx.json ] && rm -f /tmp/t_pptx.json
printf '%s' "$PPTX_JSON" > /tmp/t_pptx.json
echo "== PPTX =="
curl -s -X POST "$BASE/api/documents/pptx" -H "Content-Type: application/json" --data-binary @/tmp/t_pptx.json | tee /tmp/t_pptx.res
echo

# DOCX: url image (use a file URL? not supported) -> use base64 + svg instead
DOCX_JSON=$(printf '{"title":"T","paragraphs":[{"text":"p"}],"images":[{"data":"%s"},{"svg":"%s","align":"center","caption":"svg"}]}' "$PNG_B64" "$SVG_B64")
[ -f /tmp/t_docx.json ] && rm -f /tmp/t_docx.json
printf '%s' "$DOCX_JSON" > /tmp/t_docx.json
echo "== DOCX =="
curl -s -X POST "$BASE/api/documents/docx" -H "Content-Type: application/json" --data-binary @/tmp/t_docx.json | tee /tmp/t_docx.res
echo

echo "== PPTX unzip check (image + table) =="
if command -v unzip >/dev/null 2>&1; then
  PPTX=$(node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/t_pptx.res','utf8'));console.log(r.url)" 2>/dev/null)
fi
# pull the generated file out of the container to inspect
URL=$(node -e "const r=JSON.parse(require('fs').readFileSync('/tmp/t_pptx.res','utf8'));console.log((r.url||'').replace('$BASE',''))" 2>/dev/null || true)
if [ -n "${URL:-}" ]; then
  docker cp "ai-doc:/app/storage${URL#/files}" /tmp/deck.pptx 2>/dev/null && echo "copied /app/storage${URL#/files}"
  node -e "
    const z=require('/app/node_modules/jszip');
    require('fs').readFile('/tmp/deck.pptx',(e,b)=>{if(e){console.log('ERR',e.message);process.exit(0)}
      z.loadAsync(b).then(z=>{
        const xmls=Object.keys(z.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
        return Promise.all(xmls.map(n=>z.file(n).async('string'))).then(alls=>{
          console.log('slides:',xmls.length);
          alls.forEach((x,i)=>console.log('slide'+i,'pic:',(<any>/<p:pic>/.test(x)),'tbl:',(<any>/<a:tbl>/.test(x))));
          const media=Object.keys(z.files).filter(n=>/^ppt\/media\/.+\.(png|svg)$/.test(n));
          console.log('media:',media);
        });
      }).catch(e=>console.error('ERR2',e.message));
    });
  " 2>/dev/null || echo "jscp inspect: using docker exec"
fi