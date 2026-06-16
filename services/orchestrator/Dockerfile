FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/worker.js"]
