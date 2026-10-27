@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Ejecutar desde cualquier carpeta: siempre usar la raiz de este repositorio.
cd /d "%~dp0..\.." || goto :error
set "COMPOSE_FILE=compose.client.yml"

echo.
echo === Actualizacion Tayta y Sabroso ===
echo Carpeta: %CD%

where git >nul 2>&1 || (echo ERROR: Git no esta disponible. & goto :error)
where docker >nul 2>&1 || (echo ERROR: Docker no esta disponible. & goto :error)
where powershell >nul 2>&1 || (echo ERROR: PowerShell no esta disponible. & goto :error)
docker info >nul 2>&1 || (echo ERROR: Docker Desktop no esta iniciado. & goto :error)
if not exist "deploy\client\app.env" (echo ERROR: falta deploy\client\app.env. & goto :error)
if not exist ".env" (echo ERROR: falta .env con POS_HOSTNAME. & goto :error)
docker compose -f "%COMPOSE_FILE%" config --quiet || (echo ERROR: la configuracion Docker no es valida. & goto :error)

git diff --quiet || (echo ERROR: hay cambios locales sin confirmar. Revise git status. & goto :error)
git diff --cached --quiet || (echo ERROR: hay cambios preparados sin confirmar. Revise git status. & goto :error)
for /f "delims=" %%B in ('git branch --show-current') do set "RAMA_ACTUAL=%%B"
if not "%RAMA_ACTUAL%"=="main" (echo ERROR: la rama activa no es main. & goto :error)

echo.
echo [1/10] Descargando la version publicada...
git pull --ff-only || goto :error
for /f "delims=" %%C in ('git rev-parse --short HEAD') do set "COMMIT_ACTUAL=%%C"
echo Commit descargado: %COMMIT_ACTUAL%
if not exist "server\prisma\migrations\0006_purchase_item_discount\migration.sql" (echo ERROR: falta migracion 0006. & goto :error)
if not exist "server\prisma\migrations\0007_sale_prices_include_igv\migration.sql" (echo ERROR: falta migracion 0007. & goto :error)
if not exist "server\src\scripts\reconcile-negative-stock.ts" (echo ERROR: falta el conciliador de stock. & goto :error)
if not exist "server\src\scripts\configure-tayta-tables.ts" (echo ERROR: falta el configurador de mesas. & goto :error)

echo.
echo [2/10] Construyendo la imagen nueva...
docker compose -f "%COMPOSE_FILE%" build app || goto :error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app test -f dist/scripts/reconcile-negative-stock.js || (echo ERROR: la imagen no incluye el conciliador. & goto :error)
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app test -f dist/scripts/configure-tayta-tables.js || (echo ERROR: la imagen no incluye el configurador de mesas. & goto :error)

echo.
echo Antes de continuar, confirme que todos los equipos sincronizaron sus operaciones
echo pendientes y que hizo y verifico un respaldo NUEVO de la base SQL del cliente.
choice /C SN /N /M "Respaldo verificado y terminales listas? [S/N]: "
if errorlevel 2 (echo Actualizacion cancelada; la aplicacion sigue funcionando. & exit /b 1)

echo.
echo [3/10] Deteniendo la aplicacion para evitar escrituras durante la migracion y conciliacion...
docker compose -f "%COMPOSE_FILE%" stop app web || goto :error

echo.
echo [4/10] Aplicando migraciones a la base configurada en app.env...
rem Se usa app directamente: no ejecuta el inicializador de una base nueva.
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy || goto :migration_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate status || goto :migration_error

echo.
echo [5/10] Generando informe de conciliacion sin modificar datos...
set "RUNSTAMP="
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmssfff"') do set "RUNSTAMP=%%T"
if not defined RUNSTAMP (echo ERROR: no se pudo generar el identificador del informe. & goto :reconcile_error)
set "REPORT_DIR=%CD%\deploy\client\reports\%RUNSTAMP%"
if exist "%REPORT_DIR%" (echo ERROR: la carpeta del informe ya existe. & goto :reconcile_error)
mkdir "%REPORT_DIR%" || goto :reconcile_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/reconcile-negative-stock.js --report=/reports/antes.json || goto :reconcile_error
if not exist "%REPORT_DIR%\antes.json" (echo ERROR: no se guardo el informe previo. & goto :reconcile_error)
echo Informe previo: %REPORT_DIR%\antes.json
start "" notepad "%REPORT_DIR%\antes.json"
echo Revise en el informe cada insumo corregible y los casos de revision_manual.
echo Los casos de revision_manual NO se modificaran automaticamente.
choice /C SN /N /M "Aplicar solo los saldos verificables del informe? [S/N]: "
if errorlevel 2 goto :review_cancel

echo.
echo [6/10] Aplicando saldos verificables y comprobando el resultado...
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/reconcile-negative-stock.js --report=/reports/aplicado.json --apply --backup-verified || goto :reconcile_error
if not exist "%REPORT_DIR%\aplicado.json" (echo ERROR: no se guardo el informe de aplicacion. & goto :reconcile_error)
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/reconcile-negative-stock.js --report=/reports/despues.json || goto :reconcile_error
if not exist "%REPORT_DIR%\despues.json" (echo ERROR: no se guardo el informe posterior. & goto :reconcile_error)

echo.
echo [7/10] Revisando la distribucion de mesas de El Tayta...
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/configure-tayta-tables.js --report=/reports/mesas-antes.json || goto :reconcile_error
if not exist "%REPORT_DIR%\mesas-antes.json" (echo ERROR: no se guardo el informe de mesas. & goto :reconcile_error)
start "" notepad "%REPORT_DIR%\mesas-antes.json"
echo Revise mesas actuales, pedidos activos y conflictos. La aplicacion sigue detenida.
choice /C SN /N /M "Configurar ambientes y mesas de El Tayta? [S/N]: "
if errorlevel 2 goto :review_cancel

echo.
echo [8/10] Configurando mesas y comprobando el resultado...
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/configure-tayta-tables.js --report=/reports/mesas-aplicado.json --apply --backup-verified --terminals-synced || goto :reconcile_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps -v "%REPORT_DIR%:/reports" app node dist/scripts/configure-tayta-tables.js --report=/reports/mesas-despues.json || goto :reconcile_error
if not exist "%REPORT_DIR%\mesas-despues.json" (echo ERROR: no se guardo el informe posterior de mesas. & goto :reconcile_error)

echo.
echo [9/10] Recreando los contenedores con la imagen recien construida...
docker compose -f "%COMPOSE_FILE%" up -d --no-build --force-recreate --wait --wait-timeout 120 app web || goto :start_error

echo.
echo [10/10] Estado de la instalacion...
docker compose -f "%COMPOSE_FILE%" ps || goto :start_error
docker compose -f "%COMPOSE_FILE%" images app
docker compose -f "%COMPOSE_FILE%" logs --tail=25 app web
echo.
echo Codigo instalado: %COMMIT_ACTUAL%
echo Informes de conciliacion: %REPORT_DIR%
echo Abra la URL habitual y recargue con Ctrl+F5 en cada navegador.
echo Compruebe el saldo de Tomate Italiano antes y despues de una compra pequena.
echo Compruebe las 35 mesas, las 8 sillas y el primer pedido Delivery/Llevar con numero 36.
echo Si no aparece el cambio, comparta el commit y la tabla de imagen mostrados arriba.
exit /b 0

:migration_error
echo.
echo ERROR: la migracion o su verificacion fallo. Los contenedores siguen detenidos.
echo No inicie ventas ni ejecute el inicializador; conserve el mensaje y el respaldo.
exit /b 1

:review_cancel
echo.
echo Conciliacion cancelada tras generar el informe. Los contenedores siguen detenidos.
echo Revise los informes en %REPORT_DIR% y conserve el respaldo. No inicie ventas aun.
exit /b 1

:reconcile_error
echo.
echo ERROR: conciliacion incompleta. Los contenedores siguen detenidos.
echo Conserve el respaldo y los informes disponibles en %REPORT_DIR%.
echo No inicie ventas hasta revisar el error.
exit /b 1

:start_error
echo.
echo ERROR: la aplicacion no pudo iniciarse o verificarse. Revise el estado de Docker.
echo Conserve el respaldo y los informes en %REPORT_DIR%.
exit /b 1

:error
echo.
echo ERROR: actualizacion interrumpida. Revise el mensaje anterior.
exit /b 1
