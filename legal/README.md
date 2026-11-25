# Páginas legales

Fuente de verdad de las dos páginas públicas que Play Console exige:

- `privacidad/` → https://nearbyig.tech/privacidad/
- `terminos/`  → https://nearbyig.tech/terminos/

`site/` es un artefacto de build (gitignored), así que las páginas viven acá y se
copian al artefacto antes de publicar:

```bash
cp -r legal/privacidad legal/terminos site/ && tar czf - -C site privacidad terminos | \
  ssh deploy@179.197.95.60 'sudo tar xzf - -C /var/www/html'
```

Pendiente: que `scripts/assemble-site.mjs` las copie solo, para que GitHub Pages
las publique junto con el resto del sitio.

> Texto base redactado a partir de lo que la app hace hoy. Antes de un lanzamiento
> comercial con cuentas reales, revisarlo con asesoría legal.
