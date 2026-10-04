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

- `role` must be one of `admin`, `display`, `left`, `center`, `right`; anything else gets `invalid_payload`.
- `admin` and `display` require the room PIN (`pin`).
- `left`, `center`, `right` require their referee token (`token`).
- 30 failed PIN/token attempts per IP within 10 minutes block registration with `too_many_attempts`.

## Limits

- 40 events per second per connection; extra events get `rate_limited`. Above 200/s the connection is dropped.
- Maximum message size: 16 KB.
- `seconds` in `timer:command` / `interval:command`: number from 0 to 86400.

## ACK errors

Commands can return `{ error: string }` in the ACK callback:

| Code | Meaning |
| --- | --- |
| `invalid_payload` | Malformed payload or unknown role |
| `room_not_found` | Room does not exist or was archived |
| `invalid_pin` | Wrong room PIN |
| `invalid_token` | Wrong or rotated referee token |
| `not_authorised` | Role cannot send this event |
| `unknown_action` | Unsupported `action` |
| `too_many_attempts` | Too many failed authentications from this IP |
| `rate_limited` | Too many events per second |
