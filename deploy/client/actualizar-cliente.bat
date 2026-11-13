@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0..\.." || goto :error
set "COMPOSE_FILE=compose.client.yml"

rem La version debe ser un commit completo entregado y validado para esta prueba.
if "%~1"=="" (echo Uso: actualizar-cliente.bat COMMIT_COMPLETO_VALIDADO & goto :error)
set "RELEASE_COMMIT=%~1"
where git >nul 2>&1 || goto :error
where docker >nul 2>&1 || goto :error
docker info >nul 2>&1 || goto :error
if not exist "deploy\client\app.env" (echo ERROR: falta app.env. & goto :error)
if not exist ".env" (echo ERROR: falta .env con POS_HOSTNAME. & goto :error)
git diff --quiet || (echo ERROR: hay cambios locales. & goto :error)
git diff --cached --quiet || (echo ERROR: hay cambios preparados. & goto :error)
for /f "delims=" %%L in ('git ls-files --others --exclude-standard') do (echo ERROR: hay archivos sin seguimiento: %%L & goto :error)
for /f "delims=" %%B in ('git branch --show-current') do set "RAMA_ACTUAL=%%B"
if not "%RAMA_ACTUAL%"=="main" (echo ERROR: la rama activa no es main. & goto :error)
echo Actualizando la referencia de main...
git pull --ff-only || goto :error
for /f "delims=" %%C in ('git rev-parse HEAD') do set "COMMIT_ACTUAL=%%C"
if /I not "%COMMIT_ACTUAL%"=="%RELEASE_COMMIT%" (echo ERROR: main no coincide con el commit validado. No se actualizo la instalacion. & goto :error)
set "APP_VERSION=release-%COMMIT_ACTUAL%"
docker compose -f "%COMPOSE_FILE%" config --quiet || goto :error

echo Registre el commit anterior y la imagen del contenedor actual; conservela o exportela.
docker compose -f "%COMPOSE_FILE%" ps
for /f "delims=" %%I in ('docker compose -f "%COMPOSE_FILE%" ps -q app') do docker inspect --format "Imagen anterior: {{.Image}}" %%I
choice /C SN /N /M "Imagen anterior registrada y conservada? [S/N]: "
if errorlevel 2 goto :cancel
echo Construyendo imagen separada para %COMMIT_ACTUAL%...
docker compose -f "%COMPOSE_FILE%" build app || goto :error

echo Sincronice todas las terminales y detenga las escrituras antes del respaldo final.
echo Verifique RESTORE VERIFYONLY, restaure en otra base y ejecute CHECKDB y migraciones en esa copia.
echo Conserve una copia externa del respaldo y configuracion, y registre los resultados.
choice /C SN /N /M "Respaldos, restauracion de prueba y terminales verificados? [S/N]: "
if errorlevel 2 goto :cancel

echo Comprobando usuarios y roles...
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app node dist/scripts/report-user-roles.js --check || goto :error
echo Consultando el estado de migraciones: el codigo no cero puede indicar migraciones pendientes.
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate status
echo Revise la salida anterior y compare con la prueba en la copia restaurada.
choice /C SN /N /M "Migraciones revisadas y respaldo corresponde a esta base? [S/N]: "
if errorlevel 2 goto :cancel

echo Deteniendo servicios antes de aplicar migraciones...
docker compose -f "%COMPOSE_FILE%" stop app web || goto :stopped_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy || goto :stopped_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate status || goto :stopped_error
docker compose -f "%COMPOSE_FILE%" up -d --no-build --force-recreate --wait --wait-timeout 120 app web || goto :stopped_error

echo Version instalada: %COMMIT_ACTUAL%
echo Para futuras operaciones compose, establezca APP_VERSION=release-%COMMIT_ACTUAL%.
docker compose -f "%COMPOSE_FILE%" ps
docker compose -f "%COMPOSE_FILE%" images app
echo El inicio correcto no sustituye las pruebas de roles, red, ventas e inventario.
echo Las conciliaciones de stock y mesas son procedimientos separados; no se ejecutaron.
echo Recargue cada terminal con la misma URL y siga la lista de aceptacion.
exit /b 0

:cancel
echo Actualizacion cancelada antes de detener los servicios o migrar.
exit /b 1
:stopped_error
echo ERROR: actualizacion interrumpida tras detener servicios. No reanude ventas.
echo Conserve logs, colas, imagen anterior y respaldo; siga el procedimiento de recuperacion supervisado.
exit /b 1
:error
echo ERROR: no se completo la preparacion. Revise el mensaje anterior.
exit /b 1
