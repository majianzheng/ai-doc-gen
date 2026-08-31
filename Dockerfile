FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
VOLUME ["/app/storage", "/app/templates"]
EXPOSE 9000 9800
CMD ["node", "dist/index.js"]