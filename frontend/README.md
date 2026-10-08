# Referee Lights · Frontend

Next.js (Pages Router) + TypeScript + Tailwind. Idiomas: `pt-BR` (padrão), `en-US`, `es-ES`.

## Rotas

| Rota | Tela |
| --- | --- |
| `/` | Página inicial |
| `/admin` | Painel de controle: cria/recupera sala, QR Codes, preview, Key Relay |
| `/display` | Telão com luzes, cronômetro e intervalo |
| `/legend` | Legenda para transmissão (fundo configurável) |
| `/timer` | Cronômetro em tela cheia |
| `/ref/:judge` | Console do árbitro (`left`, `center`, `right`) |
| `/windows` | Download do pacote Windows |

Todas as telas de sala se conectam ao Socket.IO do servidor e compartilham o estado da sala.

## Rodando

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Variáveis

- `NEXT_PUBLIC_WS_URL` – URL do Socket.IO (ex.: `http://localhost:3333`)
- `NEXT_PUBLIC_API_URL` – URL da API HTTP (normalmente a mesma)

## Build

`npm run build` e `npm run start`. Na Vercel, defina as duas variáveis apontando para o servidor público.

## Onde mexer

- Preview do admin: `previewLayout` em `src/pages/admin.tsx`.
- Alertas sonoros do intervalo/cronômetro: `src/components/IntervalFull.tsx`.
