# Referee Lights · Server

Backend Fastify + Socket.IO que mantém o estado das salas (luzes IPF, cronômetro, intervalo e legenda).

## Scripts

```bash
npm install
npm run dev        # desenvolvimento (tsx watch)
npm run build      # gera dist/
npm start          # roda dist/index.js
npm run typecheck
npm run lint
npm test           # Vitest
```

## Variáveis de ambiente

Veja `.env.example`. Principais: `PORT` (3333), `CORS_ORIGIN`, `LOG_LEVEL`, `ROOM_TTL_HOURS` (24), `TRUST_PROXY_HOPS` (0), `KEY_RELAY_AVAILABLE` (false). Descrição completa em `../docs/architecture.md`.

## Interfaces

- HTTP: `../docs/openapi.yaml` (salas, Key Relay, `/health`).
- Socket.IO: `../docs/websocket-events.md`. Papéis: `admin`, `display` (PIN da sala) e `left`, `center`, `right` (token do árbitro).

Com os três votos a decisão é revelada, fica 10 s na tela e limpa sozinha. `state:update` é emitido a cada mudança (inclusive a contagem do cronômetro e do intervalo).
