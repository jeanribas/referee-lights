# Bundle Windows (pacote portátil)

Guia definitivo para gerar, verificar e publicar o pacote Windows.
**Leia inteiro antes de mexer no bundle** — ele roda diferente da web, e a
maioria das quebras históricas veio de esquecer uma dessas diferenças.

## O que é o pacote

Um zip auto-contido que o usuário extrai e roda com dois cliques, sem instalar nada:

```
referee-lights-windows.zip
├── Iniciar.cmd          # inicia server + frontend, abre o navegador
├── Parar.cmd            # encerra os dois processos
├── LEIA-ME.txt          # instruções para o usuário final
├── node/node.exe        # runtime Node.js win-x64 embutido (só o executável)
├── server/
│   ├── dist/index.js    # API inteira num arquivo só (esbuild), sem node_modules
│   ├── dist/better_sqlite3.node  # único binário nativo, win-x64
│   └── .env             # PORT=3333, KEY_RELAY_AVAILABLE=true, BETTER_SQLITE3_BINDING, ...
└── frontend/            # Next.js standalone + .next/static + public
    └── .env.local       # SSR aponta para http://localhost:3333
```

Por que o server é um arquivo só: no Windows o tempo de extração do zip é
dominado pela QUANTIDADE de arquivos (e pela varredura do antivírus em cada
um), não pelos MB. O `node_modules` do server tinha ~3.200 arquivos; hoje o
pacote inteiro tem ~1.900 (quase todos do standalone do Next).

## Como o bundle DIFERE da web (as 6 armadilhas)

Cada item abaixo já quebrou um release. Qualquer mudança no app precisa ser
pensada contra esta lista:

1. **URLs de API/WS são inlinadas no build do client.** O Next compila os
   valores de `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` para dentro dos chunks
   JS. No pacote elas DEVEM ser vazias no momento do build — o
   `frontend/src/lib/config.ts` então usa o fallback de runtime
   `http://<hostname>:3333`, que funciona em `localhost` e no IP da LAN.
   Um `frontend/.env.local` esquecido (ex.: criado pelo `vercel` CLI) já
   apontou o pacote para a API de produção: sala criada lá, socket local,
   luzes mortas. O `build-package.mjs` força as vars vazias e o
   `verify-bundle.mjs` audita os chunks.

2. **Binários nativos precisam ser win-x64, mesmo buildando no macOS.**
   `better-sqlite3` instala binário da plataforma do build. O script baixa o
   `.node` win-x64 da MESMA versão travada no lock com o `prebuild-install`
   do próprio pacote (`--platform win32 --arch x64 --target <NODE_VERSION>`;
   não depende de install scripts, que o npm 11 não roda por padrão) e
   valida que ele é PE (começa com `MZ`). O server carrega esse arquivo pelo
   caminho explícito `BETTER_SQLITE3_BINDING`. Sem isso o server nem sobe no
   Windows — e aí NADA funciona, não só as luzes.

3. **A versão do Node embutido e a ABI dos nativos andam juntas.** O runtime em
   `node/` é baixado pelo script (constante `NODE_VERSION`, hoje 20.18.1). Se
   subir a versão do `better-sqlite3`, confira se ainda existe prebuild win-x64
   para essa ABI antes (o 12.11 já não tem para o Node 20) — e vice-versa. Os
   caches em `dist/.cache/` levam a versão no nome (node.exe e .node), então
   trocar uma versão nunca reaproveita o binário da outra.

4. **Key Relay é opcional e controlado por env.** `KEY_RELAY_AVAILABLE=true` no
   `server/.env` do pacote faz o toggle aparecer no admin. Se sumir do `.env`,
   o usuário perde o recurso silenciosamente. O relay em si é o app separado em
   `tools/key-relay/`, ativado pelo painel — o bundle só precisa anunciar a
   disponibilidade.

5. **O pacote roda offline (LAN sem internet).** Nada no client pode depender de
   rede externa para funcionar: analytics, fonts remotas etc.
   precisam falhar em silêncio ou ficar fora do build do pacote.

6. **A raiz de CADA locale precisa redirecionar para `/admin`.** O pacote não
   tem home: com `BUNDLE_TARGET=windows` o `next.config.js` redireciona `/`,
   `/pt-BR`, `/en-US` e `/es-ES` para `/admin`. A regra `/` (com
   `locale: false`) NÃO cobre `/pt-BR` — o prefixo explícito do locale padrão
   mostrava a home de marketing. Por isso o `verify-bundle.mjs` testa os
   redirects com HTTP de verdade contra o frontend extraído, não lendo o
   `routes-manifest.json`.

### Por que nada é removido "por nome" do pacote

O build antigo apagava em todo `node_modules` qualquer pasta chamada `test`,
`docs`, `example(s)` etc. Economizava ~4 MB e foi a origem de quebras: há
pacotes cujo código de runtime mora numa pasta com esses nomes. Hoje:

- **server**: não há `node_modules` — o esbuild embute só o que é importado
  (`geoip-lite` vira stub por alias; o binário do SQLite é carregado por
  caminho explícito). Removeu ~3.200 arquivos sem apagar nada às cegas.
- **frontend**: vai o `standalone` do Next como ele sai — a lista de
  dependências é decidida pelo trace (`.nft.json`) do próprio Next.
- **node/**: só o `node.exe` (npm, npx, corepack e docs do zip oficial não
  são usados pelo `Iniciar.cmd`). Não use UPX ou outro compressor de
  executável: antivírus marcam o binário.

Qualquer remoção nova precisa de prova (trace ou checagem de import) E passar
na execução completa do pacote extraído (ver "Verificação automática").

## Processo de release do bundle (humano ou IA — siga na ordem)

O bundle é publicado a partir da branch **`release/1.3`** (linha estável), NÃO
do `main` (a `release/1.2` fica só como histórico). O `build-package.mjs`
aborta fora de uma branch `release/*`. `main` é a linha da web; só promova mudanças do `main` para a
`release/*` depois de testadas.

**REGRA DE OURO DO VERSIONAMENTO: número de versão só para release 100%
funcional, aprovada em teste manual no Windows.** Builds de teste NUNCA sobem
versão — vão todos para o MESMO pre-release rolante `teste`. A versão do
bundle acompanha a evolução do projeto (web), não uma linha própria.

```bash
# --- Iterando (quantas vezes precisar, SEM subir versão) ---
# 1. Faça a mudança na branch release/*.
# 2. Build + verificação automática local (roda verify-bundle.mjs no final,
#    incluindo a execução completa do pacote extraído):
node tools/windows/build-package.mjs
# 3. Commit + push (sem tag de versão) — dispara o CI (ver abaixo):
git add -A && git commit -m "fix(bundle): ..." && git push origin release/1.3
# 4. Pre-release rolante de teste (o MESMO, sempre), a partir do zip que o
#    CI buildou E testou no Windows:
gh workflow run windows-bundle.yml --ref release/1.3 -f publish_teste=true

# --- TESTE MANUAL NO WINDOWS (obrigatório) ---
#    - Extrair o zip, Iniciar.cmd (deve abrir direto no /admin)
#    - Criar sessão, conectar 3 árbitros (QR, mesma rede)
#    - Dar decisões → AS LUZES ACENDEM no display
#    - Ativar Key Relay e testar
#    - Parar.cmd encerra tudo

# --- Aprovou 100%? SÓ ENTÃO a versão existe ---
# 5. Confirme que package.json (server e frontend) está na versão do
#    projeto (a mesma linha do web). Se precisar ajustar, ajuste, rebuilde
#    e rode o teste de novo — a release é sempre do zip testado.
# 6. Tag + release estável + promover:
#    (baixe o zip do pre-release `teste` — o mesmo que foi testado)
git tag vX.Y && git push origin vX.Y
gh release create vX.Y referee-lights-windows.zip \
  --target release/1.3 --title "vX.Y" --notes "..." --latest
# 7. Apague o pre-release teste:
gh release delete teste --yes --cleanup-tag
```

### Regras de versionamento

- **Número de versão = compromisso.** Só existe depois do teste manual
  aprovar 100%. Antes disso, tudo é o pre-release rolante `teste`.
- **A versão do bundle segue a do projeto (web)** — não existe numeração
  paralela. Ex.: projeto na 1.3 → próxima release do bundle é v1.3.
- A release **Latest** no GitHub é a que os usuários baixam pelo site.
  Latest = sempre a última 100% funcional.

## Verificação automática

`tools/windows/verify-bundle.mjs` roda no fim do build (ou avulso) e trabalha
sobre o **zip**, extraído numa pasta com espaço e acento (como o usuário faz).
Reprova o bundle se:

- faltar qualquer peça (node.exe, `server/dist/index.js`, o `.node`, standalone
  do Next, `.cmd`) ou existir `server/node_modules` (build antigo);
- algum binário `.node` ou o `node.exe` não for PE/Windows;
- os chunks do client contiverem URL de produção inlinada;
- `server/.env` estiver sem `PORT=3333`, `KEY_RELAY_AVAILABLE=true` ou
  `BETTER_SQLITE3_BINDING`;
- `/`, `/pt-BR`, `/en-US` ou `/es-ES` não redirecionarem para `/admin` (HTTP
  real contra o frontend extraído);
- a **execução do pacote extraído** falhar (`tools/windows/ci/run-bundle-e2e.mjs`):
  todas as telas no Chromium (admin, display, legenda, timer e os 3 árbitros)
  sem erro de JS nem arquivo 4xx/5xx; fluxo completo de votos, cartões e
  revelação; timer, intervalo, troca de idioma e configuração da legenda;
  Key Relay (PIN, lista branca de teclas, status); payload malformado; sala
  recuperada após restart (SQLite); limites contra abuso; e os logs do server
  e do frontend sem `Cannot find module`, `ENOENT`, `MODULE_NOT_FOUND`.

Fora do Windows o `better_sqlite3.node` win-x64 é trocado pelo da plataforma
atual **só na cópia de teste** (o zip não muda). `--no-runtime` pula a
execução; `--skip-ui` pula o Chromium (`npx playwright install chromium` no
`frontend/` instala o navegador).

Ele NÃO substitui o teste manual das luzes no Windows — só elimina as quebras
que já sabemos reproduzir.

## CI (GitHub Actions)

`.github/workflows/windows-bundle.yml` roda em push/PR de `release/**`:

1. **checks** (ubuntu): typecheck e lint do server e do frontend.
2. **build** (windows-latest, Node do pacote): `build-package.mjs` com
   `npm ci`; falha se algum `package-lock.json` mudar. Artefato fica 14 dias.
3. **test** (windows-latest, máquina limpa): `verify-bundle.mjs` completo com
   o `node.exe` embutido; extração via `Expand-Archive` com Mark of the Web;
   `dlopen` do `.node` no `node.exe`; subida pelo `Iniciar.cmd` (headless);
   smoke e2e e payload malformado; UI pelo IP da LAN; restart via
   `Parar.cmd`/`Iniciar.cmd` com a sala recuperada; `Parar.cmd` libera as
   portas 3000/3333.
4. **publish-teste**: só em execução manual com `publish_teste=true`, depois
   do teste passar — atualiza o pre-release rolante `teste`. Nunca cria versão.

## Solução de problemas

| Sintoma no Windows | Causa provável | Onde olhar |
| --- | --- | --- |
| Janela do server fecha na hora | binário nativo não-Windows ou ABI errada | `verify-bundle.mjs`; armadilhas 2 e 3 |
| Salas não voltam após reiniciar | `BETTER_SQLITE3_BINDING` errado: o SQLite não abre | log do server; `server/.env` |
| `/pt-BR` mostra a página inicial | redirect da raiz do locale | armadilha 6 |
| Site abre, mas "sala não encontrada" / luzes mortas | URL de produção inlinada no client | armadilha 1; grep nos chunks |
| Luzes não acendem só na LAN (funciona em localhost) | fallback de runtime ausente no `config.ts` | armadilha 1 |
| Toggle do Key Relay sumiu do admin | `KEY_RELAY_AVAILABLE` fora do `.env` | armadilha 4 |
| Página branca / erro SSR no frontend | dependência externa no build (analytics etc.) | armadilha 5 |
