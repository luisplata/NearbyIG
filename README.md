# Nearby IG

App minimalista de networking de proximidad: **Meet. Cowork. Share.**

Repositorio raíz del producto. Acá conviven frontend, backend y documentación.

## Estructura

| Carpeta | Contenido | Estado |
|---------|-----------|--------|
| `frontend/` | App web / PWA y wrapper nativo (Capacitor) | Pendiente de análisis técnico |
| `backend/` | API y servicios del producto | Pendiente de análisis técnico |
| `demo/` | Dos demos mock (Flutter web + Expo web) y landing con contrato compartido | Funcional, publicable en Pages |
| `docs/` | Documentación + sitio web publicado con GitHub Actions | Pendiente de análisis técnico |
| `nearbyig-app-complete.zip` | Snapshot del prototipo generado en AI Studio (backup) | Congelado |

## Estado del proyecto

**Fase 0 — estructura inicial.** No hay decisiones técnicas tomadas todavía.

El zip raíz es el prototipo completo tal cual se generó: React + Vite + Firebase + Capacitor.
Se conserva como backup y como referencia para el análisis de opciones. No se extrae ni se
modifica hasta que exista una decisión técnica documentada.

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

Todo es simulado: sin backend, auth, push, geolocalización real, tiles reales, OAuth ni
persistencia. Runbook en [`demo/README.md`](demo/README.md); contrato vinculante (10
pantallas y checklist de paridad de 15 puntos) en [`demo/CONTRACT.md`](demo/CONTRACT.md).

El workflow `.github/workflows/pages.yml` valida el contrato, construye ambas apps,
audita el artefacto y lo publica. **GitHub Pages ya está habilitado** (Build and
deployment → Source: **GitHub Actions**); **el primer deploy queda pendiente de la
primera corrida del workflow**, así que todavía no hay una URL viva que se pueda dar por
publicada.

URLs esperadas en cuanto corra el workflow:

| Ruta del sitio | Contenido |
|---|---|
| `https://luisplata.github.io/NearbyIG/` | landing con datasetId y enlaces a ambas demos |
| `https://luisplata.github.io/NearbyIG/flutter/` | demo Flutter web |
| `https://luisplata.github.io/NearbyIG/expo/` | demo Expo web |

Publicación, verificación y rollback: [`docs/pages-handoff.md`](docs/pages-handoff.md).

## Repositorio

https://github.com/luisplata/NearbyIG
