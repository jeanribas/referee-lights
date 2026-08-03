# Referee Lights — Guia do Repositório

Sistema de luzes de arbitragem IPF: frontend Next.js (`frontend/`), server
Fastify + socket.io (`server/`), bundle Windows portátil (`tools/windows/`)
e Key Relay opcional (`tools/key-relay/`).

## Linhas de desenvolvimento (importante!)

- **`main`** — linha da WEB (site + API). Deploy: frontend na Vercel, server
  via Docker/Easypanel. Push de branch dispara preview deploy na Vercel.
- **`release/1.2`** — linha ESTÁVEL do bundle Windows. O zip publicado nas
  releases sai SEMPRE daqui, nunca do `main`. Correções para o bundle:
  cherry-pick do `main` para cá, só depois de testadas.

## Bundle Windows — leia antes de tocar

**`docs/windows-package.md` é leitura obrigatória** antes de qualquer mudança
que afete o bundle. Resumo do processo:

```bash
node tools/windows/build-package.mjs   # builda, monta o zip e VERIFICA
```

A verificação (`tools/windows/verify-bundle.mjs`) reprova binário nativo
não-Windows, URL de produção inlinada no client, estrutura incompleta e .env
errado. Publicação: sempre `gh release create --prerelease` → teste manual no
Windows (criar sessão, 3 árbitros, luzes acendem, Key Relay) → só então
promover a Latest. Nunca publicar mais de uma versão sem testar a anterior.

## Armadilhas conhecidas

- `NEXT_PUBLIC_*` é inlinado no build do frontend — no bundle as URLs de
  API/WS devem ser VAZIAS (fallback de runtime `http://<host>:3333` em
  `frontend/src/lib/config.ts`). Um `.env.local` esquecido quebra o pacote.
- Buildando o bundle do macOS, os binários nativos precisam ser forçados para
  win-x64 (`npm_config_platform/arch/target`) — o script já faz.
- `KEY_RELAY_AVAILABLE=true` no `.env` do server é o que exibe o toggle do
  Key Relay no admin.

## Documentação

- `docs/windows-package.md` — bundle: build, verificação, release, armadilhas
- `docs/architecture.md` — salas, papéis, fluxo de decisão
- `docs/websocket-events.md` — contrato dos eventos socket.io
- `docs/easypanel-vercel-deploy.md` — deploy web
- `docs/operations-guide.md` — operação
