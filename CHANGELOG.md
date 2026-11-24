# Changelog

## 0.2.2 - 2026-11-24

### Seguridad, accesibilidad y auditoría de la tienda

- Añadidos headers defensivos y CSP sin JavaScript inline.
- Eliminados handlers inline y reforzado el estado persistido del carrito.
- Añadidos modales accesibles con foco, Escape y navegación por teclado.
- Añadidos metadatos canónicos/Open Graph y smoke tests de producción.
- Cerrados los issues #16, #17, #18, #19 y #20 tras validación automatizada.

## 0.2.1 - 2026-11-24

### Compatibilidad Docker y Pterodactyl

- Añadido `server.js` como entrada reproducible desde `/home/container`.
- El servidor escucha en `HOST` y `SERVER_PORT`/`PORT`, con `0.0.0.0` como
  valor predeterminado.
- Añadidos healthcheck `/healthz`, archivos estáticos y protección de archivos
  de backend frente a solicitudes públicas.
- Añadido apagado ordenado para `SIGTERM` y `SIGINT`.
- Añadidos `Dockerfile` y `.dockerignore` basados en Node.js 25.
- Documentados Pterodactyl, Docker, Nginx, Cloudflare y la configuración de
  ambos dominios públicos.
- Añadidas pruebas de arranque, escucha, healthcheck, estáticos y apagado.

### Verificación

- `npm ci --ignore-scripts --no-audit --no-fund`
- `npm test`
- Ejecución real con Node.js 25 y puerto dinámico.
- Imagen Docker oficial probada cuando el daemon está disponible.

## 0.1.1 - 2026-11-22

- Correcciones iniciales de seguridad, PayPal, catálogo, pagos idempotentes,
  precios, checkout, recursos visuales, instalación y diseño responsive.
