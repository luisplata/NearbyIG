# Handoff — publicar las demos en GitHub Pages

Estado: **Pages no está habilitado**. El workflow `.github/workflows/pages.yml` está
commiteado y listo, pero publicar es un paso manual del dueño del repo. El workflow
**no** habilita Pages por sí mismo.

## 1. Habilitar Pages (una sola vez)

1. Abrir `https://github.com/luisplata/NearbyIG/settings/pages`.
2. En **Build and deployment → Source**, elegir **GitHub Actions**.
   No elegir “Deploy from a branch”: este repo no publica desde una rama.
3. Guardar. No hace falta crear un environment: lo crea el primer deploy.

Con Pages sin habilitar, el job `build` falla en `actions/configure-pages@v5`
(`Get Pages site failed`) **antes** de construir nada. No es un bug: es el gate.

## 2. Publicar

Cualquiera de estas dos opciones dispara el mismo workflow:

```bash
# opción A: ejecución manual
gh workflow run pages.yml
gh run watch

# opción B: push a main (el workflow escucha push y workflow_dispatch)
git push origin main
```

El workflow tiene tres jobs:

| Job | Qué hace | Cuándo |
|---|---|---|
| `checks` | valida fixtures, drift de generados, tests de tooling, typecheck y tests de Expo, analyze y tests de Flutter | siempre, incluidos PR |
| `build` | resuelve el base path, construye Expo y Flutter, ensambla y audita `site/`, sube el artefacto | push a `main` y manual |
| `deploy` | publica el artefacto con `pages:write` + `id-token:write` | sólo `main`, después de `build` |

Ningún paso habilita Pages, ni pide secretos, ni hace `git push`.

## 3. Verificar la publicación

URLs esperadas (sitio de proyecto):

| Ruta | Contenido |
|---|---|
| `https://luisplata.github.io/NearbyIG/` | landing con datasetId y enlaces relativos |
| `https://luisplata.github.io/NearbyIG/flutter/` | demo Flutter web |
| `https://luisplata.github.io/NearbyIG/expo/` | demo Expo web |

Checklist de aceptación:

1. Las tres URLs responden 200 y refrescan sin 404 (son directorios con `index.html`).
2. La landing muestra `datasetId` y `schemaVersion`; “Acerca de” de ambas apps muestra
   **los mismos** valores.
3. El chip DEMO sigue visible en las dos demos y la hoja “Qué es simulado” lista 8 ítems.
4. DevTools → Network, recorriendo las pantallas: sólo requests al mismo origen.
5. Los assets de Expo resuelven bajo `/NearbyIG/expo/` y los de Flutter bajo
   `/NearbyIG/flutter/` (sin dobles barras).
6. La landing responde `noindex` (`<meta name="robots" content="noindex, nofollow">`).

Para conocer el datasetId vigente en cualquier momento:

```bash
node scripts/validate-fixtures.mjs   # imprime el datasetId del contrato
```

## 4. Si algo falla

| Síntoma | Causa probable | Acción |
|---|---|---|
| `Get Pages site failed` | Pages no habilitado | paso 1 |
| `Resource not accessible by integration` en deploy | falta `pages: write` / `id-token: write` | revisar que los permisos sigan en el job `deploy` |
| El job `checks` falla en “anti-drift” | un generado quedó desactualizado | `npm run sync` y commitear |
| 404 de assets en `/flutter/` | build con `--base-href` incorrecto | revisar que `configure-pages` corra antes de los builds |
| 404 de assets en `/expo/` | `EXPO_BASE_URL` mal formado | debe ser `${base_path}/expo`, sin barra final |

## 5. Rollback

- Despublicar: Settings → Pages → Source → *None* (o borrar el environment
  `github-pages`). El sitio deja de servirse; los commits quedan intactos.
- Revertir el workflow: `git revert <commit de ci>` y push. No hay artefactos
  commiteados: `site/`, `dist/` y `build/` están gitignored.
