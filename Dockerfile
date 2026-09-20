FROM node:20
WORKDIR /app
# Install only production dependencies — the frontend & server code are
# pre-compiled locally (see scripts/sync-web-assets.mjs + tsc + vite) and
# uploaded as `dist`, so the image never needs dev dependencies or runs a build.
COPY package*.json ./
RUN npm install --omit=dev
COPY dist ./dist
VOLUME ["/app/storage", "/app/templates"]
EXPOSE 9000 9800
CMD ["node", "dist/index.js"]
