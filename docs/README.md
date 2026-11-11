# Documentación

Acá va la documentación del producto **y** el sitio web que se publica con GitHub
Actions (GitHub Pages).

## Estado

La carpeta ya tiene documentos de trabajo. El sitio publicado todavía no tiene generador elegido.

## Documentos

| Documento | Para qué sirve |
|---|---|
| [`changes/nearbyig-mvp/exploration.md`](changes/nearbyig-mvp/exploration.md) | Análisis técnico greenfield, alternativas de frontend y decisiones abiertas. |
| [`costos-operacion.md`](costos-operacion.md) | Costos de infraestructura, escenarios de carga y justificación por componente. |
| [`checklist-piloto.md`](checklist-piloto.md) | Qué comprar, qué crear gratis y qué datos entregar para arrancar el piloto. |
| [`plan-sprints-mvp.md`](plan-sprints-mvp.md) | Features, dependencias, orden de ejecución y demo esperada por sprint. |

## Requisito

El sitio de documentación debe construirse y publicarse desde un workflow de GitHub
Actions en `.github/workflows/`. La elección del generador (por ejemplo VitePress,
Docusaurus, Astro, o HTML plano) queda para el análisis técnico.

## Sitio actual: hub de demos

El primer sitio publicado (`.github/workflows/pages.yml`) es el hub de demos mock:
landing en `/`, demo Flutter en `/flutter/` y demo Expo en `/expo/`. No publica esta
carpeta `docs/`: cuando exista un generador, la documentación irá en `/docs/` sin
romper `/`, `/flutter/` ni `/expo/`.

Pages todavía no está habilitado. Habilitación, publicación, verificación y rollback:
[`pages-handoff.md`](pages-handoff.md).

## Contenido esperado

- Visión y alcance del producto
- Decisiones técnicas (ADR)
- Guías de desarrollo y despliegue
- Documentación funcional (privacidad, términos, flujos)
