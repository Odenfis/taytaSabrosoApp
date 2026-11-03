# Paso 3 — interfaz, datos y administración por perfil

Cierre local verificado el 2026-11-01. No se actualizó la instalación del cliente ni se aplicaron migraciones a la base operativa. Los cambios utilizan el esquema existente de usuarios, auditoría y claves offline.

## Funcionalidad entregada

- Pantallas y navegación conservan la matriz central; los controles compartidos consultan los mismos permisos. Se protegen además las acciones del contexto antes de modificar datos optimistas o encolar cambios.
- Mozo: toma pedidos de cualquier mesa autorizada, envía a cocina y marca por cobrar. Una mesa por cobrar abre su pedido, no la pantalla de pago. No ve caja, turnos financieros, indicadores de rentabilidad ni módulos administrativos.
- Cajera: consulta pedidos sin controles de notas/cantidad ni despacho, cobra, registra movimientos y opera caja/turno. Si faltan platos por despachar, se solicita intervención del mozo/jefe. Puede ir al cobro de una orden despachada sin ejecutar la acción de marcar por cobrar, que no pertenece a su perfil.
- Jefe: conserva pedidos, cobros, caja, compras, inventario, productos y recetas; puede crear mesas físicas mediante `tables.manage`. Se eliminó la condición antigua que privilegiaba «Coordinador». Sin bancos, reportes globales ni seguridad.
- Administrador: conserva acceso completo dentro de su alcance. La gestión de usuarios y la lista global de claves requieren administrador global, conforme a la API existente.
- Los selectores solo presentan empresas autorizadas; «Ambas» aparece si hay más de una. Los indicadores de Food Cost y las tarjetas de saldo bancario se muestran solo con el permiso correspondiente.
- La carga de datos omite las fuentes no autorizadas, en lugar de enviar solicitudes que terminaban en 403. Se mantienen los datos mínimos de medios de pago necesarios para cobrar y corregir con autorización. La corrección sigue requiriendo PIN administrativo en el servidor.
- Las lecturas de comandas del mozo conservan platos, precios y totales, pero omiten medio de pago, efectivo recibido y vuelto, también al consultar una comanda histórica por identificador.
- Los avisos de mesas, pedidos, productos e impresoras usan salas de Socket.IO por permiso y empresa, como los eventos de caja/inventario. La revocación de sesión por cambio de acceso desconecta el socket.

## Caché y cuentas divididas

Se extendió el aislamiento del paso 2 a la caché específica de cuentas por comensal. La caché global antigua de receptores/tickets no se carga. Los pendientes permanecen separados y conservan autor/terminal.

La pantalla de pago y el reparto bloquean nuevos cobros si hay pendientes de otra identidad/terminal o conflictos; también se impide crear otro reparto si existen operaciones de reparto/abonos y esta sesión no dispone de una copia local recuperable. Se muestra que hace falta conciliación. No se borra ni se atribuye la operación a la nueva sesión.

## Usuarios y seguridad

- Gestión ya existente probada por HTTP y navegador: creación, edición de rol, restablecimiento de PIN y desactivación; cambios reflejados en SQL y auditoría.
- Pruebas HTTP de PIN duplicado, versión obsoleta, rechazo a perfiles no autorizados y revocación de sesión. Las comprobaciones previas del último administrador se conservan en la suite de servicios.
- Nueva lista de claves offline para administrador global, sin devolver material de clave ni credenciales. Pantalla en Configuración → Seguridad con confirmación de revocación.
- La revocación y su registro de usuario/terminal en auditoría se guardan en una transacción. La propia clave conserva fecha y administrador que la revocó. Una clave revocada no permite aplicar sus firmas pendientes.
- El cambio de PIN propio mantiene su política actual: administrador, servicio centralizado, PIN único, auditoría y revocación de sesiones. No se habilitó autoservicio de PIN para otros perfiles.

## Pruebas ejecutadas

- `npm run lint`: correcto.
- `npm run build` y `npm run build --prefix server`: correctos. Vite conserva su aviso de bundle grande.
- `npm test`: **81/81**.
- `npm test --prefix server`: **71/71**.
- `npm run test:orders:sql --prefix server -- --roles --browser-recovery`: correcto; base temporal eliminada al finalizar.

El último comando ejecuta los **31 escenarios SQL/API/realtime** existentes y añade:

1. **112 combinaciones denegadas de ruta/perfil** mediante HTTP real, generadas a partir del inventario central, más lecturas permitidas y límites de empresa.
2. Creación de mesa física por jefe y ocultación de detalles de caja en una consulta del mozo.
3. Eventos de comanda recibidos por el mozo, eventos de caja no recibidos por ese perfil, recepción de caja por la cajera y desconexión de una sesión revocada.
4. Los cuatro perfiles en Chrome: navegación, empresas, indicadores financieros, controles de mesa, pedido de solo consulta para cajera y marcado por cobrar para mozo. Sin consultas HTTP prohibidas durante esos recorridos.
5. Cuenta con pendiente de otro autor: botón de reparto bloqueado, receptor de caché antigua ausente y autor/terminal originales conservados.
6. Administrador crea usuario, cambia perfil, restablece PIN y lo desactiva desde la pantalla. Se comprueban login y tres auditorías en SQL.
7. Revocación de una clave desde la pantalla, con comprobación de clave y auditoría en SQL.
8. Reducción de rol y cambio de empresa con caja abierta en el navegador: cierre de sesión y ausencia de datos de la sesión anterior al volver a ingresar.
9. Regresión del paso 2: cierre y arranque completos de Chrome tras confirmar una apertura, recuperación sin duplicados, cambio de usuario, nuevo registro de terminal y asunción de otro autor.

Capturas en `evidencias/roles-paso-3/`. Son datos sintéticos; los errores SQL de auditoría que aparecen durante ciertos escenarios se provocan deliberadamente para comprobar rollback.

## Repetición y siguiente etapa

Desde la raíz, con SQL local, dependencias y Chrome disponibles:

```sh
npm run build
npm run test:orders:sql --prefix server -- --roles --browser-recovery
```

El runner crea una base de pruebas aleatoria y la elimina al terminar. `CHROME_EXECUTABLE` permite indicar otra ubicación del navegador.

El paso 4 sigue siendo la validación operativa conjunta, comprobación de actualización/migraciones y respaldo restaurable, revisión de usuarios reales y preparación de entrega. HTTPS y las terminales físicas del cliente permanecen diferidos según lo acordado. Estas pruebas no constituyen una autorización de despliegue ni una afirmación de cobertura exhaustiva de toda combinación posible.
