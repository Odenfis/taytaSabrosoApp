# Paso 1: inventario de permisos, ámbito y auditoría

La matriz ejecutable de verbos y permisos está en `server/src/lib/route-permissions.ts`. La tabla agrupa rutas que tienen el mismo tratamiento; los parámetros `:id` se resuelven en el servidor. Un valor de empresa o de usuario enviado por el navegador no acredita acceso ni identidad.

| Rutas | Permiso | Alcance de empresa | Auditoría al modificar |
| --- | --- | --- | --- |
| GET `/catalogs/companies`, `/tables`, `/products` | `company.read`, `tables.read`, `products.sale_read` respectivamente | Consulta filtrada por asignación de la sesión | Lectura; sin auditoría transaccional |
| POST `/catalogs/tables/physical`, POST `/tables`, PATCH/DELETE `/tables/:id` | `tables.manage` | Empresa del cuerpo al crear; mesa persistida al cambiar; física solo El Tayta | `crear_mesa`, `actualizar_mesa`, `eliminar_mesa` en la transacción |
| POST `/catalogs/products`, PATCH/DELETE `/products/:id` | `products.manage` | Empresa del cuerpo o producto persistido | `crear_producto`, `actualizar_producto`, `eliminar_producto` en la transacción |
| GET/POST `/catalogs/insumos`, PATCH/DELETE `/insumos/:id` | `inventory.read` / `inventory.manage` | Empresa asignada y recursos compartidos en lectura; identificación persistida en escritura | `crear_insumo`, `actualizar_insumo`, `eliminar_insumo` en la transacción |
| GET/POST `/catalogs/recipes`, PATCH/DELETE `/recipes/:id` | `recipes.manage` | Empresa de receta; producto e insumos comprobados al guardar | `crear_receta`, `actualizar_receta`, `eliminar_receta` en la transacción |
| GET/POST `/catalogs/bank-accounts`, PATCH/DELETE `/bank-accounts/:id` | `banks.manage` | Empresa de la cuenta persistida o del cuerpo al crear | `crear_cuenta_bancaria`, `actualizar_cuenta_bancaria`, `eliminar_cuenta_bancaria` en la transacción |
| GET/POST `/catalogs/payment-methods`, PATCH/DELETE `/payment-methods/:id` | `payments.read` / `banks.manage` | Lectura por empresa; configuración exige administrador global; cuenta bancaria de la misma empresa | `crear_medio_pago`, `actualizar_medio_pago`, `eliminar_medio_pago` en la transacción |
| GET/POST `/catalogs/printers`, PATCH/DELETE `/printers/:id` | `printers.read` / `printers.manage` | Lectura por empresa o compartida; escritura por recurso | `crear_impresora`, `actualizar_impresora`, `eliminar_impresora` en la transacción |
| GET `/operations/orders/active`, `/orders/:id` | `orders.read` | Consulta filtrada o comanda persistida | Lectura; sin auditoría transaccional |
| POST `/operations/orders/open`, `/opening-items`, `/cancel-opening`, `/quick-bar` | `orders.modify` | Mesa, comanda o empresa de la apertura; productos verificados en servicio | `abrir_pedido`, `sincronizar_apertura`, `cancelar_apertura`, `abrir_pedido_rapido` en la transacción cuando hay modificación |
| POST `/operations/orders/:id/items`, PATCH `.../quantity`, PATCH `.../notes`, DELETE `/operations/orders/:id/items/:itemId` | `orders.modify` | Comanda persistida; producto y línea comprobados | `agregar_item`, `actualizar_cantidad`, `actualizar_notas`, `quitar_item` en la transacción |
| POST `/operations/orders/:id/send-to-kitchen`, `/tables/:id/por-cobrar` | `orders.dispatch` / `orders.mark_for_billing` | Comanda o mesa persistida; insumos de empresa o compartidos | `enviar_cocina`, `marcar_por_cobrar` en la transacción |
| GET/POST `/operations/orders/:id/bills`, POST `/operations/bills/:id/pay`, POST `/operations/tables/:id/pay` | `payments.read` / `payments.collect` | Empresa de comanda/cuenta/mesa; platos, medio y cuenta bancaria comprobados | `repartir_cuenta`, `abonar_cuenta`, `cobrar_mesa` en la transacción |
| GET/POST `/operations/purchases`, POST `/purchases/:id/regularize` | `purchases.read` / `purchases.manage` | Empresa del cuerpo o compra; insumos y cuenta comprobados | `crear_compra`, `regularizar_compra` en la transacción |
| GET `/operations/kardex`, POST `/kardex/adjustments` | `inventory.read` / `inventory.manage` | Empresa del movimiento; insumo propio o compartido | `ajustar_kardex` en la transacción |
| GET `/operations/shifts/records`, POST `/shifts/switch`, GET/POST `/transactions` | `cash.read`, `cash.close`, `cash.manual` | Empresa de sesión y cuerpo; cuenta y medio comprobados en movimientos | `cerrar_turno`, `crear_movimiento_caja` en la transacción |
| GET/POST `/operations/transactions/:id/corrections` | `payments.correct` | Empresa del cobro; corrección exige PIN de administrador y verifica medio/cuenta | `corregir_medio_pago` y registro de corrección en la transacción |
| GET `/reports/ratios`, `/reports/summary` | `reports.financial` | Administrador; agregados restringidos a su empresa si está asignado | Lectura; sin auditoría transaccional |
| GET `/sync/client-ops` | `security.manage` | Solo administrador global | Lectura; sin auditoría transaccional |
| GET/POST `/users`, PATCH `/users/:id` | `users.manage` | Solo administrador global; usuarios asignados explícitamente | `auditoria_acceso_usuarios` en la transacción de cada cambio |
| POST `/auth/login`, `/auth/logout`, GET `/auth/me`, PATCH `/auth/pin` | Login público; resto sesión; PIN requiere administrador | Empresas y turnos filtrados en sesión; PIN propio | Cambio de PIN en `auditoria_acceso_usuarios`; login/logout no generan auditoría persistente |

`auditOperation` recibe usuario y terminal de `req.auth`, y escribe en la transacción del servicio. Las operaciones antiguas y los pendientes offline sin identidad verificable no se atribuyen retroactivamente. El registro `operaciones_cliente` es diagnóstico posterior a la operación, no sustituye la auditoría transaccional.

Alcance del paso: no acredita identidad de operaciones originadas sin conexión, aislamiento de la caché ni controles visuales completos; corresponden a los pasos siguientes. Los reintentos solo son idempotentes donde existe una clave y una regla de deduplicación específicas.
