## Objetivo

Transformar a aplicação (frontend Next.js + backend Fastify) numa experiência "one-click" para Windows, com:

- um único instalador/zip contendo servidor e frontend;
- um executável que inicia ambos os processos (ou um wrapper que empacote o Node + dependências);
- pronta para acesso via rede local (mesmo comportamento atual).

## Questões para definir antes de mexer no código

1. **Distribuição**
   - Vamos gerar um instalador (.exe/.msi) ou apenas um "portable" (.zip)?
   - Precisamos empacotar o Node.js runtime ou assumiremos que o usuário já tem Node?
   - No Windows moderno, antivírus/SmartScreen podem implicar se o binário não for assinado.

2. **Estratégia técnica**
   - Opção A: usar uma ferramenta tipo **pkg** ou **nexe** para gerar binários de backend/frontend.
   - Opção B: usar **Electron** ou **Tauri** como container desktop (webview + Node backend).
   - Opção C: criar scripts batch + Node portable (pasta `node` + `npm i --production`) e entregar com `start.bat`.

3. **Requisitos de runtime**
   - Frontend (Next) precisa estar em modo production (`next build` + `next start`).
   - Backend (Fastify) precisa rodar sob Node 18+.
   - Precisamos que ambos iniciem como serviços/processos filhos do "executável".

## Aproach sugerido (MVP)

### Passo 1: Produção build scripts
  - Adicionar script npm para build `server` (`npm run build`) e `frontend` (`next build`).
  - Adicionar script `npm run start:prod` que inicia backend + frontend (ex.: usando `concurrently`).

### Passo 2: Empacotar com `pkg`
  - `pkg` gera binários Node que incluem código + Node runtime.
  - servidor (Fastify) -> gerar um executável.
  - frontend: usar `next build` e servir com `next start`. `pkg` na pasta `frontend` pode ser mais complexo (Next precisa de `.next`).

  > Alternativa: usar `serve` (por exemplo `npm pkg`)

### Próximos passos concretos

1. Criar script `npm run build:all` que roda build dos dois projetos.
2. Criar script `npm run start:prod` no root que usa `dotenv` + `cross-env`.
3. Investigar empacotamento:
   - Testar `pkg` no backend e ver se funciona com Fastify/Socket.io.
   - Para o frontend, rodar `next build` e usar `next start` via Node (sem pkg) — isso exige Node runtime.

### Perguntas a responder

1. O usuário final pode aceitar instalar um "Node portable"? -> Se sim, basta distribuir Node + nosso código + `start.bat`.
2. Se queremos um único `.exe`: considerar embutir servidor e servir static build (Next export) + UI via bundler.

