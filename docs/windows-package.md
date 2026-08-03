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
├── node/                # runtime Node.js win-x64 embutido (node.exe)
├── server/              # Fastify buildado + node_modules de produção WIN-X64
│   └── .env             # PORT=3333, KEY_RELAY_AVAILABLE=true, ...
└── frontend/            # Next.js standalone + .next/static + public
    └── .env.local       # SSR aponta para http://localhost:3333
```

## Como o bundle DIFERE da web (as 5 armadilhas)

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
   `better-sqlite3` instala binário da plataforma do build. O script força
   `npm_config_platform=win32 / arch=x64 / target=<versão do Node do bundle>`
   e valida que o `.node` resultante é PE (começa com `MZ`). Sem isso o server
   nem sobe no Windows — e aí NADA funciona, não só as luzes.

3. **A versão do Node embutido e a ABI dos nativos andam juntas.** O runtime em
   `node/` é baixado pelo script (constante `NODE_VERSION`). Se subir a versão
   do `better-sqlite3`, confira a ABI exigida antes de mexer no `NODE_VERSION`
   (e vice-versa). Cache antigo de `node/` com ABI diferente = crash na
   inicialização.

4. **Key Relay é opcional e controlado por env.** `KEY_RELAY_AVAILABLE=true` no
   `server/.env` do pacote faz o toggle aparecer no admin. Se sumir do `.env`,
   o usuário perde o recurso silenciosamente. O relay em si é o app separado em
   `tools/key-relay/`, ativado pelo painel — o bundle só precisa anunciar a
   disponibilidade.

5. **O pacote roda offline (LAN sem internet).** Nada no client pode depender de
   rede externa para funcionar: analytics, fonts remotas etc.
   precisam falhar em silêncio ou ficar fora do build do pacote.

## Processo de release do bundle (humano ou IA — siga na ordem)

O bundle é publicado a partir da branch **`release/1.2`** (linha estável), NÃO
do `main`. `main` é a linha da web; só promova mudanças do `main` para a
`release/*` depois de testadas.

**REGRA DE OURO DO VERSIONAMENTO: número de versão só para release 100%
funcional, aprovada em teste manual no Windows.** Builds de teste NUNCA sobem
versão — vão todos para o MESMO pre-release rolante `teste`. A versão do
bundle acompanha a evolução do projeto (web), não uma linha própria.

```bash
# --- Iterando (quantas vezes precisar, SEM subir versão) ---
# 1. Faça a mudança na branch release/*.
# 2. Build + verificação automática (roda verify-bundle.mjs no final):
node tools/windows/build-package.mjs
# 3. Commit + push (sem tag de versão):
git add -A && git commit -m "fix(bundle): ..." && git push origin release/1.2
# 4. Atualize o pre-release rolante de teste (o MESMO, sempre):
gh release delete teste --yes --cleanup-tag 2>/dev/null
gh release create teste dist/referee-lights-windows.zip \
  --prerelease --target release/1.2 --title "Build de teste" \
  --notes "Build para validação interna. Não usar em competição."

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
git tag vX.Y && git push origin vX.Y
gh release create vX.Y dist/referee-lights-windows.zip \
  --target release/1.2 --title "vX.Y" --notes "..." --latest
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

`tools/windows/verify-bundle.mjs` roda no fim do build (ou avulso) e reprova o
bundle se:

- faltar qualquer peça (node.exe, server/dist, standalone do Next, .cmd);
- algum binário `.node` não for PE/Windows;
- os chunks do client contiverem URL de produção inlinada;
- `server/.env` estiver sem `PORT=3333` ou `KEY_RELAY_AVAILABLE=true`;
- o zip fugir do tamanho esperado (~35–60 MB).

Ele NÃO substitui o teste manual das luzes no Windows — só elimina as quebras
que já sabemos reproduzir.

## Solução de problemas

| Sintoma no Windows | Causa provável | Onde olhar |
| --- | --- | --- |
| Janela do server fecha na hora | binário nativo não-Windows ou ABI errada | `verify-bundle.mjs`; armadilhas 2 e 3 |
| Site abre, mas "sala não encontrada" / luzes mortas | URL de produção inlinada no client | armadilha 1; grep nos chunks |
| Luzes não acendem só na LAN (funciona em localhost) | fallback de runtime ausente no `config.ts` | armadilha 1 |
| Toggle do Key Relay sumiu do admin | `KEY_RELAY_AVAILABLE` fora do `.env` | armadilha 4 |
| Página branca / erro SSR no frontend | dependência externa no build (analytics etc.) | armadilha 5 |
