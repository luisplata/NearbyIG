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

## Apps

```bash
# Flutter web (desarrollo)
(cd demo/flutter-demo && flutter run -d chrome --web-port 4180)

# Flutter web (build de producción, base href sin barra final)
(cd demo/flutter-demo && flutter pub get && flutter analyze && flutter test)
(cd demo/flutter-demo && flutter build web --release --pwa-strategy=none --base-href "/flutter/")

# Expo web
npm --prefix demo/expo-demo ci
npm --prefix demo/expo-demo run typecheck
npm --prefix demo/expo-demo run test
(cd demo/expo-demo && EXPO_BASE_URL="" npx expo export --platform web --output-dir dist --clear)
```

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
hosts prohibidos o secretos.

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
```

## Reglas que no se negocian

- `demo/shared/*.json` es la única fuente de fixtures, copy, tokens y avatares. No se
  edita lo generado (`lib/generated/`, `src/generated/`, `landing/generated/`, `assets/`).
- Nada de `lat`/`lng`, URLs externas, binarios de retratos ni configuración Firebase.
- El ZIP del prototipo queda gitignored: sólo se extrajo `public/icon.svg`.
- Un cambio de copy o de fixtures se propaga regenerando, no copiando strings.
