# Arquitetura

## Visão geral

- **Server** (`server/`): Fastify 5 + Socket.IO, TypeScript, Node 20+. Endpoints REST para criar/recuperar salas (`docs/openapi.yaml`) e Socket.IO para o tempo real (`docs/websocket-events.md`). Estado das salas em memória, com cópia em SQLite (`data/`) para recuperar salas após reinício.
- **Frontend** (`frontend/`): Next.js (Pages Router) + TypeScript + Tailwind. Telas `/admin`, `/display`, `/legend`, `/timer`, `/ref/:judge`, além das páginas públicas.
- **Pacote Windows** (`tools/windows/`): servidor + frontend standalone num zip para uso offline em LAN.

```
Árbitros / Admin / Display / Legenda / Timer ──Socket.IO──▶ Server
Admin ──HTTP (criar/recuperar sala, Key Relay)──▶ Server
```

## Sala

- Código de 4 letras e PIN admin de 4 dígitos, gerados com `crypto`.
- Um token por árbitro (`left`, `center`, `right`), entregue por QR Code; pode ser rotacionado pelo admin (`/rooms/:roomId/refresh-ref-tokens`).
- Estado (`AppState`): fase `idle`/`revealed`, votos e cartões por árbitro, cronômetro (padrão 60 s), intervalo, idioma e configuração da legenda.
- Com os três votos a decisão é revelada; o resultado fica na tela por 10 s e limpa sozinho.
- Sala sem atividade por `ROOM_TTL_HOURS` (padrão 24 h) é arquivada e o código volta ao pool. Salas com atividade dentro desse prazo são restauradas após reinício com o mesmo código, PIN e tokens.

## Papéis e autenticação

| Papel | Credencial | Pode |
| --- | --- | --- |
| `admin`, `display` | PIN da sala | Controlar decisão, cronômetro, intervalo, idioma e legenda |
| `left`, `right` | token do árbitro | Votar e marcar cartões |
| `center` | token do árbitro | Votar, cartões e cronômetro |

## Limites

- Falhas de PIN/token: 30 por IP em 10 min; depois `too_many_attempts` (HTTP 429 ou ACK).
- Criação de sala: 30 por IP em 10 min (loopback isento).
- Socket.IO: 40 eventos/s por conexão (acima disso `rate_limited`; acima de 200/s a conexão é derrubada); payload máximo de 16 KB.
- `TRUST_PROXY_HOPS` define quantos proxies são confiáveis para ler o IP do cliente (`X-Forwarded-For`); com 0 o cabeçalho é ignorado.

## Key Relay

Embutido no servidor (`server/src/key-relay.ts`). Ativado pelo admin com o PIN da sala; ao revelar a decisão envia a tecla configurada para a janela em foco na máquina do servidor (Windows: SendKeys; macOS: System Events; Linux: `xdotool`). Teclas aceitas por lista branca (F1–F12 ou uma letra/dígito com até 3 modificadores). Só existe com `KEY_RELAY_AVAILABLE=true`.

## Variáveis de ambiente (server)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3333` | Porta HTTP/Socket.IO |
| `CORS_ORIGIN` | `*` | Origens permitidas, separadas por vírgula |
| `LOG_LEVEL` | `info` | Nível de log do Fastify |
| `ROOM_TTL_HOURS` | `24` | Horas sem atividade até arquivar a sala |
| `TRUST_PROXY_HOPS` | `0` | Proxies reversos confiáveis |
| `KEY_RELAY_AVAILABLE` | `false` | Habilita o Key Relay |

Frontend: `NEXT_PUBLIC_WS_URL` e `NEXT_PUBLIC_API_URL` (URL do servidor).

## Deploy

- **Server**: `server/Dockerfile` (`node:20-alpine`) ou `npm run build && npm start`. Monte um volume em `/app/data` para manter as salas entre reinícios.
- **Frontend**: Vercel ou qualquer host Next.js.

## Testes

- Vitest no server (`server/tests/`): rotas HTTP, permissões por papel no websocket, payloads inválidos e limites.
- Playwright em `frontend/tests/e2e/`: páginas públicas nos 3 idiomas, fluxo de competição, timers, legenda, falhas de acesso, reconexão e celular.
- `tools/test-all.sh` roda tudo localmente (typecheck, lint, Vitest, build, sobe API e frontend nas portas 4333/4300 e roda o Playwright). Precisa do Chromium do Playwright (`npx playwright install chromium` em `frontend/`). Variáveis: `API_PORT`, `WEB_PORT`, `SKIP_BUILD=1`.
