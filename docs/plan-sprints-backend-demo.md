# Plan de sprints — backend + demo live

> **Alcance:** mapa de entregables y validación para convertir la demo mock en una demo funcional con backend.
> **Sin fechas ni horas.** Cada sprint cierra con un entregable demostrable y un gate de validación.
> **Supuestos:** 10 perfiles humanos por región (`mx`, `co`), 2 bots por humano, aislamiento por región, sesiones demo, Expo live primero. El mock sigue publicado como fallback.
> **Fuera de alcance:** signup/signin real, OAuth, push del sistema, GPS en background, mapas con tiles, media, moderación y Flutter live.

---

## 1. Mapa de sprints

| Sprint | Entregable | Depende de | Demo al cierre | Costo operativo |
|---|---|---|---|---:|
| **0** | Contrato y banco de pruebas | — | Contrato revisado y cliente TS compilando | US$ 0 |
| **1** | Backend core + identidad demo | Sprint 0 | Dos navegadores entran con perfiles distintos | US$ 0 local |
| **2** | Presencia, región y bots | Sprint 1 | Un humano ve 2 bots moverse; dos humanos ven 5 perfiles | US$ 0 local |
| **3** | Descubrimiento + Expo live | Sprint 2 | Radar/mapa/lista live con movimiento e interpolación | US$ 0 local o tunnel |
| **4** | Pings, matches y chat | Sprint 3 | Ping → match → chat; bot responde texto fijo | US$ 0 local |
| **5** | Privacidad, seguridad y reset | Sprint 4 | Ghost, reveal, block/report y reset limpio | US$ 0 local |
| **6** | Deploy y E2E de dos navegadores | Sprint 5 | URL pública con dos testers en MX/CO | US$ 30–60/mes |
| **7** | Hardening y handoff | Sprint 6 | Runbook, restore, load test y demo script | US$ 30–60/mes |

**Camino crítico:** 0 → 1 → 2 → 3 → 4 → 5 → 6. El 7 puede solaparse con el 6, pero no se saltea antes de entregar.

---

## 2. Sprint 0 — Contrato y banco de pruebas

**Entregable:** contrato API congelado, modelo de datos, eventos SSE, errores, seeds y fixtures de prueba.

Incluye:

- OpenAPI con endpoints, DTOs, errores y auth.
- Envelope de eventos SSE y polling (`id`, `type`, `occurredAt`, `payload`).
- Catálogo `demo_regions` (`mx`, `co`) y `demo_zones` (CDMX, Bogotá).
- 10 perfiles humanos por región, con `demo_slot`, intención, género, verificación y avatar.
- Seeds idempotentes y datos de prueba para dos navegadores.
- Cliente TypeScript generado y validado.
- Reglas de serialización: nunca `lat/lng` en respuestas.

**Validación:**

- [ ] El contrato compila y el cliente TS se genera sin errores.
- [ ] Los seeds se pueden correr dos veces sin duplicar.
- [ ] Un test de serialización confirma que ningún DTO expone coordenadas.
- [ ] El mock actual sigue intacto y publicable.
- [ ] No hay secretos ni configuración de Firebase en el artefacto.

**Gate:** sin contrato aprobado no se empieza el Sprint 1.

---

## 3. Sprint 1 — Backend core + identidad demo

**Entregable:** backend NestJS levantando con PostGIS, migraciones, health, sesiones demo y perfiles regionales.

Incluye:

- NestJS modular, Docker Compose (api + PostGIS), migraciones, seeds.
- `/health` y `/health/ready`.
- `POST /auth/demo-session`, JWT corto, `GET /demo/profiles`, claim y takeover.
- 10 perfiles humanos por región; invitados dinámicos si se agotan.
- `POST /auth/logout`, `POST /auth/stream-ticket`.
- Reset por usuario y global.
- Logs sin PII.

**Validación:**

- [ ] `docker compose up` levanta API y base desde cero.
- [ ] Migraciones desde base vacía y rollback documentado.
- [ ] Dos navegadores entran con perfiles distintos.
- [ ] Un tercer intento sobre el mismo perfil recibe `409 PROFILE_IN_USE`.
- [ ] Logout/reset libera el perfil.
- [ ] Con 10 perfiles ocupados, el siguiente entra como invitado.
- [ ] `/health` responde y `/health/ready` falla si la base no está lista.

**Demo:** selector de perfiles, “en uso”, takeover y entrada como invitado. Todavía no hay radar.

---

## 4. Sprint 2 — Presencia, región y bots

**Entregable:** ubicación real o zona demo, región derivada, presencia con TTL y 2 bots por humano.

Incluye:

- `PUT /presence` con punto privado o `demoZoneKey`.
- `ST_Covers` contra polígonos de México y Colombia.
- Fallback suave: GPS denegado, fuera de región o cambio de región.
- 2 bots por humano, con waypoints y ticker de movimiento.
- SSE `GET /events` con ticket, `Last-Event-ID` y polling fallback.
- Ghost/pausa y TTL de 12 s.
- Límite de 6 bots por observador.

**Validación:**

- [ ] GPS en México → región `mx` y 2 bots.
- [ ] GPS en Colombia → región `co` y 2 bots.
- [ ] GPS denegado → sheet de zona demo; CDMX/Bogotá funciona.
- [ ] Fuera de México/Colombia → `fallbackRequired`, sin efectos; elección de zona demo.
- [ ] Movimiento fuera de la región → fallback a zona demo, sin logout.
- [ ] Dos humanos en la misma región ven 1 humano + 4 bots = 5 perfiles.
- [ ] Dos humanos en regiones distintas no se ven.
- [ ] Ghost oculta los 2 bots del dueño para los demás.
- [ ] Ningún payload o evento contiene coordenadas.

**Demo:** un humano ve 2 bots moverse; dos humanos en la misma región ven 5 perfiles.

---

## 5. Sprint 3 — Descubrimiento + Expo live

**Entregable:** radar, mapa y lista conectados al backend, con interpolación y modo dual mock/live.

Incluye:

- `GET /discovery` con radio, intención, género, verificado y online.
- Cálculo de distancia/rumbo server-side y redondeo.
- Exclusión de bloqueados, pausados y fuera de región.
- Cliente Expo live: API client, store live, SSE, polling fallback.
- Interpolación de movimiento solo en render.
- Selector mock/live y fallback al mock si la API falla.
- Build `/live/expo/` sin romper `/expo/`.

**Validación:**

- [ ] Radar, mapa y lista muestran los mismos perfiles.
- [ ] El movimiento se ve fluido entre snapshots.
- [ ] Los filtros cambian la lista sin recargar la app.
- [ ] Dos humanos de la misma región se ven y ven sus bots.
- [ ] Un humano de otra región no aparece.
- [ ] Si la API se cae, el mock sigue disponible.
- [ ] No hay requests a hosts externos.

**Demo:** radar live con movimiento, mapa/lista y comparación contra el mock.

---

## 6. Sprint 4 — Pings, matches y chat

**Entregable:** ping, aceptación, match, chat persistido, respuestas de bots y notificaciones.

Incluye:

- `POST /pings`, bandeja, aceptar/rechazar, match único.
- Rate limits, bloqueo y expiración de pings.
- `GET /matches`, mensajes, `clientMessageId`, read/unread.
- Bot con respuesta fija y `typing`.
- Chat entre dos humanos reales con persistencia.
- Notificaciones in-app, badge y toast.
- Sin push del sistema.

**Validación:**

- [ ] Un humano pinguea a un bot y el bot responde con texto fijo.
- [ ] Dos humanos se pinguean, aceptan y chatean entre sí.
- [ ] Los mensajes persisten al refrescar.
- [ ] Read/unread actualiza el badge.
- [ ] Un ping duplicado devuelve `409` o idempotencia.
- [ ] No hay timers duplicados entre cliente y servidor.
- [ ] Bloquear desde el chat corta la conversación.

**Demo:** dos navegadores completan ping → match → chat; un bot responde solo.

---

## 7. Sprint 5 — Privacidad, seguridad y reset

**Entregable:** controles de privacidad, seguridad y limpieza de demo.

Incluye:

- Ghost/pausa y desaparición inmediata de los bots propios.
- Revelación de fotos/flags.
- Bloqueo, desbloqueo, reportes y exclusión de descubrimiento.
- Notificaciones leídas/no leídas.
- Reset por usuario y global; liberación de perfiles y retiro de bots.
- Expiración de sesión y limpieza de presencia.
- Reglas de conversaciones al cambiar de región.

**Validación:**

- [ ] Ghost oculta humano y bots a los demás.
- [ ] Block excluye al usuario de radar, pings y chat.
- [ ] Report queda registrado sin consola de moderación.
- [ ] Reset por usuario no afecta a otros.
- [ ] Reset global libera los 10 perfiles por región y elimina invitados.
- [ ] No quedan bots huérfanos ni presencias vencidas.
- [ ] Conversaciones viejas quedan legibles pero cerradas si el bot cambió de región.

**Demo:** flujo de seguridad completo y reset limpio.

---

## 8. Sprint 6 — Deploy y E2E de dos navegadores

**Entregable:** demo pública con backend HTTPS, CORS, `/live/expo/` y mock fallback.

Incluye:

- Docker Compose local y despliegue en Droplet + Postgres administrado.
- HTTPS, CORS restringido a Pages y localhost.
- `API_BASE_URL` inyectado en build; sin hardcode.
- Landing con enlace “Demo en vivo”.
- Health/readiness antes de habilitar el link.
- Logs, métricas y alertas básicas.
- Runbook y rollback.

**Validación:**

- [ ] La URL pública responde 200 y refresca sin 404.
- [ ] Dos testers en México y Colombia completan el flujo.
- [ ] Los bots se mueven y el chat responde.
- [ ] No hay coordenadas en Network.
- [ ] El mock sigue funcionando si la API se deshabilita.
- [ ] El workflow de CI queda verde.
- [ ] El rollback vuelve al mock sin tocar datos de producción.

**Costo:** US$ 30–60/mes para el stack de piloto.

---

## 9. Sprint 7 — Hardening y handoff

**Entregable:** demo estable y operable, con límites documentados.

Incluye:

- Rate limits, validación de entrada y errores consistentes.
- Backup/restore probado.
- Load test con la densidad esperada (10 humanos + 20 bots por región).
- Revisión de seguridad: autorización, IDOR, fuga de coordenadas, tickets SSE.
- Demo script para el cliente.
- Limitaciones conocidas y próximos pasos.

**Validación:**

- [ ] Restore desde backup funciona.
- [ ] Load test sostiene la demo sin degradar el radar.
- [ ] Checklist de seguridad sin hallazgos críticos.
- [ ] Demo script reproducible de punta a punta.
- [ ] Documentación de limitaciones y del próximo SDD de auth real.

---

## 10. Definición de terminado

Una entrega se considera cerrada cuando:

- [ ] El contrato API está actualizado y el cliente TS compila.
- [ ] Los tests de integración cubren el flujo del sprint.
- [ ] Hay una prueba de dos navegadores cuando aplica.
- [ ] Ningún DTO o evento expone coordenadas.
- [ ] No hay secretos en el cliente ni en el artefacto.
- [ ] El mock sigue disponible.
- [ ] La demo se puede repetir con reset.
- [ ] El runbook y las limitaciones están documentados.

---

## 11. Docker local/develop

**Principio:** el backend se levanta con Docker desde el Sprint 1. No se espera al deploy para dockerizar.

### Servicios

| Servicio | Imagen / build | Función |
|---|---|---|
| `db` | `postgis/postgis:16-3.4` | PostgreSQL + PostGIS, volumen persistente y healthcheck |
| `migrate` | build del backend, one-shot | Migraciones y seeds de referencia; corre después de `db` healthy |
| `api` | build multi-stage del backend | NestJS, puerto 3000, healthcheck `/health/ready` |
| `web` (opcional) | nginx sirviendo `site/` | Preview local del artefacto estático de las demos |

### Dev vs. producción

- `compose.yml`: imagen de producción, usuario no-root, sin bind mounts.
- `compose.dev.yml`: bind mount del código, `npm run start:dev`, puerto de debug 9229, migraciones al arrancar.
- `.env.example` versionado; `.env` ignorado. Sin secretos en la imagen.
- `depends_on` con `condition: service_healthy`; la API no arranca si PostGIS no está listo.
- `docker compose down -v` borra el volumen y deja la demo limpia.
- `POST /demo/reset` limpia datos de demo sin borrar el volumen.

### Comandos esperados

```bash
cp .env.example .env
docker compose -f compose.yml -f compose.dev.yml up --build
curl http://localhost:3000/health/ready

# frontend web en host
EXPO_PUBLIC_API_URL=http://localhost:3000 npm --prefix demo/expo-demo run web
```

### Validación local

- [ ] `docker compose up` funciona desde un clone limpio, sin Node ni Postgres instalados en el host.
- [ ] Migraciones y seeds son idempotentes; correrlos dos veces no duplica.
- [ ] `/health` y `/health/ready` responden correctamente.
- [ ] Dos navegadores entran, se ven y chatean contra `localhost`.
- [ ] SSE y polling funcionan a través del puerto publicado.
- [ ] `docker compose down -v` + `up` deja la demo reproducible.
- [ ] Los tests de integración corren dentro del contenedor.
- [ ] No hay secretos en la imagen ni en el compose versionado.

### GPS en local

`http://localhost` es contexto seguro y permite geolocalización. Para probar desde un teléfono en la LAN, `http://192.168.x.x` **no** es contexto seguro: usar un túnel HTTPS (Cloudflare Tunnel) o certificados locales. Si no hay HTTPS, la demo debe caer al fallback de zona demo.

**Dependencia:** Docker Desktop debe estar corriendo en la máquina de desarrollo.

---

## 12. Riesgos del plan

| Riesgo | Sprint | Mitigación |
|---|---|---|
| Drift entre contrato y clientes | 0–3 | OpenAPI + cliente generado + gate de drift |
| Fuga de coordenadas | 2–6 | DTO explícito, test de serialización, revisión de eventos |
| Bots duplicados o huérfanos | 2, 5 | Spawn/retiro transaccional, ownership y reset |
| Región mal resuelta o border flip-flop | 2–3 | `ST_Covers`, histéresis, fallback suave, logs |
| SSE con ticket filtrado | 2–4 | Ticket de 30 s, un solo uso, no loggear URL |
| CORS/mixed content | 6 | HTTPS, allowlist, prueba desde Pages |
| Densidad excesiva | 2–3 | Cap de 6 bots por observador |
| Scope creep a auth/push | 4–7 | Lista explícita de simulado y próximo SDD |

---

## 13. Recomendación de arranque

Empezaría por **Sprint 0 + Sprint 1**. Son los que desbloquean todo y no dependen de hosting ni de decisiones de producto. Después, **Sprint 2 y 3** son la primera demo que impresiona: movimiento real y radar vivo. **Sprint 4** cierra el flujo de valor. **Sprint 5** es obligatorio antes de mostrarlo como producto. **Sprint 6** lo pone en una URL pública.

**Auth real, signup/signin y manejo de datos** quedan para el SDD siguiente; este plan usa sesiones demo y deja el seam listo.
