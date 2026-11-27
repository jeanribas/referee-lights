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
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.example ./
EXPOSE 3333
CMD ["node", "dist/index.js"]
