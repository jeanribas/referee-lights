# Referee Lights · Key Relay Helper

Pequeno utilitário Node que acompanha uma sala do Referee Lights e dispara teclas F1 ou F10 no sistema operacional assim que a decisão é revelada:

- **F1** quando **2 ou mais votos brancos** são registrados (válido);
- **F10** quando **2 ou mais votos vermelhos** são registrados (inválido).

Use este helper no computador que precisa enviar atalhos para o software externo (por exemplo, o placar oficial).

## Requisitos

- Node.js 18 ou superior instalado.
- Acesso de rede ao backend do Referee Lights (`WS_URL`/`API_URL`).
- `roomId` (obrigatório) e, opcionalmente, o PIN admin para validar a sessão antes de conectar.

> ⚠️ O helper precisa permanecer em execução para emitir as teclas. Verifique se ele está rodando antes de iniciar a rodada.

## Como usar (fluxo simples)

1. Extraia/abra a pasta `tools/key-relay`.
2. Execute o arquivo correspondente ao seu sistema:
   - macOS: `start.command`
   - Windows: `start.bat` (ou `start.ps1`)
   - Linux: `start.sh`
3. O helper só pede o link do display/admin (`/display?roomId=...&pin=...`). Ele extrai `roomId`, PIN e o servidor automaticamente.
4. Se o link não tiver PIN, ele pergunta apenas pelo PIN. Os atalhos continuam F1/F10, a menos que você ajuste o arquivo de configuração.
5. O helper dispara a tecla ~1,6 s após a decisão ser revelada (tempo necessário para a tela exibir o resultado). Ajuste com a variável `TRIGGER_DELAY_MS` se precisar.
4. Responda e deixe a janela aberta. Assim que o sistema revelar a decisão, o helper envia as teclas configuradas para o aplicativo em foco.

> Quer pular as perguntas? Crie um arquivo `key-relay-config.json` (ou `.env`) na mesma pasta com os valores desejados. O helper usa automaticamente.

Exemplo em JSON (`key-relay-config.json`):

```json
{
  "validKey": "F1",
  "invalidKey": "F10"
}
```

Ou em formato texto (`key-relay-config.txt`):

```
VALID_KEY=F2
INVALID_KEY=F11
```

### Uso avançado (opcional)

Para rodar via linha de comando:

```bash
cd tools/key-relay
npm install          # apenas se quiser instalar manualmente
node src/index.mjs --session-url "https://meusite.com/display?roomId=ABCD&pin=1234" --ws https://api.meusite.com --valid-key F2 --invalid-key F11
```

> Dica: se existir um arquivo `key-relay-config.json` (ou `config.json`) na mesma pasta, os dados da sala são carregados automaticamente.

### Opções disponíveis

| Flag / env             | Descrição                                                                 | Default/Comportamento             |
|------------------------|----------------------------------------------------------------------------|-----------------------------------|
| `--session-url`, `SESSION_URL` | Link completo do display/admin (usa roomId/pin da query)            | pergunta interativa               |
| `--ws`, `WS_URL`       | Endpoint Socket.IO do backend                                             | `http://localhost:3333`           |
| `--api`, `API_URL`     | Base HTTP usada para validar o PIN (`/rooms/:id/access`)                  | Mesmo valor de `--ws`             |
| `--room`, `ROOM_ID`    | Sala que será monitorada                                                  | pergunta interativa               |
| `--pin`, `ADMIN_PIN`   | PIN administrativo. Se omitido, a validação HTTP é pulada                 | —                                 |
| `--valid-key`, `VALID_KEY`   | Tecla disparada para decisão válida (F1–F12)                         | `F1`                              |
| `--invalid-key`, `INVALID_KEY` | Tecla disparada para decisão inválida (F1–F12)                    | `F10`                             |
| `--skip-verify`        | Ignora a chamada de validação mesmo com PIN definido                      | `false`                           |
| `TRIGGER_DELAY_MS`     | (env) Tempo em ms entre a revelação e o envio da tecla                    | `1600`                            |

## Funcionamento

1. Conecta-se ao backend como cliente `viewer`.
2. Mantém um `state:update` em tempo real.
3. Quando o estado entra em `phase: 'revealed'`, conta os votos:
   - `>= 2` brancos → dispara a tecla configurada para **válido** (padrão F1).
   - `>= 2` vermelhos → dispara a tecla configurada para **inválido** (padrão F10).
4. Ao retornar para `phase: 'idle'`, o helper volta a ficar pronto para a próxima decisão.

Os logs informam quando a tecla foi enviada ou se houve algum erro.

### Emissão das teclas por sistema operacional

- **macOS**: usa `osascript`/AppleScript (`System Events`). Conceda permissão de Acessibilidade ao Terminal (ou ao app que execute o helper) em *Ajustes do Sistema → Privacidade e Segurança → Acessibilidade*.
- **Windows**: executa um comando PowerShell com `WScript.Shell.SendKeys`. Rodar em um PowerShell com acesso a COM (não bloqueado por políticas corporativas).
- **Linux**: utiliza `xdotool`. Instale-o (`sudo apt install xdotool`, por exemplo) e garanta acesso ao display X11 em que o placar está aberto.

## Modo remoto (uso “na web”)

Mesmo quando o backend estiver hospedado na internet, o helper precisa rodar **localmente** no computador que dispara os atalhos. Configure `WS_URL`/`API_URL` apontando para o domínio público do servidor (por exemplo `https://luzes-ipf.assist.com.br`). Basta manter o helper aberto enquanto o evento acontece.

Caso a rede bloqueie o acesso direto, abra as portas necessárias ou use o mesmo túnel/rede que o frontend utiliza.

## Incluindo no pacote Windows

Ao montar o bundle, copie a pasta `tools/key-relay` e distribua junto. O operador só precisa abrir `start.bat`. Certifique-se de que o PowerShell tenha permissão para usar `WScript.Shell`.
