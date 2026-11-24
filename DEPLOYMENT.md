# Despliegue en Pterodactyl

## Variables

La configuración recomendada para TitanesMC es:

```env
HOST=0.0.0.0
# Pterodactyl's allocation is 25573 in the current server.
SERVER_PORT=25573
PORT=3000
MAIN_FILE=server.js
SITE_ORIGIN=https://titanesmc.net
AUTO_DELIVERY_ENABLED=false
PANEL_HOST=https://control.titanesmc.net
NODE_PACKAGES=
```

Completa las variables privadas de PayPal en el panel. Mientras `AUTO_DELIVERY_ENABLED=false`, `PANEL_API_KEY` puede quedar sin definir. Para habilitar entregas automáticas se requieren `PANEL_API_KEY`, `SERVER_ID` y un `PANEL_HOST` HTTPS válido.

## Instalación y arranque

Usa una sola instalación reproducible y haz que cualquier error de Git detenga el arranque:

```sh
git pull --ff-only origin main && npm ci && npm start
```

No agregues `npm install $NODE_PACKAGES`: Express y dotenv ya están fijados en `package-lock.json`. El servidor escucha en `0.0.0.0` y toma el puerto de `SERVER_PORT` o, como alternativa, `PORT`.

## Actualización segura de un volumen divergido

Antes de actualizar, detén el servidor y conserva `.env` y `data/payment-state.json` fuera de cualquier operación de Git. Luego inspecciona el estado sin borrar nada:

```sh
git status --short --branch
git log -1 --decorate --oneline
git branch -vv
git reflog -20
git stash list
git diff -- server.js package.json package-lock.json
```

Si hay cambios locales, guárdalos en una rama y en un stash que incluya archivos sin rastrear:

```sh
git switch -c recovery/pterodactyl-local
git add server.js package.json package-lock.json
git commit -m "Preserve Pterodactyl local backend" || true
git stash push --include-untracked -m "Pterodactyl pre-deploy backup"
git switch main
git pull --ff-only origin main
npm ci
```

No uses `git reset --hard` ni `git clean -fd`. Si `git pull --ff-only` falla, detén el arranque y resuelve la divergencia desde la rama de recuperación. `.env` y `data/` están ignorados por Git y deben conservarse como datos persistentes y respaldarse por separado.

## Diagnóstico del incidente

El commit `b119b21` contiene `server.js`, `package.json` y `package-lock.json`. El arranque anterior continuó después de que `git pull` abortara por cambios locales, por lo que ejecutó una copia divergida. Los registros posteriores indican que `server.js` desapareció del volumen; sin acceso a `/home/container` no es posible determinar qué proceso lo eliminó ni recuperar esa copia exacta. Esta versión reconstruye el comportamiento requerido sobre `origin/main` y evita que un pull fallido continúe al usar `&&`.
