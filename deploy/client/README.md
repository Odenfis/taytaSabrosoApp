# Instalación inicial del cliente (Windows)

Esta entrega usa Docker Desktop para la aplicación y **una base nueva** en SQL Server 2025 instalado en Windows. No ejecute `server/prisma/seed.ts` ni `seed-empty.ts` aquí: ambos contienen datos de demostración o modifican catálogos. La instalación inicial solo se hace una vez.

## Preparación

1. Con SQL Server Configuration Manager, habilite TCP/IP y asigne un puerto fijo (ejemplo: 1433). Reinicie la instancia. Cree una base nueva `tayta_sabroso_cliente` y un login SQL exclusivo con permisos para aplicar las migraciones. Compruebe desde un contenedor que `host.docker.internal:1433` responde. Abra ese puerto solo para la red necesaria del host; **no** publique SQL Server hacia Internet.
2. Configure un nombre DNS LAN estable para la PC, por ejemplo `pos.taytasabroso.lan`, que resuelva a su IP fija o reservada. Abra 443 en el firewall de Windows para la LAN. La app no necesita el puerto 4000 expuesto.
3. Copie `deploy/client/app.env.example` a `deploy/client/app.env`. Sustituya usuario, contraseña SQL, `JWT_SECRET` aleatorio (32 caracteres o más) y `CORS_ORIGIN=https://<nombre LAN>`. Si la contraseña SQL contiene `;`, `=`, `@` u otros caracteres especiales, codifíquelos según el formato URL aceptado por Prisma. Configure `POS_HOSTNAME=<nombre LAN>` en un archivo `.env` de la raíz; no confundirlo con el `.env` del servidor de desarrollo. Mantenga ambos archivos fuera de Git y restrinja acceso a administradores.
4. Copie `deploy/client/initial-config.example.json` a `deploy/client/initial-config.json`. Complete las dos razones sociales, nombres comerciales, RUC, direcciones, mesas, zonas, capacidades, nombre del administrador y PIN nuevo de 6 a 12 dígitos. El inicializador rechaza RUC provisionales, datos de ejemplo y una base con datos.

## Crear imagen e inicializar

Desde la raíz del proyecto, en PowerShell:

```powershell
docker compose -f compose.client.yml build
docker image inspect tayta-sabroso:local --format '{{.Id}}'
docker compose -f compose.client.yml --profile setup run --rm setup
docker compose -f compose.client.yml up -d app web
docker compose -f compose.client.yml ps
```

Registre el SHA de la imagen, el commit de Git y la fecha de entrega. El servicio `setup` aplica migraciones y después crea los datos iniciales en una sola transacción. En futuras actualizaciones use `docker compose -f compose.client.yml run --rm --no-deps setup ./node_modules/.bin/prisma migrate deploy` **sin ejecutar el inicializador**; haga primero un respaldo. Mantenga el mismo `JWT_SECRET`, nombre LAN y volúmenes de Caddy.

Si se construye en una Mac con CPU ARM para trasladar la imagen a Windows x64, construya explícitamente `linux/amd64` y exporte la imagen con `docker save`; en Windows impórtela con `docker load`. No distribuya la imagen ARM local de desarrollo.

## HTTPS en las terminales

Caddy crea una CA local persistida en el volumen `caddy_data`. Exporte su certificado raíz desde el contenedor con `docker compose -f compose.client.yml cp web:/data/caddy/pki/authorities/local/root.crt .\tayta-pos-root.crt`. Instálelo como autoridad raíz confiable en Windows y en cada tablet autorizada; valide `https://<nombre LAN>/health` sin advertencia de certificado. Distribuya el certificado por un canal controlado. Nunca distribuya la clave privada de la CA ni borre el volumen `caddy_data` durante una actualización. Use siempre la misma URL: cambiarla cambia el almacenamiento del navegador, incluida la cola de operaciones.

## Respaldo, restauración y operación

- SQL Server está en Windows, fuera de Docker. Programe un `BACKUP DATABASE tayta_sabroso_cliente TO DISK = 'RUTA_WINDOWS\tayta_sabroso_cliente.bak' WITH INIT, CHECKSUM, COMPRESSION`, verifique con `RESTORE VERIFYONLY` y copie el `.bak` fuera de la PC. Pruebe `RESTORE DATABASE` en una **base separada** antes del piloto.
- Para reiniciar la app: `docker compose -f compose.client.yml restart app web`. Para diagnóstico: `docker compose -f compose.client.yml ps` y `docker compose -f compose.client.yml logs --tail=100 app web`. `/health` verifica el proceso; confirme además login y lectura SQL.
- Si cambia el PIN, use Configuración → Seguridad. Guarde el PIN y los secretos en un gestor seguro. No conserve `initial-config.json` con el PIN en el paquete de entrega después de inicializar; guárdelo cifrado o retire ese campo tras registrar la instalación.
- Antes de operar ventas reales, compruebe en una base de prueba el flujo completo de catálogo, compra, despacho, cobro, caja, dos terminales, corte de Internet con LAN disponible, impresión física y restauración. Registre el resultado y cualquier incidente. El arranque de los contenedores no acredita esas pruebas de campo.

Esta versión no incluye Azure ni la pantalla dedicada de Cocina/Barra. El texto de voucher debe validarse con el cliente antes de imprimir comprobantes reales; el POS no implementa emisión electrónica fiscal.
