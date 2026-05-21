# Auto-actualizaciones in-app (Tauri Updater)

Metta Launcher se actualiza **encima de la instalación existente**, como Discord, Spotify o VS Code. No hay que desinstalar ni volver a descargar el instalador completo.

## Qué ve el usuario

1. Al abrir Metta (o en segundo plano cada pocas horas) se comprueba si hay build nuevo.
2. Si lo hay, **descarga el parche firmado** e **instala sobre la app actual**.
3. Metta **se reinicia solo** con la versión nueva. Instancias, mods y ajustes se conservan.

En **Ajustes** puedes desactivar la instalación automática; entonces solo se avisa y puedes pulsar «Actualizar ahora».

## Configurar CI (obligatorio para que funcione)

Añade estos **GitHub Secrets** en el repositorio:

| Secret | Valor |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido completo del archivo `.tauri/metta-launcher.key` (generado localmente) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Vacío si la clave no tiene contraseña |

Generar un par de claves nuevo (solo si perdiste la privada):

```bash
npm run tauri signer generate -- -w .tauri/metta-launcher.key -f -p ""
```

La clave pública ya está embebida en `src-tauri/tauri.conf.json`. **Nunca subas la clave privada al repo.**

## Publicar una versión

1. Sube la versión en `package.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`.
2. Haz push a `main` (el workflow compila y crea/actualiza el release draft).
3. El job `merge-updater-manifest` genera `latest.json` con todas las plataformas.
4. Publica el release draft en GitHub cuando los builds terminen.

## Desarrollo local

En `tauri dev` el updater puede fallar (sin firma). En ese caso la app usa el fallback de GitHub Releases API y abre el enlace de descarga manual.
