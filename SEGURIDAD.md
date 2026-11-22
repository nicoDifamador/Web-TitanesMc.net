# Rotación de credenciales

`PANEL_API_KEY` solo se lee desde el entorno del proceso. `.env` está excluido del control de versiones y el servidor rechaza el valor de ejemplo.

Para completar la rotación de una clave que haya aparecido en una publicación anterior:

1. Revoca la clave antigua en el panel de administración de Pterodactyl.
2. Crea una clave nueva con el permiso mínimo para enviar comandos al servidor indicado por `SERVER_ID`.
3. Actualiza `PANEL_API_KEY` en el entorno de despliegue y reinicia el backend.
4. Comprueba los registros del panel y confirma que la clave antigua ya no puede autenticarse.

No pegues claves en issues, commits, `config.json` ni `.env.example`.
