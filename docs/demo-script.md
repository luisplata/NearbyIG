# Demo script — recorrido reproducible

> **Objetivo:** mostrar la demo live de punta a punta en 12–15 minutos, con dos
> personas que se ven, sin sorpresas. Cada acto tiene qué decir, qué mirar y qué
> tiene que pasar.
> **Requisito:** el backend está arriba y verificado (§0). Todo lo demás es UI.

## 0. Preparación (10 minutos antes)

```bash
cd backend
docker compose --env-file .env.production -f compose.yml -f compose.prod.yml ps
curl -s https://api.example.com/health/ready    # 200 y "migrated", "seeded"
# Limpiar la corrida anterior (con token de operador, no delante de la audiencia)
curl -s -X POST https://api.example.com/demo/reset \
  -H "Authorization: Bearer $DEMO_RESET_TOKEN"
```

- Abrí **dos ventanas**: una normal (`A`) y una incógnita (`B`), para que cada
  una tenga su propia sesión (el token vive en memoria).
- URL para las dos:

  ```text
  https://luisplata.github.io/NearbyIG/expo/?api=https://api.example.com
  ```

- Dejá `?zone=cdmx` a mano si querés evitar el selector de zona.
- Tené abierto DevTools → Network y filtrado por `discovery`.
- Silenciá notificaciones del sistema: **no hay push** en esta demo (por diseño).

**Regiones:** `mx` (CDMX) y `co` (Bogotá) están **aisladas**. Dos ventanas que
tienen que verse van en la **misma** región. Si querés mostrar la otra ciudad,
abrí una tercera ventana en `bogota`: ve su propio radar, no a los de CDMX.

`A` y `B` eligen la misma zona (`cdmx`) en la misma región (`mx`).

## 1. Acto 1 — Qué estamos mirando (1 min)

**Decir:**

> “Tenemos dos demos publicadas: una **mock**, que corre sin internet y con datos
> fijos, y esta **live**, que habla con un backend real. Si el backend se cae, el
> mock sigue funcionando: es la red de seguridad.”

**Mirar:** la landing (`https://luisplata.github.io/NearbyIG/`) con sus tarjetas;
el badge de modo dentro de la app (**Acerca de** muestra modo, dataset y host).

## 2. Acto 2 — Identidad demo (1 min)

**Hacer:** en `A` elegí un perfil del selector; en `B`, **otro**.

**Decir:**

> “No hay registro ni contraseña: la demo usa identidades sembradas. El servidor
> firma una sesión corta, que vive en memoria — si recargás, volvés al selector.
> Eso es a propósito: no hay token persistido.”

**Mirar:** refrescá `A` → vuelve al selector (no hay `localStorage` con sesión).

## 3. Acto 3 — Zona y GPS (1 min)

**Hacer:** elegí **CDMX**. Si el navegador pide permiso de ubicación, **denegalo**
en una ventana y **aceptá** en la otra.

**Decir:**

> “La demo funciona sin GPS: la zona de demo es un punto del catálogo. Si el
> permiso se niega, no hay error: se usa la zona elegida. Si se acepta, el punto
> real se redondea y se guarda en el servidor sin devolverse nunca.”

**Mirar:** el radar se llena en 2–3 s (los bots del servidor se siembran en el
primer tick).

## 4. Acto 4 — Radar, distancia y rumbo (2 min)

**Hacer:** esperá el primer tick y contá las tarjetas.

**Decir:**

> “Cada persona trae dos bots que se mueven solos. Con dos humanos en la misma
> zona ves 5 perfiles: la otra persona, sus dos bots y los tuyos. Las distancias
> vienen en múltiplos de 10 m y el rumbo en múltiplos de 5°; el navegador no
> recibe coordenadas de nadie.”

**Mirar en Network:** abrí la respuesta de `discovery` → sólo `distanceM` y
`bearingDeg`; **no** hay `lat`, `lng`, `latitude`, `longitude`, `geo` ni
`geohash`. Ese es el punto que más impresiona a un técnico.

## 5. Acto 5 — Ping → match → chat → notificación (3 min)

**Hacer:**

1. En `A`, abrí la tarjeta de `B` (el humano, no un bot) y **pinguéalo**.
2. En `B`, campana → aparece el ping → **aceptar**.
3. En las dos: se abre el match; escribí desde `A`, respondé desde `B`.
4. En `B`, mandá un mensaje a un **bot**: el bot muestra “escribiendo” y
   responde con una frase del catálogo.

**Decir:**

> “El ping es idempotente: si `A` reintenta, el servidor responde 409 y no hay
> dos pings pendientes. El match se crea una sola vez por par. Los mensajes se
> persisten: si recargás y volvés a entrar con la misma identidad, siguen ahí. El
> bot responde una sola vez por mensaje, no por reintento.”

**Mirar:** el badge de la campana baja a 0 al abrir el centro de notificaciones.

## 6. Acto 6 — Ghost (1 min)

**Hacer:** en `A`: **Ajustes → Modo fantasma**. Mirá `B`.

**Decir:**

> “Fantasma es inmediato: `A` desaparece del descubrimiento de `B` en la
> siguiente consulta o evento, y sus bots también. `A` sigue viendo el mapa y sus
> propios bots, con un banner que le recuerda que está invisible. No es
> ‘desconectarse’: es no ser visible.”

**Mirar:** la tarjeta de `A` se va de `B` sin recargar; en `A` queda el banner.

**Volver:** apagar fantasma y ver que reaparece.

## 7. Acto 7 — Bloqueo y reporte (2 min)

**Hacer:**

1. En `A`: abrí el chat con `B` → **bloquear**.
2. En `B`, intentá escribir en ese chat y mirá el descubrimiento.
3. En `A`: desbloquear.
4. En `A`: **reportar** a un bot con un motivo del catálogo.

**Decir:**

> “El bloqueo es simétrico en efecto: ninguno ve al otro y la conversación queda
> legible pero no acepta mensajes nuevos. Un bot se bloquea a través de su dueño:
> bloquear `mx-p09-b1` esconde a la persona. El reporte queda registrado y no
> tiene consecuencia automática: no hay consola de moderación en la demo.”

**Mirar:** el chat responde con un error de conversación bloqueada (`403`), no con
un 500; al desbloquear, vuelve a escribirse.

## 8. Acto 8 — Reset (1 min)

**Hacer:**

1. En `A`: **Ajustes → Reiniciar demo** (reset propio).
2. Mostrá que vuelve al selector de zona y que `B` **no** se vio afectado.

**Decir:**

> “El reset propio borra lo mío: mi sesión, mis pings, mis matches, mis avisos.
> No toca a la otra persona. El reset global es de operación, se corre desde la
> terminal con un token — no está en la UI, justamente para que nadie lo apriete
> en medio de una demo.”

**Mirar:** `B` conserva su estado; `A` vuelve al inicio.

## 9. Cierre — Qué es real y qué no (1 min)

**Decir (sin adornos):**

| Real | Simulado / fuera de alcance |
|---|---|
| Backend NestJS + PostGIS, sesiones firmadas, presencia con TTL | Registro, contraseña, OAuth, email |
| Radar con distancia/rumbo calculados en el servidor | Mapa con tiles propios y GPS en background |
| Pings, matches, chat y notificaciones persistidos | Push del sistema, adjuntos, audio |
| Ghost, bloqueo, reporte y resets persistidos | Consola de moderación, suspensión de cuentas |
| SSE con ticket de un uso y reconexión | Llamadas, video, pagos |

**Cerrar:**

> “Todo lo que vieron sobrevive un refresh y se puede resetear. La próxima etapa
> es auth real y las apps en las tiendas.”

## 10. Si algo sale mal

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| “Perfil en uso” al entrar | El slot lo tiene una pestaña vieja | Usar **takeover** en el selector o cerrar la otra pestaña |
| El radar queda vacío | Zona elegida sin presencia, o región distinta | Re-elegir zona; verificar que las dos ventanas están en la misma región |
| La otra persona no aparece | Está en fantasma, bloqueada, o su TTL de presencia venció | Pedirle que mueva el mouse / cambie de zona |
| Errores 429 | Alguien dejó un loop abierto (recarga automática) | Esperar unos segundos; si persiste, reset global |
| El chat no responde | El bot cambió de zona (dueño se mudó) | Volver a la zona original; la historia sigue legible |
| “API no disponible” | Backend caído o CORS | Abrir sin `?api=` (modo mock) y seguir la demo con el mock |

**Nunca en público:** reset global (borra la sesión de todos), `docker compose
down -v`, ni mostrar el `Authorization` en DevTools/URLs.

## 11. Checklist de éxito

- [ ] Dos ventanas, dos identidades, misma zona.
- [ ] Se ven mutuamente y a sus bots (5 perfiles).
- [ ] Ping → aceptar → match → chat en ambos sentidos.
- [ ] Un bot responde una vez con texto del catálogo.
- [ ] Campana con badge que baja a 0.
- [ ] Ghost: desaparece del otro lado y se queda con banner.
- [ ] Bloqueo: desaparece en las dos direcciones y el chat no acepta escritura.
- [ ] Reporte confirmado sin efecto visible.
- [ ] Reset propio aislado; el otro lado intacto.
- [ ] En Network no hay coordenadas.
- [ ] El mock sigue disponible como fallback.
