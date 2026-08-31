#!/bin/bash
set -u
echo "== storage files in container =="
docker exec ai-doc sh -c 'find /app/storage -type f -name "*.pptx" | tail -3'
STORE=$(docker exec ai-doc sh -c 'find /app/storage -type f -name "*.pptx" | tail -1')
echo "last pptx stored: $STORE"
docker exec ai-doc sh -c "xxd -l 16 \"$STORE\"" 2>/dev/null || docker exec ai-doc sh -c "od -A x -t x1z -v -N 16 \"$STORE\""
echo
echo "== fetch via /files over HTTP =="
curl -s -o /tmp/dl.pptx "http://127.0.0.1:9100/files/${STORE#/app/storage/}" -w "http_code=%{http_code} size=%{size_download}\n"
head -c 16 /tmp/dl.pptx | od -A x -t x1z