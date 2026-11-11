# State machine — norma compartida

Esta es la **autoridad** del comportamiento de ambas demos. Flutter (`lib/state/`) y Expo
(`src/state/`) implementan la misma semántica con dos lenguajes distintos. Cualquier
divergencia entre implementaciones es un defecto; el golden (`golden/steps.json`) la
detecta.

El reducer es **puro**: no importa frameworks, no lee el reloj, no hace I/O. Recibe un
estado y una acción, devuelve un estado nuevo y una lista de efectos. Los efectos los
agenda el store, que es el único que conoce timers.

    Dart:  ReduceResult reduce(DemoState state, DemoAction action)  // {state, effects}
    TS:    { state: DemoState; effects: Effect[] } reduce(state, action)

## 1. Estado

```text
DemoState {
  view: 'radar' | 'map' | 'list'
  overlay: null | 'profile' | 'chat' | 'notifications' | 'filters' | 'settings'
                | 'about' | 'safety' | 'blocked' | 'privacy'
  profileId: string | null          // perfil enfocado por overlay profile/safety
  chatId: string | null
  selfIntention: Intention
  ghost: boolean
  filters: {
    intentions: Intention[] | null  // null = sin filtro de intención
    gender: 'all' | Gender
    verifiedOnly: boolean
    onlineOnly: boolean
    radiusM: number
  }
  pingsSent: string[]
  incomingPings: string[]
  matches: string[]
  revealedByMe: string[]
  revealedByPeer: string[]
  messages: Record<string, Message[]>          // Message = { from: 'me' | 'peer', textKey: string }
  typing: string | null
  notifications: Notification[]                // Notification = { id, kind, profileId, read }
  blocked: string[]
  verification: 'unverified' | 'linked' | 'verified'
  matchCelebration: string | null
  toast: { id: string, textKey: string } | null
  notifSeq: number                             // contador monótono para ids 'n1', 'n2', ...
  toastSeq: number                             // contador monótono para ids 't1', 't2', ...
  replyCursor: Record<string, number>          // próximo índice de chatReplies por perfil
}
```

`initialState()` se deriva de `fixtures.json`: `view='radar'`, `overlay=null`,
`selfIntention=fixtures.self.intention`, `ghost=false`,
`filters={intentions:null, gender:'all', verifiedOnly:false, onlineOnly:false,
radiusM:fixtures.filters.defaultRadiusM}`, listas vacías, `verification='unverified'`,
`matchCelebration=null`, `toast=null`, `notifSeq=0`, `toastSeq=0`, `replyCursor={}`.

**Ids deterministas** (para que el golden sea comparable): una notificación nueva usa
`'n' + (notifSeq + 1)` y un toast nuevo usa `'t' + (toastSeq + 1)`; ambos contadores se
incrementan al crear el objeto. Nunca se reutiliza un id.

## 2. Acciones (26)

`SET_VIEW`, `SET_SELF_INTENTION`, `OPEN_OVERLAY`, `CLOSE_OVERLAY`, `SET_RADIUS`,
`TOGGLE_FILTER_INTENTION`, `SET_GENDER_FILTER`, `TOGGLE_VERIFIED_ONLY`,
`TOGGLE_ONLINE_ONLY`, `CLEAR_FILTERS`, `SEND_PING`, `ACCEPT_PING`, `REJECT_PING`,
`OPEN_CHAT`, `SEND_MESSAGE`, `REVEAL_PHOTO`, `TOGGLE_GHOST`, `SET_VERIFICATION`,
`BLOCK_PROFILE`, `UNBLOCK_PROFILE`, `REPORT_PROFILE`, `MARK_READ`, `MARK_ALL_READ`,
`DISMISS_TOAST`, `TIMER_FIRED`, `RESET`.

Payloads canónicos (mismos nombres en ambos lenguajes):

| Acción | Payload |
|---|---|
| `SET_VIEW` | `view` |
| `SET_SELF_INTENTION` | `intention` |
| `OPEN_OVERLAY` | `overlay`, `profileId?` |
| `CLOSE_OVERLAY` | — |
| `SET_RADIUS` | `radiusM` |
| `TOGGLE_FILTER_INTENTION` | `intention` |
| `SET_GENDER_FILTER` | `gender` |
| `TOGGLE_VERIFIED_ONLY` / `TOGGLE_ONLINE_ONLY` | — |
| `CLEAR_FILTERS` | — |
| `SEND_PING` | `profileId` |
| `ACCEPT_PING` / `REJECT_PING` | `profileId` |
| `OPEN_CHAT` | `profileId` |
| `SEND_MESSAGE` | `profileId`, `textKey` |
| `REVEAL_PHOTO` | — |
| `TOGGLE_GHOST` | — |
| `SET_VERIFICATION` | — (cicla) |
| `BLOCK_PROFILE` / `UNBLOCK_PROFILE` | `profileId` |
| `REPORT_PROFILE` | `profileId`, `reason` |
| `MARK_READ` | `notificationId` |
| `MARK_ALL_READ` / `DISMISS_TOAST` / `RESET` | — |
| `TIMER_FIRED` | `kind`, `id` |

## 3. Guards y cambios

Una acción que no pasa su guard es un **no-op** (mismo estado, sin efectos). No hay
errores ni excepciones: la UI deshabilita lo que el guard rechazaría, pero el reducer
nunca confía en la UI.

| Acción | Guard | Cambios |
|---|---|---|
| `SET_VIEW` | `view` válido | `view`, cierra `overlay` si era `filters` |
| `SET_SELF_INTENTION` | intención válida | `selfIntention`; `filters.intentions=null` para que el descubrimiento use la intención propia |
| `OPEN_OVERLAY` | `overlay` válido; `profile`/`safety` requieren `profileId` visible y no bloqueado | `overlay`, `profileId` |
| `CLOSE_OVERLAY` | — | `overlay=null`, `profileId=null` (mantiene `chatId` sólo si el overlay era `chat`) |
| `SET_RADIUS` | valor de `fixtures.filters.radiiM` | `filters.radiusM` |
| `TOGGLE_FILTER_INTENTION` | intención válida | agrega o quita de `filters.intentions`; lista vacía → `null` |
| `SET_GENDER_FILTER` | `'all'` o género válido | `filters.gender` |
| `TOGGLE_VERIFIED_ONLY` / `TOGGLE_ONLINE_ONLY` | — | invierte el booleano |
| `CLEAR_FILTERS` | — | filtros al default (`intentions=null`, `gender='all'`, ambos false) |
| `SEND_PING` | `!ghost`, perfil visible, no bloqueado, no en `pingsSent`, no en `matches` | `pingsSent+=id`; si `pingsSent` estaba vacío → effect `{incomingPing, incomingPingFromId, incomingPingMs}`; toast `ping.sent` |
| `ACCEPT_PING` | `!ghost`, `id` en `incomingPings`, no bloqueado | saca de `incomingPings`, `matches+=id`, `messages[id]=[]`, effect `{match, id, matchMs}` |
| `REJECT_PING` | `id` en `incomingPings` | saca de `incomingPings`; sin match ni chat |
| `TIMER_FIRED` | según `kind` (abajo) | según `kind` (abajo) |
| `OPEN_CHAT` | `id` en `matches`, no bloqueado | `chatId=id`, `matchCelebration=null`, `overlay='chat'` |
| `SEND_MESSAGE` | `chatId===id`, no bloqueado, `typing===null`, `textKey` existe en copy | `messages[id]+={me,textKey}`, `typing=id`, effect `{typing, id, typingMs}` |
| `REVEAL_PHOTO` | `chatId` en `matches`, `chatId` no en `revealedByMe` | `revealedByMe+=chatId`, effect `{reveal, chatId, revealMs}` |
| `TOGGLE_GHOST` | — | invierte `ghost`; si queda activo y el overlay es `profile`/`chat`, `overlay=null`, `profileId=null`, `chatId=null` |
| `SET_VERIFICATION` | — | ciclo `unverified → linked → verified → unverified` |
| `BLOCK_PROFILE` | `id` no bloqueado | `blocked+=id`; lo quita de `pingsSent`, `incomingPings`, `matches`, `typing` si era ese chat; borra `messages[id]`, `revealedByMe/Peer`, `replyCursor[id]`; filtra notificaciones de `id`; si `chatId===id` → `chatId=null`; si `profileId===id` → `overlay=null`, `profileId=null`; toast `safety.blocked` |
| `UNBLOCK_PROFILE` | `id` bloqueado | quita de `blocked`; no restaura pings, match ni chat; toast `safety.unblocked` |
| `REPORT_PROFILE` | `id` no bloqueado, `reason` en `fixtures.reportReasons` | no altera el dataset ni bloquea; toast `safety.reportDone` |
| `MARK_READ` | notificación existente | `read=true` |
| `MARK_ALL_READ` | — | todas `read=true` |
| `DISMISS_TOAST` | hay toast | `toast=null` |
| `RESET` | — | `initialState()`; el store cancela todos los timers |

### `TIMER_FIRED(kind, id)`

| `kind` | Guard | Cambios |
|---|---|---|
| `incomingPing` | `!ghost`, `id` existe, no bloqueado, no en `incomingPings`, no en `matches`, no en `pingsSent` | `incomingPings+=id`, notificación `ping` no leída, toast `notif.ping` |
| `match` | `id` en `matches`, no bloqueado | `matchCelebration=id`, notificación `match` no leída |
| `typing` | `id === typing`, `id` en `matches`, no bloqueado | `typing=null`; agrega `{peer, replyKey}` usando `script.chatReplies[id]` con `replyCursor[id]` (avanza y se mantiene en el último) o `script.fallbackReplyKey` si no hay guion |
| `reveal` | `id` en `revealedByMe`, no bloqueado | `revealedByPeer+=id`, notificación `reveal` no leída |
| `toast` | el toast actual tiene ese `id` | `toast=null` |

Un `TIMER_FIRED` que no pasa el guard es no-op. El reducer nunca agenda timers: los
efectos son datos.

## 4. Timers (del contrato)

| Efecto | Delay | Origen | Al vencer |
|---|---|---|---|
| `incomingPing` | `timers.incomingPingMs` (3000) | primer `SEND_PING` exitoso | `TIMER_FIRED('incomingPing', script.incomingPingFromId)` |
| `match` | `timers.matchMs` (2500) | `ACCEPT_PING` | `TIMER_FIRED('match', id)` |
| `typing` | `timers.typingMs` (1200) | `SEND_MESSAGE` exitoso | `TIMER_FIRED('typing', id)` |
| `reveal` | `timers.revealMs` (1500) | `REVEAL_PHOTO` | `TIMER_FIRED('reveal', id)` |
| `toast` | `timers.toastMs` (4000) | cualquier toast nuevo | `TIMER_FIRED('toast', toastId)` |

El store agenda los efectos en un `Map<string, Timer>` con clave `kind:id`. Un efecto
nuevo con la misma clave **reemplaza** al anterior (reprograma). `RESET`, el desmontaje
(Expo) y `dispose` (Flutter) cancelan todo el mapa. Nunca hay timers huérfanos.

## 5. Selectores

| Selector | Semántica |
|---|---|
| `visibleProfiles(state)` | `profiles − blocked`, filtrados por `radiusM` (`distanceM <= radiusM`), intención (`filters.intentions` si no es `null`, si no `selfIntention`), género (`gender !== 'all'`), `verifiedOnly` y `onlineOnly`; orden `distanceM` asc, empate por `id` asc |
| `profileById(state, id)` | perfil de `fixtures.profiles` o `null` |
| `unreadCount(state)` | notificaciones `read === false` |
| `canPing(state, id)` | `!ghost` y perfil visible y no en `pingsSent`/`matches` y no bloqueado |
| `canSendInChat(state)` | `chatId` en `matches`, no bloqueado, `typing === null` |
| `isRevealed(state, id)` | `id` en `revealedByMe` y en `revealedByPeer` |
| `avatarState(state, id)` | `'clear'` si `isRevealed`, si no `'blurred'` |

## 6. Proyección de ubicación y formato

Proyección compartida por radar y mapa (sin azar):

```text
r = 0.42 * min(distanceM / radiusM, 1)
x = 0.5 + sin(bearingDeg * π / 180) * r
y = 0.5 - cos(bearingDeg * π / 180) * r
```

Formato de distancia (sin `intl`): `distanceM < 1000` → `"N m"`; si no →
`"X,Y km"` con una decimal y coma decimal (`2600` → `"2,6 km"`). El espacio de miles no
se usa.

## 7. Reset y determinismo

- `RESET` devuelve exactamente `initialState()` y el store cancela timers.
- Refrescar la página produce el mismo estado inicial: no hay storage, cookies,
  `localStorage`, `sessionStorage` ni URL con estado.
- Los timers se derivan de acciones, no del reloj de pared: el reducer no llama a
  `DateTime.now()` / `Date.now()`.
- La navegación es estado en memoria (`view` + `overlay`). No hay router ni rutas
  profundas; la URL nunca cambia.

## 8. Paridad ejecutable (golden)

`golden/steps.json` es una secuencia canónica de acciones con `TIMER_FIRED` explícitos.
Ambos test suites la reproducen con el mismo reducer y, después de cada paso, comparan
`digest = sha256(projection(state)).hex[0..12]` contra `golden/expected.json`
(producido por el dumper de Dart, única fuente).

`projection(state)` es una lista **ordenada** de líneas `clave=valor`:

```text
view, overlay, profileId, chatId, selfIntention, ghost,
radiusM, filter.intentions, filter.gender, filter.verifiedOnly, filter.onlineOnly,
pingsSent, incomingPings, matches, revealedByMe, revealedByPeer,
messages, typing, notifications, blocked, verification, matchCelebration, toast
```

Reglas de serialización (idénticas en ambos lenguajes):

- `null` → `-`; booleanos → `1` / `0`.
- Listas → elementos ordenados asc, separados por `,`; lista vacía → `-`.
- `filter.intentions` → `null` = `-`, si no las intenciones en el orden de `filters.intentions` del dataset.
- `messages` → claves asc, cada una `id:from=textKey` unidos por `;`.
- `notifications` → `id:kind:profileId:read` en orden de creación, unidos por `;`.
- `toast` → `id:textKey` o `-`.
- El resultado se une con `\n` (sin línea final) y se hashea con UTF-8 y sha256.
