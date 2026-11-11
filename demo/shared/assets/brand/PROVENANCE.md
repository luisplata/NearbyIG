# Brand provenance

## `icon.svg`

| Campo | Valor |
|---|---|
| Origen | `nearbyig-app-complete.zip` → `public/icon.svg` (snapshot del prototipo, 2026-11-05) |
| Copia | Verbatim: mismos bytes, sin reformatear ni optimizar |
| Uso | Icono de marca de la landing y de ambas demos; fuente del favicon PNG |
| Licencia / uso | Provisoria: el glifo imita la cámara de Instagram. Revisar uso de marca antes de promoción pública. |

El ZIP del prototipo está gitignored y **nunca** se commitea: sólo se extrajo este SVG.
El ZIP contiene material sensible (keystore, `.env.example`, config Firebase) que no
debe entrar al repositorio ni al artefacto de Pages.

## Derivados

`icon-192.png` y `icon-512.png` se generan desde `icon.svg` con
`@resvg/resvg-js` en `node scripts/sync-demo-assets.mjs` (ver `ASSET PIPELINE` en
`demo/CONTRACT.md`). Son derivados deterministas: mismo SVG + misma versión de resvg →
mismos bytes. Con `--no-raster` se reutilizan los PNG ya commiteados.

## Hashes

El hash lo verifica `node scripts/sync-demo-assets.mjs` en cada corrida: si el SVG no
coincide con lo registrado acá, el sync falla con un mensaje explícito y hay que
regenerar los PNG y actualizar esta tabla. Los PNG no se comparan por hash: se
regeneran desde el SVG.

```text
sha256  icon.svg        785614de5e4465df9e0778a387f2941389570d9d1a83778da61598ce9fc34494
```
