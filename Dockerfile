FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
VOLUME ["/app/storage"]
EXPOSE 9000
CMD ["node", "dist/index.js"]