# Deploy: EasyPanel (API) + Vercel (Frontend)

## 1) Arquivo pronto para EasyPanel

Use o pacote gerado na raiz do projeto:

- `server-easypanel.zip`

Se precisar regenerar:

```bash
tools/easypanel/build-server-zip.sh
```

## 2) EasyPanel (API Node/Socket.IO)

### Opção A: subir o ZIP

1. Crie um novo app no EasyPanel.
2. Faça upload de `server-easypanel.zip`.
3. Configure build/start:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Port: `3333`
   - (Opcional) Env de build: `NPM_CONFIG_PRODUCTION=false` caso queira compilar TypeScript no próprio EasyPanel

### Opção B: GitHub + Dockerfile (recomendado)

O repositório já contém um `Dockerfile` na raiz focado no `server`.

No EasyPanel:

1. Fonte: **Dockerfile**
2. Repositório: `jeanribas/referee-lights`
3. Branch: `main`
4. Build path/context: `/`
5. Dockerfile path: `Dockerfile`
6. Porta: `3333`

Importante:

- confirme no log que está usando `docker build` (não `pack build`).
- se aparecer `pack build`, a fonte não está em modo Dockerfile.

### Variáveis de ambiente (produção)

Base: `server/.env.production.example`

Obrigatórias:

- `PORT=3333`
- `CORS_ORIGIN=https://seu-frontend.vercel.app`
- `LOG_LEVEL=info`
- `TRUST_PROXY_HOPS=1` quando a API fica atrás de UM reverse proxy (Traefik do
  Easypanel/Dokploy). É o número de proxies seus na frente da API: o IP do
  cliente passa a ser o valor mais à direita do `X-Forwarded-For` (o que o
  proxy escreveu), e os limites de tentativas deixam de ser burláveis com
  header forjado. Padrão `0` = sem proxy (rede local): o header é ignorado.
  Sem essa variável atrás de proxy, todos os clientes aparecem com o IP do
  proxy e dividem os mesmos limites.

Depois do deploy, valide:

- `GET https://api.seu-dominio.com/health` deve retornar `{"status":"ok"}`

## 3) Vercel (Frontend Next.js)

Base: `frontend/.env.production.example`

Configure no projeto Vercel:

- `NEXT_PUBLIC_WS_URL=https://api.seu-dominio.com`
- `NEXT_PUBLIC_API_URL=https://api.seu-dominio.com`
- `NEXT_PUBLIC_QR_ORIGIN=seu-dominio.com` (opcional)

Build/Output padrão:

- Framework: `Next.js`
- Build command: `next build` (padrão)
- Install command: `npm install` (padrão)

## 4) Pós-deploy

1. Abra `/admin` no domínio Vercel.
2. Crie uma sessão e confirme conexão `status: connected`.
3. Teste:
   - `/display`
   - `/legend`
   - `/ref/left`, `/ref/center`, `/ref/right`
