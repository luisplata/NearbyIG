# Nearby IG

App minimalista de networking de proximidad: **Meet. Cowork. Share.**

Repositorio raíz del producto. Acá conviven frontend, backend y documentación.

## Estructura

| Carpeta | Contenido | Estado |
|---------|-----------|--------|
| `frontend/` | App web / PWA y wrapper nativo (Capacitor) | Pendiente de análisis técnico |
| `backend/` | API y servicios del producto | Pendiente de análisis técnico |
| `demo/` | Demo mock (Expo web) y landing con contrato compartido | Publicado en GitHub Pages |
| `docs/` | Documentación + sitio web publicado con GitHub Actions | Pendiente de análisis técnico |
| `nearbyig-app-complete.zip` | Snapshot del prototipo generado en AI Studio (backup) | Fuera del repo; ignorado por Git |

## Estado del proyecto

**Fase 1 — demos mock publicadas.** El producto real (backend, auth, ubicación y tiendas)
sigue pendiente de implementación.

El prototipo original se conserva como backup local fuera del repositorio y como referencia
de producto. No se versiona porque contiene material de firma Android.

## Próximo paso

Análisis técnico de opciones (frontend, backend, documentación y despliegue) antes de
escribir código de producto.

## Demos

Una implementación mock del flujo —Expo web— alimentada por un único contrato
(`demo/shared/`) y publicada como un solo sitio de GitHub Pages:

| Ruta del sitio | Contenido |
|---|---|
| `/` | landing con `datasetId`, `noindex` y el enlace a la demo |
| `/expo/` | demo Expo web |

Todo es simulado salvo el fondo del radar: sin backend, auth, push, geolocalización
real, OAuth ni persistencia. El único pedido externo es el basemap del radar
(`tiles.openfreemap.org`, OpenFreeMap con MapLibre, sin API key ni cuenta); la
ilustración queda como fallback si el mapa no carga. Runbook en
[`demo/README.md`](demo/README.md); contrato vinculante (10 pantallas y checklist de
paridad de 15 puntos) en
[`demo/CONTRACT.md`](demo/CONTRACT.md).

El workflow `.github/workflows/pages.yml` valida el contrato, construye la app,
audita el artefacto y lo publica. **GitHub Pages está habilitado** (Build and deployment →
Source: **GitHub Actions**) y el primer deploy ya se completó.

Sitio vivo:

| Ruta | Contenido |
|---|---|
| `https://luisplata.github.io/NearbyIG/` | landing con datasetId y el enlace a la demo |
| `https://luisplata.github.io/NearbyIG/expo/` | demo Expo web |

Dataset publicado: `ds-f88cad85` (schema 2). Las tres páginas comparten el mismo contrato.

La demo arranca en la **lista**. Tiene cuatro tabs (Lista → Radar → Pings → Perfil) y un
radar compuesto sobre un basemap real de referencia (OpenFreeMap, un solo host, sin key,
con la ilustración como fallback). Usa tres intenciones —amistad, actividades y
networking— y toma su posicionamiento "Cowork Café" del catálogo de copy
(`landing.eyebrow`, `about.club`, `about.positioning`). Es estilo y tono: el repo, el
icono, el bundle id y las URLs no cambian.

Publicación, verificación y rollback: [`docs/pages-handoff.md`](docs/pages-handoff.md).

## Repositorio

https://github.com/luisplata/NearbyIG
