# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
# Sala só renova com voto ou com os 3 árbitros conectados (nuvem/Dokploy).
ENV ROOM_IDLE_POLICY=votes
# Uma linha compacta por requisição, com IP em hash (o proxy esconde o IP real no log padrão).
ENV REQUEST_LOG=compact
# Rastreio público (/track/page, /track/click) só aceita a origem do site.
ENV TRACK_ALLOWED_ORIGINS=https://refereelights.app
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.example ./
EXPOSE 3333
CMD ["node", "dist/index.js"]
