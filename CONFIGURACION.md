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

Consulta `.env.example` para ver las variables requeridas por el backend.

## Instalación y arranque

Desde la raíz del repositorio, con Node.js 22 o posterior:

1. Ejecuta `npm ci` para instalar las versiones registradas en `package-lock.json`.
2. Copia `.env.example` a `.env` y completa las variables para tu entorno, incluidos `PANEL_API_KEY` y `PAYPAL_CLIENT_SECRET`. Configura también `paypal.clientId` en `config.json` para el mismo entorno de PayPal.
3. Ejecuta `npm test` para verificar el backend y `npm start` para arrancarlo.
