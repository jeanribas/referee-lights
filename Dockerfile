# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
# Envs da nuvem (mesmas de server/Dockerfile): sala renova só com voto ou com os 3 árbitros conectados;
# log compacto por requisição com IP em hash.
ENV ROOM_IDLE_POLICY=votes
ENV REQUEST_LOG=compact
WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3333
CMD ["node", "dist/index.js"]
