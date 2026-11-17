# Instalación inicial del cliente (Windows)

Esta entrega usa Docker Desktop para la aplicación y **una base nueva** en SQL Server 2025 instalado en Windows. No ejecute `server/prisma/seed.ts` ni `seed-empty.ts` aquí: ambos contienen datos de demostración o modifican catálogos. La instalación inicial solo se hace una vez.

## Preparación

1. Con SQL Server Configuration Manager, habilite TCP/IP y asigne un puerto fijo (ejemplo: 1433). Reinicie la instancia. Cree una base nueva `tayta_sabroso_cliente` y un login SQL exclusivo con permisos para aplicar las migraciones. Compruebe desde un contenedor que `host.docker.internal:1433` responde. Abra ese puerto solo para la red necesaria del host; **no** publique SQL Server hacia Internet.
2. Configure un nombre DNS LAN estable para la PC, por ejemplo `pos.taytasabroso.lan`, que resuelva a su IP fija o reservada. Abra el puerto HTTPS elegido en el firewall de Windows. La app no necesita el puerto 4000 expuesto.
3. Copie `deploy/client/app.env.example` a `deploy/client/app.env`. Sustituya usuario, contraseña SQL, `JWT_SECRET` aleatorio (32 caracteres o más) y `CORS_ORIGIN=https://<nombre LAN>` (agregue `:8443` si usa ese puerto). Si la contraseña SQL contiene `;`, `=`, `@` u otros caracteres especiales, codifíquelos según el formato URL aceptado por Prisma. Configure `POS_HOSTNAME=<nombre LAN>` en un archivo `.env` de la raíz; para usar HTTPS en 8443, agregue `POS_HTTPS_PORT=8443` al mismo archivo. El valor predeterminado es 443 y no se publica HTTP en 80. No confunda este `.env` con el del servidor de desarrollo. Mantenga ambos archivos fuera de Git y restrinja acceso a administradores.
4. Copie `deploy/client/initial-config.example.json` a `deploy/client/initial-config.json`. Complete las dos razones sociales, nombres comerciales, RUC, direcciones, mesas, zonas, capacidades, nombre del administrador y PIN nuevo de 6 a 12 dígitos. El inicializador rechaza RUC provisionales, datos de ejemplo y una base con datos.
   Antes de ejecutar `setup`, confirme que `initial-config.json` existe como **archivo**, no como carpeta. Si no existe, Docker puede montar una carpeta en su lugar y el inicializador dará `EISDIR`.

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

## Actualización supervisada de una instalación existente

Para esta entrega, siga la guía específica [Actualización por porciones](ACTUALIZACION-PORCIONES.md).

La entrega debe publicarse y validarse previamente con un commit completo. La base funcional de porciones está en `9f1e780ef60e894286f8a7a42f75be78fcbeb737`; utilice el commit final de entrega que incorpore también esta guía, no una etiqueta móvil. En la máquina de preparación, confirme árbol limpio con `git status -sb`, registre `git rev-parse HEAD`, publique ese commit y confirme que la referencia remota lo contiene antes de la visita. Desde PowerShell ejecute `& "RUTA_AL_REPOSITORIO\deploy\client\actualizar-cliente.bat" "COMMIT_COMPLETO_VALIDADO"`. El archivo exige `main` limpia, descarga con `--ff-only` y se detiene si el commit no coincide. Construye la imagen con etiqueta `release-<commit>`; registre y conserve/exporte la imagen anterior antes de construir. El script no crea ni verifica por sí mismo el respaldo, ni ejecuta el inicializador.

Antes de continuar, identifique la base y registre las migraciones pendientes. Sincronice y conserve las colas de todas las terminales; suspenda las escrituras y haga un respaldo final SQL con `COPY_ONLY, CHECKSUM`. Ejecute `RESTORE VERIFYONLY`, conserve una copia externa y restaure en **otra base**. Ejecute `DBCC CHECKDB` y pruebe allí las migraciones de la entrega. Compruebe la copia y registre evidencia antes de confirmar el respaldo en el actualizador. El procedimiento detallado de roles y recuperación está en [ROLES.md](ROLES.md).

El actualizador comprueba roles, muestra el estado de migraciones para revisión, detiene app/web, ejecuta `prisma migrate deploy` y comprueba `migrate status`. Si falla después de detener servicios, no reanude operaciones: conserve los logs y siga la recuperación supervisada en ROLES.md. No ejecute seeds, `db push`, `migrate reset` ni el inicializador. La conciliación de stock y la configuración de mesas quedan fuera de esta actualización y requieren un procedimiento separado y revisión explícita.

El valor `APP_VERSION=release-<commit>` se aplica al proceso del actualizador. Para posteriores comandos `docker compose` que creen o recreen contenedores, configure el mismo valor en el entorno o en `.env` de la instalación; sin él Compose usa `local`, que podría apuntar a otra imagen. Preserve la URL, los perfiles y almacenamiento de los navegadores, el secreto JWT y los volúmenes de Caddy. No cambie de origen para evitar perder acceso a colas locales.

La configuración `compose.client.yml` impone `FISCAL_TEST_ENABLED=false` y `FISCAL_BETA_SEND_ENABLED=false` para el servicio de la aplicación, incluso si `app.env` contiene otros valores. Se aplican las migraciones pendientes en orden, incluidas las fiscales si corresponden, pero la facturación electrónica no se habilita. Verifique `/api/fiscal/status` con sesión autorizada, controles fiscales ausentes y cobros normales antes del piloto.

Las fichas de modelos anteriores requieren conversión explícita antes de ejecutarse. Seleccione resultados nuevos en unidad Porción cuando corresponda; no cambie automáticamente unidades de insumos con stock, movimientos o recetas. Las ejecuciones históricas se conservan. Cada ejecución confirmada genera un ingreso independiente y registro de rendimiento; el reporte consolidado y la exportación siguen pendientes.

Después de instalar, siga [ACEPTACION-PRUEBAS.md](ACEPTACION-PRUEBAS.md). Las transformaciones confirmadas modifican existencias y no tienen reversión ordinaria: use insumos identificados para pruebas. No dé por aprobado el piloto por el solo arranque de contenedores.

## HTTPS en las terminales

Caddy crea una CA local persistida en el volumen `caddy_data`. Exporte su certificado raíz desde el contenedor con `docker compose -f compose.client.yml cp web:/data/caddy/pki/authorities/local/root.crt .\tayta-pos-root.crt`. Instálelo como autoridad raíz confiable en Windows y en cada tablet autorizada; valide `https://<nombre LAN>/health` sin advertencia de certificado. Distribuya el certificado por un canal controlado. Nunca distribuya la clave privada de la CA ni borre el volumen `caddy_data` durante una actualización. Use siempre la misma URL: cambiarla cambia el almacenamiento del navegador, incluida la cola de operaciones.

## Respaldo, restauración y operación

- SQL Server está en Windows, fuera de Docker. Programe un `BACKUP DATABASE tayta_sabroso_cliente TO DISK = 'RUTA_WINDOWS\tayta_sabroso_cliente.bak' WITH INIT, CHECKSUM, COMPRESSION`, verifique con `RESTORE VERIFYONLY` y copie el `.bak` fuera de la PC. Pruebe `RESTORE DATABASE` en una **base separada** antes del piloto.
- Para reiniciar la app: `docker compose -f compose.client.yml restart app web`. Para diagnóstico: `docker compose -f compose.client.yml ps` y `docker compose -f compose.client.yml logs --tail=100 app web`. `/health` verifica el proceso; confirme además login y lectura SQL.
- Si cambia el PIN, use Configuración → Seguridad. Guarde el PIN y los secretos en un gestor seguro. No conserve `initial-config.json` con el PIN en el paquete de entrega después de inicializar; guárdelo cifrado o retire ese campo tras registrar la instalación.
- Antes de operar ventas reales, compruebe en una base de prueba el flujo completo de catálogo, compra, despacho, cobro, caja, dos terminales, corte de Internet con LAN disponible, impresión física y restauración. Registre el resultado y cualquier incidente. El arranque de los contenedores no acredita esas pruebas de campo.

Esta versión no incluye Azure ni la pantalla dedicada de Cocina/Barra. El texto de voucher debe validarse con el cliente antes de imprimir comprobantes reales; el POS no implementa emisión electrónica fiscal.

## Actualización de roles

Consulte [el procedimiento de roles](ROLES.md) antes de actualizar. El actualizador comprueba los usuarios con `report-user-roles.js --check` antes de detener la aplicación: exige administrador global activo y bloquea roles antiguos o empresas incoherentes. Esa comprobación no reemplaza la revisión de pendientes en cada navegador ni la prueba de restauración.
