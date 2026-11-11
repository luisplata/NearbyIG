# NearbyIG demos — runbook

Dos demos mock del flujo NearbyIG (Flutter web y Expo web) más una landing, todas
alimentadas por un único contrato compartido en `demo/shared/` y publicadas como un
solo artefacto de GitHub Pages.

Todo es simulado: sin backend, sin auth, sin push, sin geolocalización real, sin tiles
reales, sin OAuth, sin persistencia, sin premium ni referidos. Ver `CONTRACT.md`.

## Layout

| Path | Qué contiene |
|---|---|
| `demo/shared/` | Contrato: `fixtures.json`, `copy.json`, `design-tokens.json`, `photos.json`, `state-machine.md`, `golden/steps.json`, assets de marca y fuentes |
| `demo/landing/` | Landing estática (raíz del sitio) |
| `demo/flutter-demo/` | Demo Flutter web (consume `lib/generated/`) |
| `demo/expo-demo/` | Demo Expo web (consume `src/generated/`) |
| `demo/CONTRACT.md` | Inventario de pantallas, timers, diferencias permitidas y checklist de paridad (15 puntos) |
| `scripts/` | Tooling Node: validación, sync de assets/generados, ensamblado del sitio |

## Requisitos

- Node 22.18 o superior (probado con 22.18.0 / npm 10.9.3). Los scripts usan solo
  builtins de Node; `@resvg/resvg-js` es la única dependencia y solo se usa para
  rasterizar el icono de marca.
- Flutter 3.41.2 en el `PATH` (solo para `demo/flutter-demo`).
- Sin servicios externos, sin variables de entorno, sin secretos.

## Setup y verificación del contrato

```bash
npm install                                  # instala @resvg/resvg-js
node scripts/validate-fixtures.mjs           # esquema + reglas duras; imprime el datasetId
node scripts/sync-demo-assets.mjs            # regenera assets y bindings de ambas apps
node scripts/sync-demo-assets.mjs --check    # falla si un generado quedó desactualizado
git diff --exit-code                         # gate de drift (lo mismo que corre CI)
```

`sync` es idempotente: la segunda ejecución no produce diff. Si `demo/flutter-demo/`,
`demo/expo-demo/` o `demo/landing/` todavía no existen, los targets ausentes se
informan como `skipped` y el resto se genera igual.

Flags útiles:

```bash
node scripts/sync-demo-assets.mjs --target flutter    # solo Flutter
node scripts/sync-demo-assets.mjs --target expo       # solo Expo
node scripts/sync-demo-assets.mjs --target landing    # solo landing
node scripts/sync-demo-assets.mjs --no-raster         # reusa los PNG de marca ya commiteados
```

## Golden de paridad

`demo/shared/golden/expected.json` tiene un único productor: el dumper de Dart.
Se corre desde `demo/flutter-demo`, después del sync, y la demo Expo compara sus
digests contra ese archivo.

```bash
node scripts/sync-demo-assets.mjs
(cd demo/flutter-demo && dart run tool/dump_golden.dart)   # regenera shared/golden/expected.json
node scripts/sync-demo-assets.mjs                          # copia el expected.json a test/golden/
(cd demo/flutter-demo && flutter test test/reducer_golden_test.dart)
```

## Apps

```bash
# Flutter web (desarrollo)
(cd demo/flutter-demo && flutter run -d chrome --web-port 4180)

# Flutter web (build de producción; --base-href con barra inicial y final)
(cd demo/flutter-demo && flutter pub get && flutter analyze && flutter test)
(cd demo/flutter-demo && flutter build web --release --pwa-strategy=none --base-href "/flutter/")

# Expo web
npm --prefix demo/expo-demo ci
npm --prefix demo/expo-demo run typecheck
npm --prefix demo/expo-demo run test          # golden de paridad (Vitest) + selectores + formato
(cd demo/expo-demo && EXPO_BASE_URL="" npx expo export --platform web --output-dir dist --clear)
```

Tests del tooling Node (denylist del artefacto, allowlist acotada del loader de Flutter):

```bash
npm run test:scripts
```

> **Git Bash / MSYS**: `EXPO_BASE_URL=/expo` y `--base-href "/flutter/"` se reescriben a
> rutas de Windows. Prefijá el comando con `MSYS_NO_PATHCONV=1` (o usá PowerShell/cmd).
> El export imprime `Using (experimental) base path: ...`; verificá que diga `/expo` y no
> una ruta `C:/Program Files/...`.

El export de Expo es determinista: el mismo commit produce el mismo hash de bundle. La
demo navega por estado (sin `expo-router`): la URL nunca cambia y refrescar siempre sirve
`/expo/index.html`.

## Sitio local (raíz + /flutter/ + /expo/)

```bash
node scripts/assemble-site.mjs                  # ensambla site/ con la landing, Flutter y Expo
node scripts/assemble-site.mjs --check-only     # audita site/ (denylist, hosts, index.html)
node scripts/assemble-site.mjs --check-only --strict   # además trata un target faltante como error
npx serve@14 site -l 4173                       # preview: http://localhost:4173/
```

`--check-only` sin `--strict` devuelve 0 cuando el único problema es un target que
todavía no se construyó (lo lista como `pending`), y devuelve 1 si encuentra archivos
de la denylist (ZIP, keystore, `.env`, config Firebase, `node_modules`, `*.map`),
hosts prohibidos o secretos. `--strict` además exige las tres `index.html`, la landing
con `noindex`, enlaces relativos y el `datasetId` del contrato.

## Landing

`demo/landing/` no tiene texto visible ni colores escritos a mano:

| Archivo | Rol |
|---|---|
| `index.html` | estructura y claves `data-copy` / `data-copy-alt` |
| `styles.css` | layout; sólo consume variables de `generated/tokens.css` |
| `main.js` | hidrata copy, `datasetId`, `schemaVersion` y `<title>` |
| `generated/dataset.js` | `datasetId`, `schemaVersion` y catálogo de copy (sync) |
| `generated/tokens.css` | paleta y escalas desde `design-tokens.json` (sync) |
| `assets/brand`, `assets/fonts` | marca y fuentes locales (sync) |

Enlaces siempre relativos (`./flutter/`, `./expo/`), así la landing funciona en `/` y en
`/NearbyIG/` sin conocer el base path. `scripts/lib/landing.test.mjs` verifica que todas
las claves existan, que no haya hosts externos y que el `datasetId` generado coincida
con el del contrato.

## Publicación en GitHub Pages

Un único workflow (`.github/workflows/pages.yml`) publica un único artefacto:

| Ruta del sitio | Origen |
|---|---|
| `/` | `demo/landing/` |
| `/flutter/` | `demo/flutter-demo/build/web/` |
| `/expo/` | `demo/expo-demo/dist/` |

- Dispara en `push` a `main`, en `pull_request` y con `workflow_dispatch`. Los PR sólo
  corren `checks`: nunca publican.
- `actions/configure-pages@v5` corre **antes** de los builds y aporta el base path real
  (vacío en sitio de usuario, `/NearbyIG` en sitio de proyecto). Lee el sitio con
  `pages: read` declarado a nivel workflow; los jobs que no construyen (checks) no lo
  ejecutan.
- Gate previo al upload: `validate-fixtures`, `sync --check`, tests de tooling,
  typecheck/tests de Expo, analyze/tests de Flutter, export, build y
  `assemble-site.mjs --strict site` (3 `index.html` + denylist + hosts + datasetId +
  `lang="es"` del documento de Expo).
- `pages:write` e `id-token:write` viven **sólo** en el job `deploy`; environment
  `github-pages`; `timeout-minutes: 25`.
- **No habilita Pages.** Pages ya está habilitado en el repo con Source: GitHub Actions;
  el primer deploy queda pendiente de la primera corrida del workflow. Runbook y
  verificación en [`docs/pages-handoff.md`](../docs/pages-handoff.md).

Comandos equivalentes a mano:

```bash
npm ci && npm --prefix demo/expo-demo ci
node scripts/validate-fixtures.mjs
node scripts/sync-demo-assets.mjs --check
npm run test:scripts
npm --prefix demo/expo-demo run typecheck && npm --prefix demo/expo-demo run test
export PATH="/c/Users/luis_/flutter/bin:$PATH"
(cd demo/flutter-demo && flutter pub get && flutter analyze && flutter test)
(cd demo/expo-demo && MSYS_NO_PATHCONV=1 EXPO_BASE_URL=/expo npx expo export --platform web --output-dir dist --clear)
(cd demo/flutter-demo && MSYS_NO_PATHCONV=1 flutter build web --release --pwa-strategy=none --base-href=/flutter/)
PAGES_BASE_PATH="" node scripts/assemble-site.mjs --strict site
python -m http.server 4190 --directory site
```

## Base path

| Contexto | Flutter `--base-href` | `EXPO_BASE_URL` | Links de la landing |
|---|---|---|---|
| Sitio de proyecto (`usuario.github.io/NearbyIG`) | `/NearbyIG/flutter/` | `/NearbyIG/expo` | relativos (`./flutter/`, `./expo/`) |
| Sitio de usuario (`usuario.github.io`) | `/flutter/` | `/expo` | relativos |

Flutter exige barra inicial y final; Expo exige barra inicial y prohíbe la final. La
landing nunca hardcodea el base path: usa solo rutas relativas.

`assemble-site.mjs` acepta `PAGES_BASE_PATH` para verificar que el `index.html` de
Flutter declara el `<base href>` esperado:

```bash
PAGES_BASE_PATH="" node scripts/assemble-site.mjs
# Sitio de proyecto (Git Bash/MSYS convierte /NearbyIG en ruta de Windows):
MSYS_NO_PATHCONV=1 PAGES_BASE_PATH=/NearbyIG node scripts/assemble-site.mjs --strict site
```

## Reglas que no se negocian

- `demo/shared/*.json` es la única fuente de fixtures, copy, tokens y avatares. No se
  edita lo generado (`lib/generated/`, `src/generated/`, `landing/generated/`, `assets/`).
- No corras `dart format` ni `prettier` sobre los generados: el gate de drift los compara
  byte a byte y el formateo los reescribiría.
- Nada de `lat`/`lng`, URLs externas, binarios de retratos ni configuración Firebase.
- El ZIP del prototipo queda gitignored: sólo se extrajo `public/icon.svg`.
- Un cambio de copy o de fixtures se propaga regenerando, no copiando strings.

## Advertencias conocidas

- `npm audit` en `demo/expo-demo` reporta 3 avisos moderados (`minimatch` vía
  `@expo/fingerprint`). El fix exige un downgrade breaking de la cadena de Expo, así que
  queda como warning rastreado: no se aplica y no bloquea el deploy. El artefacto se
  audita igual por denylist, hosts y secretos en `assemble-site.mjs --strict`.
- El motor de Flutter embebe los defaults `canvasKitBaseUrl`/`fontFallbackBaseUrl` y el
  bundle de Expo incluye el asset URL de Expo Go (código muerto). No son requests de la
  demo: quedan como excepciones exactas y acotadas en `scripts/lib/denylist.mjs`
  (`demo/CONTRACT.md` §11). La auditoría de red real sigue pendiente de navegador (W3).
