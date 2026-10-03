# Referee Lights — Guia do Repositório

Sistema de luzes de arbitragem IPF: frontend Next.js (`frontend/`), server
Fastify + socket.io (`server/`), bundle Windows portátil (`tools/windows/`)
e Key Relay opcional (`tools/key-relay/`).

## Linhas de desenvolvimento (importante!)

- **`main`** — linha da WEB (site + API). Deploy: frontend na Vercel, server
  via Docker/Easypanel. Push de branch dispara preview deploy na Vercel.
- **`release/1.3`** — linha ESTÁVEL do bundle Windows. O zip publicado nas
  releases sai SEMPRE daqui, nunca do `main` (`release/1.2` fica só como
  histórico; o build aborta fora de `release/*`). Correções para o bundle:
  cherry-pick do `main` para cá, só depois de testadas.

## Bundle Windows — leia antes de tocar

**`docs/windows-package.md` é leitura obrigatória** antes de qualquer mudança
que afete o bundle. Resumo do processo:

```bash
node tools/windows/build-package.mjs   # builda, monta o zip e VERIFICA
```

A verificação (`tools/windows/verify-bundle.mjs`) extrai o zip numa pasta
com espaço e acento e reprova binário nativo não-Windows, URL de produção
inlinada no client, estrutura incompleta, .env errado, raiz de locale sem
redirect para /admin e qualquer falha ao EXECUTAR o pacote (todas as telas e
o fluxo completo). O CI (`.github/workflows/windows-bundle.yml`) builda e
testa no Windows a cada push em `release/**`. Publicação: builds de teste vão
SEMPRE para o pre-release rolante `teste` (sem subir versão!), via
`gh workflow run windows-bundle.yml --ref release/1.3 -f publish_teste=true` → teste manual no Windows (criar sessão, 3
árbitros, luzes acendem, Key Relay) → aprovado 100%, aí sim tag de versão
(seguindo a versão do projeto/web) e release Latest. Número de versão só
para release 100% funcional.

## Armadilhas conhecidas

- `NEXT_PUBLIC_*` é inlinado no build do frontend — no bundle as URLs de
  API/WS devem ser VAZIAS (fallback de runtime `http://<host>:3333` em
  `frontend/src/lib/config.ts`). Um `.env.local` esquecido quebra o pacote.
- Buildando o bundle do macOS, o binário do better-sqlite3 precisa ser o
  win-x64 da ABI do Node embutido — o script baixa com `prebuild-install` e
  o server o carrega por `BETTER_SQLITE3_BINDING` (server = 1 arquivo esbuild,
  sem node_modules).
- Nunca remover arquivos do pacote por nome de pasta (test/docs/example...):
  já quebrou releases. Ver `docs/windows-package.md`.
- `KEY_RELAY_AVAILABLE=true` no `.env` do server é o que exibe o toggle do
  Key Relay no admin.

## Documentação

- `docs/windows-package.md` — bundle: build, verificação, release, armadilhas
- `docs/architecture.md` — salas, papéis, fluxo de decisão
- `docs/websocket-events.md` — contrato dos eventos socket.io
- `docs/easypanel-vercel-deploy.md` — deploy web
- `docs/operations-guide.md` — operação
