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
docker info >nul 2>&1 || (echo ERROR: Docker Desktop no esta iniciado. & goto :error)
if not exist "deploy\client\app.env" (echo ERROR: falta deploy\client\app.env. & goto :error)
if not exist ".env" (echo ERROR: falta .env con POS_HOSTNAME. & goto :error)
docker compose -f "%COMPOSE_FILE%" config --quiet || (echo ERROR: la configuracion Docker no es valida. & goto :error)

git diff --quiet || (echo ERROR: hay cambios locales sin confirmar. Revise git status. & goto :error)
git diff --cached --quiet || (echo ERROR: hay cambios preparados sin confirmar. Revise git status. & goto :error)
for /f "delims=" %%B in ('git branch --show-current') do set "RAMA_ACTUAL=%%B"
if not "%RAMA_ACTUAL%"=="main" (echo ERROR: la rama activa no es main. & goto :error)

echo.
echo [1/6] Descargando la version publicada...
git pull --ff-only || goto :error
for /f "delims=" %%C in ('git rev-parse --short HEAD') do set "COMMIT_ACTUAL=%%C"
echo Commit descargado: %COMMIT_ACTUAL%
if not exist "server\prisma\migrations\0006_purchase_item_discount\migration.sql" (echo ERROR: falta migracion 0006. & goto :error)
if not exist "server\prisma\migrations\0007_sale_prices_include_igv\migration.sql" (echo ERROR: falta migracion 0007. & goto :error)

echo.
echo [2/6] Construyendo la imagen nueva...
docker compose -f "%COMPOSE_FILE%" build app || goto :error

echo.
echo Antes de continuar, confirme que todos los equipos sincronizaron sus operaciones
echo pendientes y que hizo y verifico un respaldo NUEVO de la base SQL del cliente.
choice /C SN /N /M "Respaldo verificado y terminales listas? [S/N]: "
if errorlevel 2 (echo Actualizacion cancelada; la aplicacion sigue funcionando. & exit /b 1)

echo.
echo [3/6] Deteniendo la aplicacion para evitar escrituras durante la migracion...
docker compose -f "%COMPOSE_FILE%" stop app web || goto :error

echo.
echo [4/6] Aplicando migraciones a la base configurada en app.env...
rem Se usa app directamente: no ejecuta el inicializador de una base nueva.
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy || goto :migration_error
docker compose -f "%COMPOSE_FILE%" run --rm --no-deps app ./node_modules/.bin/prisma migrate status || goto :migration_error

echo.
echo [5/6] Recreando los contenedores con la imagen recien construida...
docker compose -f "%COMPOSE_FILE%" up -d --no-build --force-recreate --wait --wait-timeout 120 app web || goto :error

echo.
echo [6/6] Estado de la instalacion...
docker compose -f "%COMPOSE_FILE%" ps || goto :error
docker compose -f "%COMPOSE_FILE%" images app
docker compose -f "%COMPOSE_FILE%" logs --tail=25 app web
echo.
echo Codigo instalado: %COMMIT_ACTUAL%
echo Abra la URL habitual y recargue con Ctrl+F5 en cada navegador.
echo Compruebe compra con precio S/ 16.55 y cobro de producto S/ 45.00.
echo Si no aparece el cambio, comparta el commit y la tabla de imagen mostrados arriba.
exit /b 0

:migration_error
echo.
echo ERROR: la migracion o su verificacion fallo. Los contenedores siguen detenidos.
echo No inicie ventas ni ejecute el inicializador; conserve el mensaje y el respaldo.
exit /b 1

:error
echo.
echo ERROR: actualizacion interrumpida. Revise el mensaje anterior.
exit /b 1
