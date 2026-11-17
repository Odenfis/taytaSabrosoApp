# Actualización de prueba: porciones y rendimiento

Este documento prepara una intervención posterior. No acredita la instalación ni el estado de la base del cliente. Responsables: una persona coordina terminales y aceptación; otra con acceso SQL verifica base, respaldo y restauración; quien instale registra versión, imagen y resultados. Una misma persona puede asumir varios roles.

## Identificar la entrega

La funcionalidad parte del commit `9f1e780ef60e894286f8a7a42f75be78fcbeb737`. La entrega debe incluir además esta documentación y cualquier corrección de preparación posterior. En el repositorio de preparación, con árbol limpio, registre `git rev-parse HEAD` como **COMMIT_COMPLETO_VALIDADO**; compruebe pruebas e imagen para ese estado, publique el commit y verifique que `origin/main` lo contiene. No confunda este commit con el instalado actualmente en el cliente. No copie archivos de configuración privada ni respaldos al repositorio.

## Antes de la ventana de mantenimiento

- Registrar equipo servidor, instancia y nombre exacto de base del cliente, versión/commit e ID de imagen instalada, imagen anterior conservada, URL HTTPS, configuración y volúmenes de Caddy. Comprobar espacio para imagen, respaldo y restauración. Mantener JWT, perfiles de navegador y URL existentes.
- Revisar y sincronizar las colas en cada terminal y sesión. Documentar y resolver pendientes; no borrarlos ni cambiar de origen. Acordar suspensión de ventas y otras escrituras hasta la aceptación.
- Inspeccionar historial y estado de migraciones de la base identificada. Registrar las pendientes reales: no suponer que solo falta 0019. Verificar usuarios y roles como indica [ROLES.md](ROLES.md).
- Con escrituras detenidas, el responsable SQL crea un respaldo final **COPY_ONLY con CHECKSUM**, ejecuta `RESTORE VERIFYONLY` y guarda copia externa protegida. Registrar ruta, fecha y base origen. Usar una ruta nueva para no sobrescribir respaldos anteriores.
- Restaurar ese respaldo en otra base, con nombre y archivos físicos distintos; `RESTORE FILELISTONLY` permite identificar nombres lógicos para `WITH MOVE`. Ejecutar `DBCC CHECKDB` sobre la copia. Configurar una conexión aislada a esa copia y ensayar allí `prisma migrate deploy` y `prisma migrate status` usando la imagen de entrega. Comprobar que corresponde a la misma secuencia pendiente. Nunca apuntar el ensayo a la base original ni ejecutar seeds, inicializador, `db push` o `migrate reset`.
- Conservar resultados, rutas e identidad de base. Si falla respaldo, restauración, integridad, roles o ensayo, detener el proceso y resolver antes de continuar. El actualizador solicita confirmaciones, pero **no realiza ni verifica** esos pasos por sí solo.

## Ejecución supervisada en Windows

Una vez publicado el commit y completados los pasos anteriores, desde PowerShell en el equipo del cliente:

```powershell
& "RUTA_AL_REPOSITORIO\deploy\client\actualizar-cliente.bat" "COMMIT_COMPLETO_VALIDADO"
```

El script exige `main` limpia y coincidencia exacta tras `git pull --ff-only`; construye `tayta-sabroso:release-<commit>`, verifica roles y muestra el estado de migraciones. Solo después de las confirmaciones detiene app/web, aplica migraciones y comprueba su estado antes de levantar los servicios. Compare su salida con el ensayo y conserve los logs. Una `main` remota adelantada hará fallar la coincidencia: preparar una entrega identificada y validada antes de reintentar.

Registre el ID de la imagen nueva y configure `APP_VERSION=release-<commit>` en el entorno o `.env` de la instalación para futuros comandos Compose que recreen contenedores. No cambie secretos, URL ni volúmenes. Compruebe `/health`, login y lectura SQL; confirme con sesión autorizada el estado fiscal, la ausencia de acciones fiscales y los cobros normales. Las opciones `FISCAL_TEST_ENABLED` y `FISCAL_BETA_SEND_ENABLED` se fuerzan a `false` en Compose.

## Aceptación y recuperación

Complete [ACEPTACION-PRUEBAS.md](ACEPTACION-PRUEBAS.md) en las terminales reales, con insumos identificados para pruebas. Las fichas antiguas se convierten explícitamente y pueden necesitar nuevos insumos Porción; no cambie unidades de insumos históricos. La confirmación modifica stock, costos y Kardex y carece de reversión ordinaria. El reporte consolidado y la exportación aún no están disponibles.

Si hay fallo tras detener los servicios o en una prueba crítica, no habilite ventas. Conserve evidencias y siga recuperación de [ROLES.md](ROLES.md). Si hubo operaciones posteriores al respaldo, respalde primero el estado actual y concilie operaciones y colas antes de cualquier restauración. La versión anterior necesita una base compatible y su imagen/configuración conservadas; no improvise SQL inverso.

Pendiente antes de aprobar: probar el `.bat` en Windows y la instalación completa con la base y terminales reales, incluidos impresión y recuperación de conexión.
