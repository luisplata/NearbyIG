# Contrato de demos — NearbyIG

Documento **vinculante**. Si una demo no cumple este contrato completo, no es
entregable, aunque compile y se vea bien. La fuente única de datos es `demo/shared/`;
las apps consumen lo generado y no duplican strings, colores, distancias ni guiones.

- Marca visible: **Nearby Social Club**, con slogan **Cowork Café**. El repo, las URLs
  (`/NearbyIG`, `/expo/`, `/flutter/`), el bundle id `com.nearbyig.app`, el slug y los
  identificadores técnicos no cambian.
- Label **DEMO**: chip estático en "Acerca de" de Expo, en el header y el footer de la
  landing y en el header de Flutter (referencia). El header de Expo no lleva chip: lleva
  el switch de visibilidad (fantasma).
- Idioma: español (es-AR), tono del prototipo.
- Alcance: demo no funcional. Sin backend, auth, push, geolocalización real, OAuth,
  persistencia, premium ni referidos. El radar de **Expo** usa un basemap real de **un
  único host** (`tiles.openfreemap.org`, OpenFreeMap con MapLibre GL JS, sin key ni
  cuenta); Flutter (referencia congelada) mantiene el mapa ilustrado.

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

`schemaVersion` (hoy `2`) se muestra junto al datasetId. Tres valores iguales en la
landing y en las dos apps son la prueba de que se está comparando el mismo dataset.

Reglas duras del dataset (validadas por script):

- Prohibido `lat`, `lng`, `latitude`, `longitude` en cualquier nivel. Las posiciones son
  `distanceM` (entero, 200–5000) y `bearingDeg` (entero, 0–359). El centro del basemap de
  Expo es una constante de código, no un dato del contrato (ver §11).
- Prohibidas URLs `http(s)` en cualquier string del contrato.
- Prohibidos patrones de secreto (claves de API, claves privadas, config Firebase).
- IDs únicos; `photoId` existente; todo `*Key` resuelve en `copy.json`;
  intenciones y géneros dentro del catálogo; timers exactos.
- Exactamente **3 intenciones** en `filters.intentions`; cada una la usan al menos dos
  perfiles. El orden del array es el orden del catálogo y el que serializa la proyección
  golden: cambiarlo mueve los digests de paridad.
- `self` y cada perfil tienen un catálogo cerrado de claves. Un campo `interests`,
  `hobbies`, `tags` o cualquier otro desconocido es un error: los gustos son copy libre
  dentro de `status.*` y `bio.*`, no datos.

## 2. Copy

- `copy.json` es un mapa plano `clave → string`. No hay strings visibles fuera del
  catálogo (excepto el datasetId, números y el texto de licencias).
- Claves en `dot.case`, agrupadas por pantalla/prefijo: `common.`, `nav.`, `discovery.`,
  `filters.`, `profile.`, `ping.`, `match.`, `chat.`, `notif.`, `settings.`, `ig.`,
  `privacy.`, `about.`, `safety.`, `a11y.`, `intention.`, `gender.`, `status.`, `bio.`,
  `map.label.`, `landing.`.
- Interpolación con llaves: `{name}`, `{distance}`, `{count}`, `{radius}`. Helper
  `fmt(key, params)` generado en ambos lenguajes.
- Los 8 ítems de "Qué es simulado" son las claves `common.simItems.1` … `common.simItems.8`
  (numeradas para preservar el orden; no se agregan ni se quitan sin actualizar esta tabla).
  `common.simItems.1` habla sólo de datos del usuario y `common.simItems.5` describe el
  mapa de referencia: **ningún** ítem puede afirmar que no hay red o que no hay tiles.
- Basemap: `discovery.mapAttribution` (`© OpenFreeMap · © OpenMapTiles · datos de
  OpenStreetMap`) es la atribución visible cuando hay tiles reales; es texto plano, sin
  URL ni control. `discovery.mapNote` aclara el centro fijo y las posiciones de guion.
  `discovery.mapLegend` ("mapa simulado") queda **sólo** para el fallback ilustrado de
  Expo y para Flutter: el validador sigue exigiendo `/simulado/i`.
- Posicionamiento: `about.brand` es el nombre visible (**Nearby Social Club**) y
  `landing.eyebrow` y `about.club` contienen el mismo slogan (**Cowork Café**).
  `about.positioning` explica el club. Es estilo y posicionamiento: **no** cambia el
  nombre del repo, las URLs, el bundle id, el slug, el icono ni `schemaVersion`, y no
  agrega pantallas ni acciones de club.
- `privacy.noHistory` contiene verbatim "sin historial de rutas" y se muestra en la
  pantalla de privacidad de ambas apps.
- `ig.simDisclaimer` ("Simulado: no es verificación real de Instagram") está siempre
  visible en cualquier superficie de Instagram.

## 3. Design tokens

`design-tokens.json` define: 14 colores, familia/sizes/weights/lineHeights, escala de
espaciado, radios, sombra de hoja y breakpoints (`min` 320, `frameMax` 480, `wide` 600).
Los tokens se generan; nunca se escriben colores literales en pantallas.

Paleta: fondo `#09090B`, superficie `#121216`, texto `#F4F4F5`, muted `#A1A1AA`, borde
`#2A2A33`, gradiente `#FF0069 → #7638FA → #3858FA`, acento `#FFD600`, acento cálido
`#E8B27A`, online `#22C55E`, verificado `#3B82F6`, peligro `#EF4444`.

El acento cálido (`color.accentWarm`) es el único trazo del estilo café/cowork: se usa en
el eyebrow del hero de la landing y en las frases de "Acerca de" de ambas apps. No cambia
el tema oscuro, no introduce un tema claro y no reemplaza al acento de marca (`accent`),
que sigue marcando pestaña activa, chip DEMO y badges.

## 4. Assets y avatares

- **Avatares procedurales**, sin binarios de retratos: gradiente lineal de 2 stops +
  2–3 círculos translúcidos posicionados por `seed` + iniciales centradas.
- Nota de contrato: la spec habla de “retratos sintéticos y variantes pre-desenfocadas”.
  La decisión A1 del design las implementa como avatares procedurales con dos estados de
  render (no como PNG/SVG por perfil); es la lectura vinculante de ese requisito. No hay
  binarios de retratos en el repo ni en el artefacto.
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
| 1 | Descubrimiento | F-2, F-3 | lista cercana o radar sobre basemap real (con la ilustración como fallback), radio 500 m–5 km, 4 filtros, contador, atribución del proveedor cuando hay tiles o leyenda "mapa simulado" cuando manda la ilustración |
| 2 | Perfil de otro | F-1, F-4 | foto (blur/clear), intención, distancia, verificado/online, ping, seguridad, bloqueo |
| 3 | Chat | F-5, F-9 | mensajes guionados, typing 1.2 s, revelar foto, bloqueo |
| 4 | Pings | F-4, F-5 | bandeja con recibidos (aceptar / rechazar) y enviados con estado “Enviado / esperando respuesta”, sin segunda acción de envío, estado vacío |
| 5 | Notificaciones | F-6 | badge, eventos, marcar leído / todo leído, abrir el centro marca todo leído, "sin push real" |
| 6 | Ajustes | F-1, F-7, F-8, F-12 | perfil propio, intención, Instagram (3 estados), fantasma, reiniciar demo |
| 7 | Privacidad | F-11 | `privacy.noHistory` verbatim, sin ubicación real, sin persistencia |
| 8 | Acerca de | F-15, SC-8 | marca, datasetId, schemaVersion, hoja "Qué es simulado" (8 ítems) |
| 9 | Seguridad / reporte | F-10 | motivos, envío simulado, confirmación |
| 10 | Bloqueados | F-10 | lista, desbloquear, estado vacío |

Overlays (sobre la pantalla actual, `Stack` absoluto, sin router): `profile`, `chat`,
`notifications`, `filters`, `settings`, `about`, `safety`, `blocked`, `privacy`.

En **Expo** la vista `map` es interna/reservada: no se expone en la navegación y, si el
estado la setea programáticamente, renderiza la misma composición radar-sobre-mapa. La
pantalla 1 de Expo es esa composición única más la lista.

La composición de Expo, de abajo hacia arriba: mapa ilustrado (`MapCanvas`, **siempre**
montado), basemap real de OpenFreeMap (sólo web, no interactivo, sin controles) cuando
cargó, anillos/cruz/barrido de 6 s, **una sola** capa de puntos, y en la esquina inferior
derecha la atribución `discovery.mapAttribution` (texto, sin URL, no focusable). Si el
basemap falla —sin WebGL, error, pérdida de contexto o timeout de 8 s— la composición no
cambia: queda la ilustración y vuelve la leyenda "mapa simulado".

**No existe** pantalla, tab, modelo, campo ni analítica de historial de rutas,
encuentros o visitas. Tampoco hay onboarding de 7 pasos, premium, referidos ni PWA
install.

## 7. Navegación, reset y determinismo

- Estado en memoria (`view` + `overlay`). Sin router, sin deep links, sin URLs con
  estado. La URL nunca cambia; refrescar sirve el `index.html` del subdirectorio.
- La **lista es la vista inicial** en ambas apps: al cargar, el tab activo es `Lista` y
  los 10 perfiles aparecen ordenados por distancia ascendente.
- **Expo** tiene cuatro tabs en este orden: **Lista → Radar → Pings → Perfil**. No hay
  tab Mapa: Radar es una única composición con basemap real de fondo (la ilustración hace
  de fallback), anillos, barrido de 6 s y una capa de puntos. Pings y Perfil abren
  overlays sin cambiar la vista. El valor `map` sigue reservado en la máquina de estados:
  si se setea, Expo renderiza la misma composición radar-sobre-mapa, nunca un cuerpo
  sólo-mapa.
- **Flutter** se mantiene como referencia congelada y conserva su barra de cinco tabs
  (Lista → Radar → Mapa → Pings → Perfil). Esa diferencia de presentación es la
  permitida en §8.
- La barra inferior no tiene tabs de historial, encuentros ni visitas.
- "Reiniciar demo" (`RESET`) vuelve al estado inicial completo — vistas, filtros, pings,
  match, chat, notificaciones, revelaciones, bloqueos, fantasma, verificación — y
  cancela todos los timers.
- Refresh = estado inicial: sin `localStorage`, `sessionStorage`, cookies ni IndexedDB.
- La semántica completa vive en `shared/state-machine.md`; es la norma, no una guía.

## 8. Diferencias permitidas entre apps (Expo-first)

| Diferencia | Permitida | Por qué |
|---|---|---|
| Antialiasing / rasterizado de texto y bordes | Sí | CanvasKit vs navegador/DOM |
| Scroll nativo (overscroll, barra) | Sí | Plataforma |
| Anuncio de semántica en Flutter web | Sí | CanvasKit expone el árbol semántico cuando el usuario lo pide |
| Animación de radar (canvas vs SVG) | Sí, misma geometría y período 6 s | Misma proyección, distinto motor |
| Glifos: fuente MaterialIcons (Flutter) vs SVG embebido (Expo) | Sí | Mismos íconos Material, distinto empaquetado; sin fuentes de íconos remotas |
| Carga de fuente: Inter bundleada al compilar (Flutter) vs `expo-font` con gate de render (Expo) | Sí | Expo no renderiza hasta tener la fuente para evitar FOUT |
| Switch de ajustes/filtros | Sí | Material 3 vs control nativo de RNW |
| Foco visible: highlight de Material vs borde `accent` explícito | Sí | Mismo criterio (foco visible), distinto mecanismo |
| Navegación y descubrimiento: Expo con 4 tabs y radar sobre mapa; Flutter (referencia) con 5 tabs y radar/mapa separados | Sí | Presentación Expo-first descripta en §7; estado, timers, copy y datasetId siguen compartidos |
| Mapa de fondo: Expo monta un basemap real (OpenFreeMap + MapLibre, sin key) con la ilustración como fallback; Flutter (referencia) mantiene el mapa ilustrado | Sí | La composición, la proyección de puntos, el barrido de 6 s y el dataset son los mismos; cambia el motor de dibujo del fondo y la atribución del proveedor |
| Cualquier diferencia funcional no listada (timers, copy compartido, orden de datos, estado, datasetId) | **No** | Es un defecto del contrato |

## 9. Checklist de comportamiento (15 puntos; Expo-first)

| # | Punto | Evidencia esperada (idéntica salvo diferencias de §8) |
|---|---|---|
| 1 | Perfil + 3 intenciones | Elegir "Actividades" se refleja en el perfil y en el filtro por defecto |
| 2 | Radar sobre mapa / lista | La lista abre por defecto; en Expo, Radar compone el basemap real (o la ilustración si falla), anillos, barrido de 6 s y 10 puntos con las mismas distancias, orden asc, atribución OpenFreeMap/OpenMapTiles/OSM cuando hay tiles, leyenda "mapa simulado" en el fallback y reduced-motion estático; no hay tab Mapa. Flutter (referencia) conserva radar y mapa ilustrados separados |
| 3 | Radio + 4 filtros | 500 m deja solo ≤ 500 m; combinación imposible → vacío + "Limpiar filtros" |
| 4 | Ping | "Enviado" e inhabilitado al segundo intento; el enviado aparece en la bandeja con estado pendiente; entrante a 3.0 s; badge sube |
| 5 | Match + chat | Aceptar → match a 2.5 s → chat; typing 1.2 s; respuesta guionada; rechazar borra el ping |
| 6 | Notificaciones | Badge = 1, toast 4.0 s, abrir el centro limpia el badge (`MARK_NOTIFICATIONS_READ`), "marcar todo leído" también |
| 7 | Instagram + verificación | 3 estados ciclables, disclaimer visible, sin OAuth |
| 8 | Fantasma / pausa | Banner persistente y pings deshabilitados |
| 9 | Blur + revelación | Reveal propio → el par a 1.5 s; sin reveal propio el otro sigue blurred |
| 10 | Bloqueo + reporte | Desaparece de las 3 vistas, chat cerrado, lista de bloqueados + desbloquear |
| 11 | Sin historial | Sin tab/pantalla/campos de historial; `privacy.noHistory` verbatim |
| 12 | Reset + refresh | Tras flujo completo → estado inicial (vista `lista`); refresh idéntico; sin timers vivos |
| 13 | Responsive + a11y | 320/360/480/768/1440 px sin overflow; labels con nombre y distancia; foco visible; ≥ 44 px |
| 14 | Red contenida | DevTools Network en Radar: **un único** host externo, `tiles.openfreemap.org` (estilo local, TileJSON, tiles, glifos; sin sprite, sin key ni cookie). La Lista y la landing no piden tiles: el primer pedido ocurre al abrir Radar |
| 15 | Divulgación | Label DEMO en About de Expo (visible sin abrir la hoja), header y footer de la landing, y header de Flutter; hoja "Qué es simulado" con 8 ítems |

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

Más `landing/generated/dataset.js`, `landing/generated/tokens.css`, las copias de
`assets/brand`, `assets/fonts` y `test/golden/`. Todos los generados son byte-estables
(LF, claves ordenadas, sin timestamps) y se verifican así:

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
`eascdn.net`, `firebase*`, `unsplash.com`, `instagram.com`, `facebook.com`, `cdn.*`.

**Regla posicional de hosts.** El artefacto tiene literales de host que no son pedidos
(namespaces `xmlns`, licencias, enlaces dentro de mensajes de error de las librerías);
negar todo host que no sea uno solo es inviable. Lo que sí se garantiza es que **un
único host sea pedible**, y `assemble-site --strict` exige el conjunto exacto:

- Permitido en posición pedible: **sólo** `tiles.openfreemap.org` (case-insensitive, sin
  subdominios). `node scripts/assemble-site.mjs --strict site` falla si falta —el mapa no
  llegó al bundle— o si aparece un segundo host pedible.
- Posiciones pedibles (`scripts/lib/request-hosts.mjs`): `fetch(`/`import(`/`new Worker(`/
  `new Image(`, `src=`/`href=`/`srcset=`/`poster=`/`xlink:href=`, `url(`, `@import`,
  `style:`/`tiles:`/`sprite:`/`glyphs:`/`url:`.
- En posición **no** pedible se toleran sólo los hosts reales del artefacto, cada uno con
  su razón escrita en `BENIGN_TEXT_HOSTS` y su test: `www.w3.org` (namespace SVG),
  `github.com` y `scripts.sil.org` (licencia OFL), `necolas.github.io` (comentario del
  reset de react-native-web), `react.dev`, `expo.dev`, `api.flutter.dev`,
  `docs.flutter.dev`, `flutter.dev`, `pub.dev` (enlaces dentro de mensajes de error) y
  `maplibre.org`, `maplibre.invalid`, `wiki.openstreetmap.org` (mensajes de MapLibre; el
  `.invalid` es una base ficticia que nunca se resuelve). El mismo host en `src=` o
  `fetch(` falla igual.
- Cualquier otro host es un finding en cualquier posición: obliga a revisarlo y a
  documentar la decisión antes de publicar.

La auditoría imprime `host pedible: <host> (n)`; pre-basemap el conjunto era vacío.

Excepciones acotadas (cada una cubierta por `scripts/lib/denylist.test.mjs`):

1. **Fallbacks del loader de Flutter.** `flutter.js`, `flutter_bootstrap.js`,
   `flutter_service_worker.js` y `main.dart.js` embeben dos defaults del engine:
   `https://www.gstatic.com/flutter-canvaskit` (el loader lo concatena con la revisión;
   el engine ya trae la revisión de 40 hex en el path) y `https://fonts.gstatic.com/s/`
   (la Inter va bundleada; el default sólo se usaría para glifos ausentes). CanvasKit se
   sirve local vía `canvasKitBaseUrl`. Se ignoran **sólo esas formas exactas**: el
   prefijo de CanvasKit tiene que estar entre comillas o seguido de `/revisión/`, y la
   fuente tiene que terminar en la cadena. Un pedido real
   (`https://fonts.gstatic.com/s/inter/v13/x.woff2`) no coincide y bloquea el artefacto.
2. **Código muerto de Expo Go.** El bundle web de Expo incluye, desde `expo-asset`
   (`AssetSources.js`), `https://classic-assets.eascdn.net/~assets/${…}` dentro de
   `if (NativeModules['ExponentKernel'])`. `ExponentKernel` sólo existe en el cliente
   nativo de Expo Go: en web la rama nunca se ejecuta, así que no es un request. Se ignora
   únicamente esa forma exacta (prefijo de template literal con `${`) y sólo en
   `expo/_expo/static/js/web/*.js`; cualquier otro uso de `eascdn.net` falla.
3. **Links de atribución y logo de MapLibre.** El chunk `maplibre-gl-*.js` embebe dos
   anchors por defecto: `customAttribution` del control de atribución y `href` del
   control de logo. La demo crea el mapa con `attributionControl: false` y
   `maplibreLogo: false`, así que ninguno se monta: son `href` de código muerto, no
   pedidos. Se recortan **esas dos formas exactas** y sólo dentro del chunk de MapLibre
   (`MAPLIBRE_DEAD_CODE`); el mismo host en otro archivo, o con otro path dentro del
   chunk, sigue bloqueando el artefacto.

El basemap no pide estilos remotos: el estilo es local (`src/map/style.ts`) y sus dos
URLs —TileJSON y glifos— apuntan al host permitido. No hay `sprite` ni capas de íconos,
y no se usa `setRTLTextPlugin`.

**Worker de MapLibre.** Metro no emite `maplibre-gl-worker.mjs` en el export, así que
`npm ci` corre `scripts/copy-maplibre-worker.mjs` (postinstall) y deja
`public/maplibre-gl-worker.js`; `MapBasemap` lo apunta con `setWorkerUrl` contra
`document.baseURI`. Sin ese archivo el navegador pide un 404, el mapa queda en `loading`
y cae al SVG: `assemble-site --strict` falla si falta el chunk o el worker.

**Centro de demo.** `DEMO_CENTER` (`src/map/basemap.ts`) es una constante de código: el
mismo viewport para todos los visitantes, sin geolocalización, IP, cookies ni
identificadores. La prohibición de `lat`/`lng`/`latitude`/`longitude` aplica a
`demo/shared/*.json` (el contrato), **no** a este módulo: no es un dato del dataset y
no debe moverse a los JSON.

Cualquier otro host o URL externa, en cualquier archivo, sigue bloqueando el artefacto.

Patrones de secreto prohibidos: claves `AIza…`, `BEGIN … PRIVATE KEY`, `private_key`,
`client_secret`, `apiKey` con valor.

Además del escaneo de archivos, `assemble-site.mjs --strict` falla si falta alguna de
las tres `index.html`, si la landing perdió `noindex` o los enlaces relativos, o si su
`generated/dataset.js` no coincide con el `datasetId` recalculado del contrato. Es el
mismo comando que corre el workflow antes de subir el artefacto.

## 12. Base path y rutas

| Contexto | Flutter `--base-href` | `EXPO_BASE_URL` | Landing |
|---|---|---|---|
| Sitio de proyecto (`/NearbyIG`) | `/NearbyIG/flutter/` | `/NearbyIG/expo` | `./flutter/`, `./expo/` |
| Sitio de usuario | `/flutter/` | `/expo` | `./flutter/`, `./expo/` |

Flutter exige barra inicial y final; Expo exige barra inicial y prohíbe la final. Ni las
apps ni la landing hardcodean el host. `/`, `/flutter/` y `/expo/` son directorios con
`index.html`: no dependen de rewrites ni de rutas profundas.

## 13. Publicación

Un único workflow (`.github/workflows/pages.yml`) publica un único artefacto de Pages:
landing en `/`, Flutter en `/flutter/`, Expo en `/expo/`. `configure-pages` resuelve el
base path antes de los builds; lectura del sitio con `pages: read` a nivel workflow,
mientras `pages: write` e `id-token: write` viven **sólo** en el job de deploy.
Validación, drift, tests, builds y auditoría del artefacto bloquean el upload (nunca hay
deploy parcial). El workflow **no habilita Pages**.

Pages está habilitado con `Source: GitHub Actions` y el primer deploy ya se completó.
Si el sitio se deshabilita, el job `build` falla en `configure-pages`, a propósito.
Pasos, verificación y rollback:
[`../docs/pages-handoff.md`](../docs/pages-handoff.md).

## 14. Evidencia de verificación (paridad 15 puntos)

Los puntos se verifican con la golden compartida (mismos digests en Dart y TS), los
tests de cada app y la auditoría del artefacto. La columna “Visual” marca lo que exige
un navegador real y queda pendiente hasta la revisión con DevTools + lector de pantalla.

| # | Automatizado | Visual |
|---|---|---|
| 1 | golden (`SET_SELF_INTENTION`), 3 intenciones válidas en `validate-fixtures` | cambio reflejado en perfil y filtro |
| 2 | Flutter: radar con 10 puntos accesibles y reduced-motion estático; Expo: `discoveryBody.test.ts` mapea `radar` y `map` a la misma composición, `mapStatus.test.ts` fija idle→loading→ready|failed y `basemap.test.ts` la derivación de zoom | mismo orden/distancias en lista y radar de Expo; basemap real visible y atribución legible |
| 3 | `selectors.test.ts` / `selectors_test.dart`: radio 500 m, filtros y vacío | CTA “Limpiar filtros” en ambas |
| 4 | golden timers + widget test de ping enviado/deshabilitado + bandeja con el enviado y su estado | ping entrante a 3.0 s en Expo |
| 5 | golden (`ACCEPT_PING`, `SEND_MESSAGE`, `REJECT_PING`) | overlay de match a 2.5 s |
| 6 | golden `MARK_NOTIFICATIONS_READ` + widget test “abrir el centro limpia el badge” | badge y toast de 4.0 s |
| 7 | `SET_VERIFICATION` en golden; disclaimer obligatorio en `validate-fixtures` | 3 estados ciclables |
| 8 | `pingBlockedReason('paused')`; golden `TOGGLE_GHOST`; `visibility.test.ts` deshabilita el switch con overlay profile/chat | switch del header y banner persistentes |
| 9 | `avatarState` / `isRevealed`; golden `REVEAL_PHOTO` | reveal del par a 1.5 s |
| 10 | golden `BLOCK_PROFILE` / `UNBLOCK_PROFILE`; `visibleProfiles` excluye bloqueados | desaparición en lista y radar |
| 11 | sin pantalla/modelo de historial; `privacy.noHistory` obligatorio | copy visible en privacidad |
| 12 | widget test de reset; `store.test.ts` cancela timers | refresh en el navegador |
| 13 | 360×640 sin overflow; labels con nombre + distancia + badges | 320/480/768/1440 y foco con teclado |
| 14 | denylist de hosts por posición en el artefacto (`request-hosts.test.mjs`: allowlist exacta + benignos; `gstatic`/`eascdn`/MapLibre con sus formas exactas); cero storage/geolocation en el código (`privacy.test.ts`); `lang="es"` en los tres documentos | Network de Radar con un único host externo |
| 15 | `brand.test.mjs` (marca, slogan, DEMO en landing) + `copy.test.ts`; About con label DEMO y 8 ítems | label DEMO en About, landing header/footer y header Flutter |

Automatizado y reproducible:

```bash
node scripts/validate-fixtures.mjs
node scripts/sync-demo-assets.mjs --check
npm run test:scripts
npm --prefix demo/expo-demo run typecheck && npm --prefix demo/expo-demo run test
(cd demo/flutter-demo && flutter analyze && flutter test)
PAGES_BASE_PATH="" node scripts/assemble-site.mjs --strict site
```


