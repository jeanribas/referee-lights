# WebSocket Events (Socket.IO)

Namespace: `/`

After registering, each client joins `room:<roomId>` and receives `state:update` snapshots.

## Client -> Server

| Event | Payload | Allowed roles | Notes |
| --- | --- | --- | --- |
| `client:register` | `{ role, roomId, pin?, token? }` | all | Required before any other command. |
| `ref:vote` | `{ vote: 'white' \| 'red' \| null }` | `left`, `center`, `right` | Records judge decision. |
| `ref:card` | `{ card: 1 \| 2 \| 3 \| null }` | `left`, `center`, `right` | Manages red-card details. |
| `admin:ready` | none | `admin`, `display` | Resets state for next attempt. |
| `admin:release` | none | `admin`, `display` | Forces reveal. |
| `admin:clear` | none | `admin`, `display` | Clears revealed decision. |
| `timer:command` | `{ action: 'start' \| 'stop' \| 'reset' \| 'set', seconds? }` | `admin`, `display`, `center` | `set` starts with provided seconds. |
| `interval:command` | `{ action: 'start' \| 'stop' \| 'reset' \| 'set' \| 'show' \| 'hide', seconds? }` | `admin`, `display` | Controls interval timer and visibility. |
| `locale:change` | `{ locale: 'pt-BR' \| 'en-US' \| 'es-ES' }` | `admin`, `display` | Updates locale for all clients in room. |
| `legend:config` | `{ config: { bgColor, timerColor, digitMode, showPlaceholders, showDashedFrame, keepAwake } }` | `admin`, `display` | Saves shared legend visual config. |

## Server -> Client

| Event | Payload | Description |
| --- | --- | --- |
| `state:update` | `AppState` | Full snapshot broadcast on every state change. |
| `locale:change` | `Locale` | Immediate locale notification after `locale:change`. |

## `AppState` shape

```ts
{
  phase: 'idle' | 'revealed',
  votes: { left, center, right },
  cards: { left, center, right },
  timerMs: number,
  running: boolean,
  connected: { left, center, right },
  intervalMs: number,
  intervalConfiguredMs: number,
  intervalRunning: boolean,
  intervalVisible: boolean,
  locale: 'pt-BR' | 'en-US' | 'es-ES',
  legendConfig: {
    bgColor: string,                // '#RRGGBB' or 'transparent'
    timerColor: string,             // '#RRGGBB'
    digitMode: 'mmss' | 'hhmmss',
    showPlaceholders: boolean,
    showDashedFrame: boolean,
    keepAwake: boolean
  }
}
```

## Auth rules

- `admin` and `display` require valid room PIN (`pin`).
- `left`, `center`, `right` require valid referee token (`token`).
- Any other role is rejected with `invalid_payload`.

## ACK errors

Most commands can return `{ error: string }` in ACK callbacks:

- `invalid_payload`
- `room_not_found`
- `invalid_pin`
- `invalid_token`
- `not_authorised`
- `unknown_action`
