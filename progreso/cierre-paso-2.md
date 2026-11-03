# Paso 2 — cierre local verificado (2026-11-01)

Se completaron los pendientes de esta etapa en la PC de desarrollo. No se actualizó la instalación del cliente ni se modificó la base operativa durante estas pruebas.

## Cambios

- Caché de catálogos y operaciones separada por UUID de terminal registrado en SQL, usuario, rol, versión de acceso y empresas autorizadas. Solo se hidrata después de validar la sesión en el servidor. Otro registro de terminal/base obtiene un espacio distinto. Una copia restaurada de la misma base que conserva UUIDs mantiene su identidad: no constituye un registro nuevo.
- La caché global antigua permanece disponible para recuperación, pero ya no se carga en la aplicación. Cambiar de usuario limpia datos y vistas sensibles en memoria. Las respuestas HTTP de una sesión anterior no se aplican a la nueva. Las superposiciones de productos/recetas/insumos solo incluyen pendientes del usuario, terminal y empresas actuales.
- La cola y las resoluciones temporales mantienen su almacenamiento separado: cambiar de sesión no las elimina ni les reasigna autor o terminal.
- Una apertura sin borrador en caché recupera sus ítems de la operación persistida. Ya no se interpreta la ausencia del borrador como una cancelación. Las aperturas antiguas sin detalle recuperable se conservan para revisión.
- Las operaciones anteriores a esta actualización se identifican por un registro local de revisión, sin modificar su contenido. No se puede reconstruir retrospectivamente si una terminal fue inferida: se exige revisión conservadora de todas esas operaciones. Si tienen firma válida, la asunción administrativa continúa verificándose y auditándose en SQL; si carecen de prueba válida, se conservan para conciliación y no se firman retroactivamente al iniciar sesión.
- La creación/registro de claves captura la identidad de origen y evita solicitudes simultáneas por el mismo usuario/terminal. Una creación pendiente no se registra bajo otro login.

## Evidencia ejecutada

- `npm test`: **80/80**.
- `npm test --prefix server`: **70/70**.
- `npm run lint`, `npm run build`, `npm run build --prefix server`: correctos.
- `npm run test:orders:sql --prefix server -- --browser-recovery`: **31 escenarios SQL/API/realtime y 4 recorridos de navegador aprobados**.

El recorrido automatizado usa Chrome con un perfil temporal y una base SQL aleatoria. Prueba:

1. Crear y firmar una apertura sin conexión. Reconectar, dejar que SQL confirme la apertura y que el cliente persista su referencia; interceptar el envío de ítems. Cerrar el proceso completo de Chrome y arrancarlo con el mismo perfil. También se retira la caché desechable para verificar que la recuperación dependa de la cola persistida. Resultado: misma orden, un ítem, una apertura y una auditoría de apertura; cola vacía.
2. Cambiar de usuario con la consulta de mesas devolviendo 503: no aparecen los marcadores de caché privada ni los de la caché global antigua.
3. Registrar otra terminal para el mismo usuario conservando el almacenamiento anterior: se utiliza un espacio de caché nuevo.
4. Crear una apertura firmada con otro usuario, cerrar su sesión y asumirla explícitamente desde la pantalla administrativa. SQL confirma el ítem, autor original y administrador responsable.

Las bases temporales se eliminan al finalizar. Las pruebas SQL provocan deliberadamente errores de auditoría para comprobar rollback; esos mensajes esperados no significan que la suite falló. La compilación frontend mantiene el aviso de tamaño del bundle.

Capturas revisadas: `evidencias/roles-paso-2/reinicio-antes.png`, `reinicio-despues.png` y `asuncion-despues.png`.

## Repetición

Desde la raíz del repositorio, con dependencias instaladas, SQL local disponible y Chrome:

```sh
npm run build
npm run test:orders:sql --prefix server -- --browser-recovery
```

El runner crea y elimina una base exclusiva para las pruebas. El navegador utiliza Chrome de macOS; en otro sistema se puede definir `CHROME_EXECUTABLE` con la ruta correspondiente. No se debe ejecutar el script de navegador directamente contra una base operativa: exige un nombre `tayta_orders_test_<uuid>`.

La validación de HTTPS y terminales físicas del cliente permanece diferida por decisión del usuario hasta terminar el proceso completo de roles. El cierre documentado corresponde al paso 2 local, no a una autorización de despliegue en producción.
