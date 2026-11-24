# Configuración de la tienda

Edita `config.json` para cambiar el catálogo, los descuentos y la identidad visual. Los cambios de precios y diseño se muestran al recargar la web; el backend vuelve a leer los precios en cada nueva orden.

## Precios y descuentos

- `products`: precio base de cada producto, en la moneda indicada por `currency`.
- `discounts.globalPercent`: descuento automático general, de 0 a 100.
- `discounts.products`: descuentos específicos por nombre exacto de producto. Si un producto aparece aquí, ese porcentaje reemplaza al general.
- `discounts.coupons`: códigos que se pueden introducir en el carrito. El cupón se aplica después del descuento automático.
- Para activar o desactivar un código, cambia `enabled`. `TITANES100` está desactivado; PayPal no admite órdenes con total cero.

El catálogo y los descuentos del navegador solo sirven para mostrar la tienda. El backend calcula el importe definitivo antes de crear la orden de PayPal. No edites ni envíes precios desde el navegador como fuente de cobro.

## Diseño y marca

- `site.name`, `site.subtitle`, `site.serverAddress` y `site.logo` controlan la identidad de la web.
- `design.fontFamily` y `design.colors` controlan la tipografía y los colores globales usados por la tienda.

## Backend y secretos

- `apiBaseUrl` debe quedar vacío si la API se sirve desde el mismo origen que la web. Si la web y el backend están en dominios distintos, indica aquí el origen del backend, sin una ruta final.
- Configura `SITE_ORIGIN` en el entorno del backend con el origen exacto de la web.
- `PAYPAL_CLIENT_SECRET` y `PANEL_API_KEY` son secretos: guárdalos en las variables de entorno del servidor, nunca en `config.json` ni en archivos públicos.
- `PAYPAL_MODE` debe ser `sandbox` para pruebas o `live` para cobros reales.
- `PAYPAL_WEBHOOK_ID` identifica el webhook registrado en PayPal y `PAYPAL_MERCHANT_ID` identifica la cuenta receptora. Ambos son necesarios para validar las capturas antes de entregar productos.
- `AUTO_DELIVERY_ENABLED` queda en `false` por defecto. Con ese valor se verifican y registran los pagos, pero no se envían comandos a Minecraft y `PANEL_API_KEY` no es necesario para arrancar ni crear órdenes.
- Para activar la entrega, usa `AUTO_DELIVERY_ENABLED=true` y configura `PANEL_HOST` con HTTPS, `PANEL_API_KEY` y `SERVER_ID`. El servidor se negará a arrancar si esas credenciales faltan o usan placeholders.

Consulta `.env.example` para ver las variables requeridas por el backend.

## Instalación y arranque

Desde la raíz del repositorio, con Node.js 22 o posterior:

1. Ejecuta `npm ci` para instalar las versiones registradas en `package-lock.json`.
2. Copia `.env.example` a `.env` y completa las variables de PayPal. Configura también `paypal.clientId` en `config.json` para el mismo entorno. Las credenciales del panel sólo son obligatorias si activas la entrega automática.
3. Ejecuta `npm test` para verificar el backend y `npm start` para arrancarlo.

## Pterodactyl y Docker

La aplicación es CommonJS y no necesita una etapa de compilación. El archivo de
entrada siempre está en la raíz del despliegue: `server.js`.

En Pterodactyl configura:

```env
MAIN_FILE=server.js
NODE_ENV=production
HOST=0.0.0.0
AUTO_DELIVERY_ENABLED=false
```

El Egg debe ejecutar desde `/home/container` su comando habitual:
`node "${MAIN_FILE}"`. Pterodactyl debe inyectar el puerto asignado en
`SERVER_PORT` (si no lo hace, también se acepta `PORT`). No fijes el puerto en
el código ni muevas el contenido de la release a una carpeta anidada: `server.js`,
`package.json` y `config.json` deben quedar directamente en `/home/container`.

Para una ejecución local equivalente:

```bash
HOST=0.0.0.0 SERVER_PORT=3000 NODE_ENV=production npm start
```

También se incluye un `Dockerfile` basado en `node:25-bookworm-slim`:

```bash
docker build -t titanesmc:local .
docker run --env-file .env -p 3000:3000 titanesmc:local
```

El proceso expone `GET /healthz`, sirve el frontend estático y responde en
`0.0.0.0`. Nginx y Cloudflare siguen gestionando HTTPS fuera del contenedor;
el backend confía por defecto únicamente en el proxy de loopback (`TRUST_PROXY`)
y acepta ambos orígenes públicos mediante `SITE_ORIGIN`/`SITE_ORIGINS`.

Al recibir `SIGTERM` o `SIGINT`, deja de aceptar conexiones y cierra el servidor
de forma ordenada. No requiere permisos root.
