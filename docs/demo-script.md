# Demo script — dos dispositivos reales

> **Objetivo:** mostrar la demo live de punta a punta en 10–12 minutos con
> **exactamente dos dispositivos reales** (dos teléfonos, o un teléfono y una
> notebook) en la **misma región**, viéndose de verdad. Cada acto tiene qué hacer,
> qué mirar y qué decir.
> **Requisito:** el backend está arriba y verificado (§0). Todo lo demás es UI.
> **Lo que ya no existe:** no hay perfiles automáticos ni respuestas simuladas. Si
> en el radar hay una sola fila, es la otra persona; si no hay ninguna, no hay
> nadie conectado todavía.

## 0. Preparación (10 minutos antes)

```bash
cd backend
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml ps
curl -s https://api.example.com/health/ready    # 200 y "migrated", "seeded"
# Limpiar la corrida anterior (con token de operador, no delante de la audiencia)
curl -s -X POST https://api.example.com/demo/reset \
  -H "Authorization: Bearer $DEMO_RESET_TOKEN"
```

- **Dos dispositivos**, uno por persona, con navegador actualizado. Cada uno
  necesita su propia sesión: el token vive en memoria, así que dos pestañas del
  mismo navegador también sirven, pero un dispositivo por persona es lo que se
  muestra.
- URL para los dos:

  ```text
  https://luisplata.github.io/NearbyIG/expo/?api=https://api.example.com
  ```

- Dejá `?zone=cdmx` a mano en los dos si querés evitar el selector de zona.
- En el dispositivo `A`, tené abierto DevTools (o el inspector remoto del
  teléfono) → Network filtrado por `discovery`.
- Silenciá notificaciones del sistema: **no hay push** en esta demo (por diseño).

**Regiones:** `mx` (CDMX) y `co` (Bogotá) están **aisladas**. Los dos
dispositivos van a la **misma** región y a la **misma zona** (`mx` / `cdmx`). Si
uno elige `bogota`, no se ven: eso está bien y se explica en el Acto 3.

## 1. Acto 1 — Qué estamos mirando (1 min)

**Decir:**

> “Tenemos dos demos publicadas: una **mock**, que corre sin internet y con datos
> fijos, y esta **live**, que habla con un backend real. Si el backend se cae, el
> mock sigue funcionando: es la red de seguridad.”

**Mirar:** la landing (`https://luisplata.github.io/NearbyIG/`) con sus tarjetas;
el badge de modo dentro de la app (**Acerca de** muestra modo, dataset y host).

## 2. Acto 2 — Una identidad por dispositivo (1 min)

**Hacer:** en `A` elegí un perfil del selector; en `B`, **otro**. Si un perfil
está “en uso”, usá **takeover** en `B`.

**Decir:**

> “No hay registro ni contraseña: la demo usa identidades sembradas — diez por
> región. El servidor firma una sesión corta que vive en memoria; si recargás,
> volvés al selector. Eso es a propósito: no hay token persistido.”

**Mirar:** refrescá `A` → vuelve al selector (no hay `localStorage` con sesión).

## 3. Acto 3 — Zona y GPS (1 min)

**Hacer:** los dos eligen **CDMX**. En `A` **aceptá** el permiso de ubicación; en
`B` **denegalo**.

**Decir:**

> “La demo funciona sin GPS: la zona de demo es un punto del catálogo. Si el
> permiso se niega, no hay error: se usa la zona elegida. Si se acepta, el punto
> real se redondea y se guarda en el servidor sin devolverse nunca.”

**Mirar:** con `A` solo, el radar muestra el estado vacío honesto —“Todavía no hay
nadie cerca”—, no una lista de relleno. Abrí `GET /discovery` en Network y leé
`"results": []`. Ese vacío es la prueba de que no hay población sintética.

## 4. Acto 4 — Se ven mutuamente (2 min)

**Hacer:** que `B` entre a la misma zona. Esperá una consulta de discovery (≤ 3 s)
o tocá refrescar.

**Decir:**

> “Con dos personas conectadas en la misma zona hay **una** fila en el radar: la
> otra persona. Nadie más. Las distancias vienen en múltiplos de 10 m y el rumbo
> en múltiplos de 5°; el navegador no recibe coordenadas de nadie.”

**Mirar en Network:** abrí la respuesta de `discovery` → **una** fila (o dos si un
tercero se suma), con `distanceM` y `bearingDeg`; **no** hay `lat`, `lng`,
`latitude`, `longitude`, `geo` ni `geohash`. Ese es el punto que más impresiona a
un técnico.

**Opcional (30 s):** alejá o acercá un dispositivo y mostrá que la distancia
cambia en el siguiente snapshot. Moverse no se simula: se mide.

## 5. Acto 5 — Ping → aceptar → match (2 min)

**Hacer:**

1. En `A`, abrí la tarjeta de `B` y **pinguéalo**.
2. En `B`, campana → aparece el ping → **aceptar**.
3. En los dos: se abre el match.

**Decir:**

> “El ping es idempotente: si `A` reintenta, el servidor responde 409 y no hay dos
> pings pendientes. El match se crea una sola vez por par, y sólo el destinatario
> puede aceptarlo. Nadie acepta solo del otro lado.”

**Mirar:** el badge de la campana baja a 0 al abrir el centro de notificaciones; el
match aparece en la bandeja de los dos.

## 6. Acto 6 — Chat en los dos sentidos (2 min)

**Hacer:** escribí desde `A`, respondé desde `B`. Mandá un tercer mensaje desde
`A`. Después recargá `B` y volvé a entrar con la misma identidad.

**Decir:**

> “Los mensajes se persisten: sobreviven al refresh y al logout. El envío es
> idempotente por `clientMessageId`, así que un reintento de red no duplica el
> mensaje. El stream avisa del mensaje nuevo; el contenido siempre lo lee la página
> de mensajes.”

**Mirar:** el orden cronológico se mantiene, el contador de no leídos sube en el
lado que no leyó, y el mensaje nuevo llega sin recargar.

## 7. Acto 7 — Ghost (1 min)

**Hacer:** en `A`: **Ajustes → Modo fantasma**. Mirá `B`.

**Decir:**

> “Fantasma es inmediato: `A` desaparece del descubrimiento de `B` en la siguiente
> consulta o evento, y su sesión sigue viva. `A` sigue viendo el radar, con un
> banner que le recuerda que está invisible. No es ‘desconectarse’: es no ser
> visible.”

**Mirar:** la tarjeta de `A` se va de `B` sin recargar; en `A` queda el banner y
`B` **sigue** en su lista (el ghost oculta, no aísla).

**Volver:** apagar fantasma y ver que reaparece.

## 8. Acto 8 — Bloqueo y reporte (2 min)

**Hacer:**

1. En `A`: abrí el chat con `B` → **bloquear**.
2. En `B`, intentá escribir en ese chat y mirá el descubrimiento.
3. En `A`: desbloquear.
4. En `A`: **reportar** a `B` con un motivo del catálogo.

**Decir:**

> “El bloqueo es asimétrico en la fila y simétrico en el efecto: se guarda `A → B`,
> pero ninguno ve al otro y la conversación queda legible sin aceptar mensajes
> nuevos. El reporte queda registrado y no tiene consecuencia automática: no hay
> consola de moderación.”

**Mirar:** el chat responde `403` de conversación bloqueada, no un 500; al
desbloquear, vuelve a escribirse.

## 9. Acto 9 — Reset propio (1 min)

**Hacer:**

1. En `A`: **Ajustes → Reiniciar demo** (reset propio).
2. Mostrá que vuelve al selector de zona y que `B` **no** se vio afectado.

**Decir:**

> “El reset propio borra lo mío: mi sesión, mis pings, mis matches, mis avisos. No
> toca a la otra persona. El reset global es de operación, se corre desde la
> terminal con un token — no está en la UI, justamente para que nadie lo apriete
> en medio de una demo.”

**Mirar:** `B` conserva su estado y sigue viendo el radar; `A` vuelve al inicio.

## 10. Cierre — Qué es real y qué no (1 min)

**Decir (sin adornos):**

| Real | Simulado / fuera de alcance |
|---|---|
| Backend NestJS + PostGIS, sesiones firmadas, presencia con TTL | Registro, contraseña, OAuth, email |
| Radar con distancia/rumbo calculados en el servidor | Mapa con tiles propios y GPS en background |
| Pings, matches, chat y notificaciones persistidos entre dos personas | Push del sistema, adjuntos, audio |
| Ghost, bloqueo, reporte y resets persistidos | Consola de moderación, suspensión de cuentas |
| SSE con ticket de un uso y reconexión | Llamadas, video, pagos |
| Densidad **real**: una fila por persona conectada | Perfiles automáticos de relleno |

**Cerrar:**

> “Todo lo que vieron sobrevive un refresh y se puede resetear. La próxima etapa
> es auth real y las apps en las tiendas.”

## 11. Si algo sale mal

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| “Perfil en uso” al entrar | El slot lo tiene una sesión vieja | Usar **takeover** en el selector o cerrar la otra sesión |
| El radar queda vacío | El otro dispositivo está en otra región, en ghost, bloqueado, o su TTL de presencia venció | Verificar región y zona; pedirle que mueva el mouse o reenvíe presencia |
| El segundo dispositivo no ve al primero | Sesión `guest` (región llena), no `human` | Liberar un slot (logout/reset) y volver a entrar |
| Errores 429 | Alguien dejó un loop abierto (recarga automática) | Esperar unos segundos; si persiste, reset global |
| El chat no acepta mensajes (`409`) | El peer ya no tiene perfil proyectable, o cambió de zona | Volver a la zona original; la historia sigue legible |
| “API no disponible” | Backend caído o CORS | Abrir sin `?api=` (modo mock) y seguir la demo con el mock |

**Nunca en público:** reset global (borra la sesión de todos), `docker compose
down -v`, ni mostrar el `Authorization` en DevTools/URLs.

## 12. Checklist de éxito

- [ ] **Dos dispositivos reales**, dos identidades `human`, misma región y zona.
- [ ] El primer dispositivo solo muestra el estado vacío (sin relleno).
- [ ] Se ven mutuamente: **una** fila por persona conectada, sin extras.
- [ ] Ping → aceptar → match en ambos sentidos.
- [ ] Chat con persistencia: recargar no borra la conversación.
- [ ] Campana con badge que baja a 0.
- [ ] Ghost: desaparece del otro lado, sigue viendo, banner propio.
- [ ] Bloqueo: desaparece en las dos direcciones y el chat no acepta escritura.
- [ ] Reporte confirmado sin efecto visible.
- [ ] Reset propio aislado; el otro dispositivo intacto.
- [ ] En Network no hay coordenadas.
- [ ] El mock sigue disponible como fallback.
