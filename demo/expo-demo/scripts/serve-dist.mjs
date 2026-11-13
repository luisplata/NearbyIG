import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * Servidor estático mínimo para probar el build web de la demo en el navegador.
 *
 * No tiene dependencias ni rewrites: `expo export` con `output: 'single'` deja un
 * `index.html` en la raíz de `dist`, y todo lo demás son assets con hash. El
 * puerto por defecto (8081) es el que el backend tiene en su allowlist de CORS.
 *
 *     npm run serve:dist            # http://localhost:8081
 *     PORT=4173 npm run serve:dist
 */

const rootArgument = process.argv[2] ?? 'dist';
const root = resolve(process.cwd(), rootArgument);
const port = Number(process.env.PORT ?? 8081);

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.ttf', 'font/ttf'],
  ['.woff2', 'font/woff2'],
  ['.map', 'application/json; charset=utf-8'],
]);

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No hay index.html en ${root}. Corré primero el export web.`);
  process.exit(1);
}

function resolveFile(url) {
  const pathname = decodeURIComponent((url ?? '/').split('?')[0]);
  const candidate = normalize(join(root, pathname));
  if (!candidate.startsWith(root)) {
    return null;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  if (extname(pathname) === '') {
    return join(root, 'index.html');
  }
  return null;
}

createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');
  if (file === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('404');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME.get(extname(file)) ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`demo web en http://localhost:${port} (sirviendo ${root})`);
});
