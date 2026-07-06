# NOTE: glibc (Debian slim), not Alpine/musl. The @temporalio/core-bridge
# native addon is built against glibc and fails to load on musl with
# "Error relocating ... __register_atfork: symbol not found".
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/worker.js"]
