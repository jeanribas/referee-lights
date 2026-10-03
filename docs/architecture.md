# Luzes Árbitros – Arquitetura MVP

## Visão Geral

O sistema é dividido em dois projetos independentes:

- **Server** (`server/`): Fastify + Socket.IO sobre Node.js 20 com TypeScript estrito. Expõe endpoints REST para setup de salas e canal WebSocket para sincronização em tempo real. Estado mantido in-memory com contrato preparado para Redis em versões futuras.
- **Frontend** (`frontend/`): Next.js 14 (modo `app` desabilitado) + TypeScript. Consome o WebSocket do servidor, renderiza display, consoles de árbitros e dashboard/admin. Deploy alvo na Vercel.

Comunicação em tempo real segue o diagrama:

```
Árbitros / Admin / Display --(Socket.IO)-- Server --(Webhook future)--> integrações
```

## Domínio e Estados

Cada **Room** representa uma plataforma de competição e possui:

- `id`: código curto (ex.: `PLAT1`)
- `pin`: PIN admin numérico
- `config`: toggles do display (`showTimer`, `showLogo`, `showQRCodes`, `fullscreenHint`)
- `decision`: estado do ciclo (`IDLE`, `READY`, `ARMED`, `DECISION_RELEASED`, `LATCHED`) e votos por lado
- `timer`: cronômetro regressivo em ms, com marcações de `running`, `remainingMs`
- `tokens`: JWT efêmeros para papéis (left, center, right, display, admin, jury)
- `members`: usuários conectados por `socketId`, papel e última atividade

Estados de decisão seguem:

```
IDLE -> READY -> (ARMED opcional) -> DECISION_RELEASED -> LATCHED -> IDLE
```

Luzes são exibidas simultaneamente apenas após `DECISION_RELEASED`. Cartões IPF (1,2,3) ficam disponíveis após voto `red`.

Resultado final calcula maioria simples de votos `white`. `jury:override` pode alterar posteriormente.

## Segurança

- Tokens JWT (`JWT_SECRET`, expiração 15 min) entregues via QR Codes para cada árbitro.
- Admin autentica com `roomId` + PIN; ações sensíveis (release, override) validam papel + PIN.
- Rate limiting de chamadas REST e throttling de eventos WebSocket por socket.
- Sanitização de inputs com esquemas Zod.

## Observabilidade

- Logger estruturado (pino) com `roomId` incluído nas mensagens.
- Métricas simplificadas (`prom-client`) acessíveis em `GET /metrics` (apenas contadores básicos: conexões, decisões, tempo de decisão médio).

## Deploy

- **Server**: Dockerfile multi-stage (`node:20-alpine`), start via `node dist/index.js`. Variáveis `.env` obrigatórias: `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `RATE_LIMIT`, `LOG_LEVEL`.
- **Frontend**: Deploy na Vercel com `NEXT_PUBLIC_WS_URL` e `NEXT_PUBLIC_BRAND_LOGO_URL`. Build otimizada com `next build`.

## Webhooks

Infra preparada para `decision.finalized` (POST JSON) configurável por room. Chamada assíncrona com retry exponencial posteriormente (fora do MVP).

## Testing

- API e domínio cobertos por testes Vitest no server (`server/tests/`): rotas HTTP, matriz de permissões do websocket por papel e payloads malformados.
- E2E (Playwright) em `frontend/tests/e2e/`, separado por área: páginas públicas nos 3 idiomas, fluxo completo de competição, timers/intervalo, idioma da sala, legenda, falhas de acesso, admin, reconexão, salas isoladas e celular.
- Bateria completa local: `tools/test-all.sh` (typecheck, lint, Vitest, build, sobe API + frontend em portas próprias — 4333/4300 — e roda o Playwright; derruba tudo no fim). Precisa do Chromium do Playwright (`npx playwright install chromium` em `frontend/`). Variáveis: `API_PORT`, `WEB_PORT`, `SKIP_BUILD=1`; argumentos extras vão para o Playwright.
- ESLint + Prettier + Husky para consistência.

## Roadmap Futuro

1. Persistência em Redis/Postgres com replicação e histórico de tentativas.
2. Multi-plataforma (rooms paralelos), auditoria, export, i18n.
3. Integração com sistemas externos via webhooks e API autenticada.

