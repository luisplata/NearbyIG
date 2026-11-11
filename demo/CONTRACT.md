# Contrato de demos — NearbyIG

Documento **vinculante**. Si una demo no cumple este contrato completo, no es
entregable, aunque compile y se vea bien. La fuente única de datos es `demo/shared/`;
las apps consumen lo generado y no duplican strings, colores, distancias ni guiones.

- Marca: **NearbyIG**. Chip **DEMO** persistente en todas las pantallas de ambas apps.
- Idioma: español (es-AR), tono del prototipo.
- Alcance: demo no funcional. Sin backend, auth, push, geolocalización real, tiles
  reales, OAuth, persistencia, premium ni referidos.

---

## 1. Fuente única y datasetId

| Archivo | Contenido | Genera |
|---|---|---|
| `shared/fixtures.json` | 10 perfiles, self, timers, guion, filtros, motivos, mapa | `fixtures.dart`, `fixtures.ts` |
| `shared/copy.json` | catálogo plano clave → string es-AR | `copy.dart`, `copy.ts` |
| `shared/design-tokens.json` | color, tipografía, espacio, radios, sombra, breakpoints | `tokens.dart`, `tokens.ts` |
| `shared/photos.json` | especificación de avatar procedural por `photoId` | `photo_map.dart`, `photoMap.ts` |
| `shared/golden/steps.json` | secuencia canónica de acciones | copia a `test/golden/` de ambas apps |

`datasetId = "ds-" + sha256(canonical({fixtures, copy, designTokens, photos})).hex[0..8]`
donde `canonical` ordena claves, no deja espacios y normaliza números. **No** es un
campo editable: sale del contenido. Se muestra en la landing, en "Acerca de" de ambas
apps y lo imprime `node scripts/validate-fixtures.mjs`.

`schemaVersion` (hoy `1`) se muestra junto al datasetId. Tres valores iguales en la
landing y en las dos apps son la prueba de que se está comparando el mismo dataset.

Reglas duras del dataset (validadas por script):

- Prohibido `lat`, `lng`, `latitude`, `longitude` en cualquier nivel. Las posiciones son
  `distanceM` (entero, 200–5000) y `bearingDeg` (entero, 0–359).
- Prohibidas URLs `http(s)` en cualquier string del contrato.
- Prohibidos patrones de secreto (claves de API, claves privadas, config Firebase).
- IDs únicos; `photoId` existente; todo `*Key` resuelve en `copy.json`;
  intenciones y géneros dentro del catálogo; timers exactos.

## 2. Copy

- `copy.json` es un mapa plano `clave → string`. No hay strings visibles fuera del
  catálogo (excepto el datasetId, números y el texto de licencias).
- Claves en `dot.case`, agrupadas por pantalla/prefijo: `common.`, `nav.`, `discovery.`,
  `filters.`, `profile.`, `ping.`, `match.`, `chat.`, `notif.`, `settings.`, `ig.`,
  `privacy.`, `about.`, `safety.`, `a11y.`, `intention.`, `gender.`, `status.`, `bio.`,
  `map.label.`.
- Interpolación con llaves: `{name}`, `{distance}`, `{count}`, `{radius}`. Helper
  `fmt(key, params)` generado en ambos lenguajes.
- Los 8 ítems de "Qué es simulado" son las claves `common.simItems.1` … `common.simItems.8`
  (numeradas para preservar el orden; no se agregan ni se quitan sin actualizar esta tabla).
- `privacy.noHistory` contiene verbatim "sin historial de rutas" y se muestra en la
  pantalla de privacidad de ambas apps.
- `ig.simDisclaimer` ("Simulado: no es verificación real de Instagram") está siempre
  visible en cualquier superficie de Instagram.

## 3. Design tokens

`design-tokens.json` define: 13 colores, familia/sizes/weights/lineHeights, escala de
espaciado, radios, sombra de hoja y breakpoints (`min` 320, `frameMax` 480, `wide` 600).
Los tokens se generan; nunca se escriben colores literales en pantallas.

Paleta: fondo `#09090B`, superficie `#121216`, texto `#F4F4F5`, muted `#A1A1AA`, borde
`#2A2A33`, gradiente `#FF0069 → #7638FA → #3858FA`, acento `#FFD600`, online `#22C55E`,
verificado `#3B82F6`, peligro `#EF4444`.

## 4. Assets y avatares

- **Avatares procedurales**, sin binarios de retratos: gradiente lineal de 2 stops +
  2–3 círculos translúcidos posicionados por `seed` + iniciales centradas.
- Dos **estados de render**, no archivos:
  - `blurred` (default): gradiente al 55 % de opacidad, sin iniciales, overlay de
    superficie al 45 %, icono de candado.
  - `clear` (tras revelación mutua): gradiente pleno, iniciales en peso 600, anillo de
    1 px del color de borde.
- Prohibido `filter: blur` (RNW no garantiza paridad).
- Marca: `icon.svg` del prototipo (verbatim) + PNG 192/512 derivados; fuentes Inter
  400/600 + `OFL.txt`. Ver `shared/assets/*/PROVENANCE.md`.

## 5. Timers (exactos, del dataset)

| Timer | Delay | Se dispara con | Efecto |
|---|---|---|---|
| match | 2500 ms | aceptar un ping | overlay de match |
| typing | 1200 ms | enviar mensaje en chat matcheado | respuesta del guion |
| reveal | 1500 ms | revelar foto propia | el par revela también |
| ping entrante | 3000 ms | primer ping enviado | ping entrante del guion + badge + toast |
| toast | 4000 ms | cualquier toast | se oculta |

Los timers se derivan de acciones, no del reloj de pared. No hay timers al cargar.

## 6. Inventario de pantallas (10) y overlays

| # | Pantalla | Requisito | Contenido mínimo |
|---|---|---|---|
| 1 | Descubrimiento | F-2, F-3 | radar / mapa / lista, radio 500 m–5 km, 4 filtros, contador, leyenda "mapa simulado" |
| 2 | Perfil de otro | F-1, F-4 | foto (blur/clear), intención, distancia, verificado/online, ping, seguridad, bloqueo |
| 3 | Chat | F-5, F-9 | mensajes guionados, typing 1.2 s, revelar foto, bloqueo |
| 4 | Pings | F-4, F-5 | bandeja, aceptar / rechazar, estado vacío |
| 5 | Notificaciones | F-6 | badge, eventos, marcar leído / todo leído, "sin push real" |
| 6 | Ajustes | F-1, F-7, F-8, F-12 | perfil propio, intención, Instagram (3 estados), fantasma, reiniciar demo |
| 7 | Privacidad | F-11 | `privacy.noHistory` verbatim, sin ubicación real, sin persistencia |
| 8 | Acerca de | F-15, SC-8 | marca, datasetId, schemaVersion, hoja "Qué es simulado" (8 ítems) |
| 9 | Seguridad / reporte | F-10 | motivos, envío simulado, confirmación |
| 10 | Bloqueados | F-10 | lista, desbloquear, estado vacío |

Overlays (sobre la pantalla actual, `Stack` absoluto, sin router): `profile`, `chat`,
`notifications`, `filters`, `settings`, `about`, `safety`, `blocked`, `privacy`.

**No existe** pantalla, tab, modelo, campo ni analítica de historial de rutas,
encuentros o visitas. Tampoco hay onboarding de 7 pasos, premium, referidos ni PWA
install.

## 7. Navegación, reset y determinismo

- Estado en memoria (`view` + `overlay`). Sin router, sin deep links, sin URLs con
  estado. La URL nunca cambia; refrescar sirve el `index.html` del subdirectorio.
- "Reiniciar demo" (`RESET`) vuelve al estado inicial completo — vistas, filtros, pings,
  match, chat, notificaciones, revelaciones, bloqueos, fantasma, verificación — y
  cancela todos los timers.
- Refresh = estado inicial: sin `localStorage`, `sessionStorage`, cookies ni IndexedDB.
- La semántica completa vive en `shared/state-machine.md`; es la norma, no una guía.

## 8. Diferencias permitidas entre apps (solo renderizado)

| Diferencia | Permitida | Por qué |
|---|---|---|
| Antialiasing / rasterizado de texto y bordes | Sí | CanvasKit vs navegador/DOM |
| Scroll nativo (overscroll, barra) | Sí | Plataforma |
| Anuncio de semántica en Flutter web | Sí | CanvasKit expone el árbol semántico cuando el usuario lo pide |
| Animación de radar (canvas vs SVG) | Sí, misma geometría y período 6 s | Misma proyección, distinto motor |
| Cualquier diferencia funcional (timers, copy, orden, estado, datasetId) | **No** | Es un defecto del contrato |

## 9. Checklist de paridad (15 puntos, vinculante)

| # | Punto | Evidencia esperada (idéntica en ambas apps) |
|---|---|---|
| 1 | Perfil + 4 intenciones | Elegir "Actividades" se refleja en el perfil y en el filtro por defecto |
| 2 | Radar / mapa / lista | 10 puntos, mismas distancias, orden asc, leyenda "mapa simulado", reduced-motion estático |
| 3 | Radio + 4 filtros | 500 m deja solo ≤ 500 m; combinación imposible → vacío + "Limpiar filtros" |
| 4 | Ping | "Enviado" e inhabilitado al segundo intento; entrante a 3.0 s; badge sube |
| 5 | Match + chat | Aceptar → match a 2.5 s → chat; typing 1.2 s; respuesta guionada; rechazar borra el ping |
| 6 | Notificaciones | Badge = 1, toast 4.0 s, "marcar todo leído" limpia el badge |
| 7 | Instagram + verificación | 3 estados ciclables, disclaimer visible, sin OAuth |
| 8 | Fantasma / pausa | Banner persistente y pings deshabilitados |
| 9 | Blur + revelación | Reveal propio → el par a 1.5 s; sin reveal propio el otro sigue blurred |
| 10 | Bloqueo + reporte | Desaparece de las 3 vistas, chat cerrado, lista de bloqueados + desbloquear |
| 11 | Sin historial | Sin tab/pantalla/campos de historial; `privacy.noHistory` verbatim |
| 12 | Reset + refresh | Tras flujo completo → estado inicial; refresh idéntico; sin timers vivos |
| 13 | Responsive + a11y | 320/360/480/768/1440 px sin overflow; labels con nombre y distancia; foco visible; ≥ 44 px |
| 14 | Sin red | DevTools Network sin dominios externos (ni gstatic, ni Google Fonts) |
| 15 | Divulgación | Chip DEMO persistente + hoja "Qué es simulado" con 8 ítems |

**Procedimiento lado a lado**: abrir landing + `/flutter/` + `/expo/` en tres pestañas,
confirmar el mismo `schemaVersion` + `datasetId`, y recorrer 1 → 15 en ambas demos con
la misma secuencia de acciones. La secuencia canónica está en
`shared/golden/steps.json` y su digest esperado en `shared/golden/expected.json`.

## 10. Generados y anti-drift

| Generado | Ruta Flutter | Ruta Expo |
|---|---|---|
| tokens | `lib/generated/tokens.dart` | `src/generated/tokens.ts` |
| fixtures | `lib/generated/fixtures.dart` | `src/generated/fixtures.ts` |
| copy | `lib/generated/copy.dart` | `src/generated/copy.ts` |
| photoMap | `lib/generated/photo_map.dart` | `src/generated/photoMap.ts` |
| dataset | `lib/generated/dataset.dart` | `src/generated/dataset.ts` |

Más `landing/generated/dataset.js`, las copias de `assets/brand`, `assets/fonts` y
`test/golden/`. Todos los generados son byte-estables (LF, claves ordenadas, sin
timestamps) y se verifican así:

```bash
node scripts/validate-fixtures.mjs
node scripts/sync-demo-assets.mjs --check   # falla si un generado difiere de lo commiteado
git diff --exit-code
```

Editar a mano un generado es un error de proceso: el gate falla antes de cualquier build.

## 11. Higiene del artefacto

`scripts/lib/denylist.mjs` es la lista única, aplicada por el sync y por el ensamblado
del sitio (case-insensitive, por nombre y por extensión):

- `*.zip`, `*.keystore`, `*.jks`, `*.p12`, `*.pem`, `*.map`
- `.env`, `.env.*`
- `google-services.json`, `GoogleService-Info.plist`, `firebase*.json`
- cualquier segmento `node_modules/`

Hosts prohibidos en el texto del artefacto: `gstatic.com`, `googleapis.com`,
`firebase*`, `unsplash.com`, `instagram.com`, `facebook.com`, `cdn.*`.

Patrones de secreto prohibidos: claves `AIza…`, `BEGIN … PRIVATE KEY`, `private_key`,
`client_secret`, `apiKey` con valor.

## 12. Base path y rutas

| Contexto | Flutter `--base-href` | `EXPO_BASE_URL` | Landing |
|---|---|---|---|
| Sitio de proyecto (`/NearbyIG`) | `/NearbyIG/flutter/` | `/NearbyIG/expo` | `./flutter/`, `./expo/` |
| Sitio de usuario | `/flutter/` | `/expo` | `./flutter/`, `./expo/` |

Flutter exige barra inicial y final; Expo exige barra inicial y prohíbe la final. Ni las
apps ni la landing hardcodean el host. `/`, `/flutter/` y `/expo/` son directorios con
`index.html`: no dependen de rewrites ni de rutas profundas.
