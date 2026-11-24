# TITANES MC

Sitio oficial y backend de la tienda de TITANES MC. La aplicación usa
Express 5 sobre CommonJS, sirve el frontend estático desde el mismo proceso y
no necesita una compilación previa.

## Requisitos

- Node.js 25 (también compatible con Node.js 22 o posterior).
- Un `PANEL_API_KEY` nuevo y con permisos mínimos cuando se active la entrega
  automática (`AUTO_DELIVERY_ENABLED=true`).
- Credenciales de PayPal y un webhook configurado para el mismo entorno.

## Desarrollo local

```bash
npm ci
cp .env.example .env
# Completa los secretos en .env; nunca los publiques.
npm test
HOST=0.0.0.0 SERVER_PORT=3000 npm start
```

La tienda queda disponible en `http://127.0.0.1:3000/` y el healthcheck en
`http://127.0.0.1:3000/healthz`. El backend vuelve a calcular los precios en
el servidor antes de crear cada orden de PayPal. La entrega automática está
desactivada por defecto para que el backend pueda arrancar sin una credencial
de panel durante una instalación inicial.

## Despliegue en Pterodactyl

El Egg actual puede seguir usando su comando de inicio:

```bash
node "${MAIN_FILE}"
```

Configura estas variables del servidor:

```env
MAIN_FILE=server.js
NODE_ENV=production
HOST=0.0.0.0
```

El puerto asignado por Pterodactyl debe llegar mediante `SERVER_PORT` (o
`PORT`). No establezcas un puerto fijo en el código. Después de extraer la
release, el contenido de este repositorio debe estar directamente en
`/home/container`; comprueba que existen `/home/container/server.js`,
`/home/container/package.json` y `/home/container/config.json`.

Instala y arranca desde `/home/container`:

```bash
npm ci --omit=dev
node server.js
```

Pterodactyl instala las dependencias automáticamente si el Egg está configurado
para ello, por lo que no hay que modificar el Egg ni añadir una carpeta raíz
intermedia al subir el ZIP.

## Docker

El `Dockerfile` usa `node:25-bookworm-slim`, instala con el lockfile y arranca
con `node server.js`:

```bash
docker build -t titanesmc:local .
docker run --env-file .env -p 3000:3000 titanesmc:local
```

El contenedor escucha en `0.0.0.0`, acepta `SERVER_PORT`/`PORT`, expone
`GET /healthz` y gestiona `SIGTERM`/`SIGINT` con apagado ordenado. No contiene
`node_modules`, secretos, `.env`, datos persistentes ni archivos temporales.

## Nginx, Cloudflare y dominios

Nginx continúa terminando TLS y reenviando al puerto interno de Node; no se
incluyen certificados dentro del contenedor. Con Nginx en el mismo host se
confían por defecto los encabezados `X-Forwarded-For`, `X-Forwarded-Proto` y
`X-Forwarded-Host` recibidos desde loopback. Configura `SITE_ORIGIN` y
`SITE_ORIGINS` para `https://titanesmc.net` y
`https://www.titanesmc.net` cuando la API se consuma desde ambos dominios.

## Archivos importantes

- `server.js`: entrada del backend, API, archivos estáticos y apagado ordenado.
- `config.json`: catálogo público, precios y cliente público de PayPal.
- `.env.example`: variables de entorno; contiene solo marcadores.
- `CONFIGURACION.md`: catálogo, secretos y procedimientos de despliegue.
- `SEGURIDAD.md`: rotación de credenciales del panel.
- `Dockerfile`: imagen reproducible para Docker.

Consulta `CHANGELOG.md` para las correcciones publicadas y no subas nunca
`.env`, tokens, claves privadas o el directorio `data/` al repositorio.
