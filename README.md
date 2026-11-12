# Nearby IG

App minimalista de networking de proximidad: **Meet. Cowork. Share.**

Repositorio raíz del producto. Acá conviven frontend, backend y documentación.

## Estructura

| Carpeta | Contenido | Estado |
|---------|-----------|--------|
| `frontend/` | App web / PWA y wrapper nativo (Capacitor) | Pendiente de análisis técnico |
| `backend/` | API y servicios del producto | Pendiente de análisis técnico |
| `demo/` | Dos demos mock (Flutter web + Expo web) y landing con contrato compartido | Publicado en GitHub Pages |
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

Dos implementaciones mock del mismo flujo —Flutter web y Expo web— alimentadas por un
único contrato (`demo/shared/`) y publicadas como un solo sitio de GitHub Pages:

| Ruta del sitio | Contenido |
|---|---|
| `/` | landing con `datasetId`, `noindex` y enlaces a ambas demos |
| `/flutter/` | demo Flutter web |
| `/expo/` | demo Expo web |

Todo es simulado salvo el fondo del radar de Expo: sin backend, auth, push, geolocalización
real, OAuth ni persistencia. El único pedido externo es el basemap del radar
(`tiles.openfreemap.org`, OpenFreeMap con MapLibre, sin API key ni cuenta); Flutter
mantiene el mapa ilustrado. Runbook en [`demo/README.md`](demo/README.md); contrato
vinculante (10 pantallas y checklist de paridad de 15 puntos) en
[`demo/CONTRACT.md`](demo/CONTRACT.md).

El workflow `.github/workflows/pages.yml` valida el contrato, construye ambas apps,
audita el artefacto y lo publica. **GitHub Pages está habilitado** (Build and deployment →
Source: **GitHub Actions**) y el primer deploy ya se completó.

Sitio vivo:

| Ruta | Contenido |
|---|---|
| `https://luisplata.github.io/NearbyIG/` | landing con datasetId y enlaces a ambas demos |
| `https://luisplata.github.io/NearbyIG/flutter/` | demo Flutter web |
| `https://luisplata.github.io/NearbyIG/expo/` | demo Expo web |

Dataset publicado: `ds-ee4300cf` (schema 2). Las tres páginas comparten el mismo contrato.

Las demos arrancan en la **lista**. Expo es la demo activa con cuatro tabs (Lista → Radar
→ Pings → Perfil) y un radar compuesto sobre un basemap real de referencia (OpenFreeMap,
un solo host, sin key, con la ilustración como fallback); Flutter queda como referencia
congelada con su barra de cinco tabs y su mapa ilustrado. Ambas usan tres intenciones
—amistad, actividades y networking— y toman su posicionamiento "Cowork Café" del catálogo
de copy (`landing.eyebrow`, `about.club`, `about.positioning`). Es estilo y tono: el repo,
el icono, el bundle id y las URLs no cambian.

Publicación, verificación y rollback: [`docs/pages-handoff.md`](docs/pages-handoff.md).

## Repositorio

https://github.com/luisplata/NearbyIG
