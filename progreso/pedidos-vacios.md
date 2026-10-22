# Pedidos vacíos — implementación y puesta en marcha

Implementado el 2026-10-21. La implementación se verificó en bases temporales. Posteriormente, a solicitud explícita del usuario, se aplicó la migración en `TaytaSabroso` y se repitió el reset con `seed.ts` y `seed-empty.ts`; la bitácora registra su verificación.

## Regla aplicada

- Abrir la pantalla de una mesa vacía no crea un pedido.
- Retirar el último producto, con Eliminar o Disminuir hasta cero, elimina físicamente un borrador nuevo sin despacho ni pagos y libera su mesa.
- Si hubo despacho, se conserva el pedido con `estado=anulado`, `esta_eliminado=1`, cierre y totales cero. Las devoluciones de inventario y el historial se mantienen.
- Los pedidos cobrados rechazan cambios de cantidad, eliminación y notas. No se reutilizan números de ticket.
- La migración marca todos los pedidos anteriores con historial de despacho incierto. Se conservan aunque estén vacíos; no se inventan fechas de despacho antiguas.

## Persistencia y contratos

Migración `0004_empty_orders`:

- `pedidos.primer_despacho_utc`: primer despacho, incluso sin receta.
- `pedidos.historial_despacho_conocido`: false para filas anteriores; true por defecto para las nuevas.
- `resultados_pedidos`: recibos de cancelación/reintento sin FK al pedido. No son pedidos ni ventas; sobreviven al borrado físico para impedir que un replay recree la orden. También mantienen los aportes iniciales de cada terminal para no cancelar productos de otra.

DELETE de ítem acepta `?clientOpId=...`; PATCH de cantidad acepta `clientOpId` opcional. Clientes anteriores siguen funcionando; los nuevos conservan el mismo identificador durante reintentos. Un pedido eliminado devuelve un `OrderDTO` final con `isDeleted=true`, `status=anulado`, `items=[]` y totales cero.

Dos operaciones autenticadas adicionales coordinan aperturas pendientes:

- `POST /api/operations/orders/opening-items`: `{ openingClientOpId, items: [{ productId, quantity, notes? }] }`. Reconciliación del aporte inicial, sin duplicarlo al reintentar.
- `POST /api/operations/orders/cancel-opening`: `{ openingClientOpId }`. Cancela una apertura aún no enviada o retira su aporte pendiente sin borrar adiciones de otra terminal. Un pedido ya despachado se conserva.

Las mutaciones del pedido se serializan con bloqueos SQL y reintentos acotados ante deadlocks. La mesa solo se libera si conserva el vínculo al pedido. Eventos de órdenes, inventario y caja después del commit; las anulaciones se notifican como tales. Los avisos de mesa incluyen el pedido que los originó para ignorar liberaciones antiguas tras reabrirla.

El cliente persiste aperturas, cancelaciones, eliminaciones y cambios de cantidad antes de modificar su estado optimista. Una cancelación durante la apertura/flush se completa en el servidor; REST/realtime no reincorporan pedidos ya anulados durante la sesión.

## Despliegue en la base operativa

La migración fue probada primero en bases temporales y después aplicada en la base operativa durante el reset solicitado del 2026-10-21. Para otras instalaciones, aplicar la migración antes de activar este código con el procedimiento habitual de respaldo y mantenimiento:

```sh
npm run prisma:deploy --prefix server
npm run prisma:generate --prefix server
npm run build
npm run build --prefix server
```

Reiniciar el backend con el nuevo build y recargar las terminales. No ejecutar seeds para desplegar esta corrección. Los seeds solo se ajustaron para incluir los recibos en futuros resets explícitamente solicitados; se ejecutaron después por solicitud explícita de reset del usuario.

## Revisión y limpieza histórica separadas

Después de aplicar la migración, esta revisión es de solo lectura:

```sh
npm run orders:review --prefix server
npm run orders:review --prefix server -- --ids=UUID_REVISADO
```

Muestra pedidos sin ítems, estado, despacho conocido, pagos y elegibilidad. Los anteriores a la migración son inciertos y quedan fuera de la eliminación automática. Para un borrador nuevo elegible, el procedimiento separado es:

```sh
npm run orders:review --prefix server -- --apply --ids=UUID_REVISADO
```

`--apply` exige IDs explícitos. Revalida cada pedido bajo bloqueo: si recibió productos, fue despachado/cobrado, se eliminó o su historial es incierto, lo omite. Mantiene los recibos de cancelación y no reduce la secuencia de tickets. No ejecutar sobre datos antiguos inciertos sin una investigación independiente. Este comando de aplicación **no se ejecutó en la base operativa**.

## Verificación

- 28 pruebas cliente y 26 pruebas servidor; TypeScript y ambos builds aprobados. Otros 13 escenarios SQL de Productos aprobados como regresión (82 comprobaciones en total).
- 15 escenarios SQL/API/Socket.IO en bases aleatorias `tayta_orders_test_<uuid>`: migración con datos previos/default nuevo, eliminación física, reducción a cero, totales y reducción parcial idempotente, despacho con/sin receta, devolución única, protección de cobrados, replay tras reapertura, concurrencia de adición/eliminación, cancelación antes/después de abrir, flush repetido, aportes de dos terminales, cancelación durante flush, limpieza que revalida y eventos reales para dos sockets.
- Navegador sobre base temporal: agregar → disminuir a cero → mesa libre → recargar sin reaparición; despachar → disminuir a cero → mesa libre. Evidencia: `evidencias/pedidos-mesa-libre.png`.
- Se comprobaron cancelación durante solicitudes, 401/reingreso, recarga de cola y fallos de almacenamiento con pruebas cliente. No se presentan como pruebas físicas de corte de LAN/tablet.
- Bases temporales eliminadas al cerrar. Estas pruebas no modificaron la base operativa; la migración y el reset posterior solicitado están registrados aparte en la bitácora. El modo de navegador aprobó los 15 escenarios; se detuvo su proceso hijo al terminar porque la sesión no conservaba stdin, y el supervisor confirmó la eliminación de su BD.
- Continúa el aviso de bundle frontend mayor a 500 kB. Cocina/Barra y el smoke E2E global siguen pendientes.

Comandos de regresión:

```sh
npm test
npm test --prefix server
npm run test:orders:sql --prefix server
npm run test:products:sql --prefix server
```

Para revisión visual aislada: `npm run test:orders:sql --prefix server -- --browser`, en una terminal con entrada interactiva; PIN temporal 9876, puerto 4310. Escribir `fin` y Enter cierra la prueba y elimina su base.
