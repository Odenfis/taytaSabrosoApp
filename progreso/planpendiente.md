# Plan pendiente — Ruta a producción

> Actualizado: **2026-10-21**. Orden vigente acordado con el usuario.
> Evidencia e historial: `progreso/progress.md`.
> El primer bloque implementado es **sesiones y arranque de producción**.
> Su cierre técnico no significa que el sistema completo esté listo para el piloto.

## Arquitectura y alcance acordados

- Dos locales separados, cada uno con una PC Windows que aloja aplicación, API,
  Socket.IO y SQL Server. Meseros, cocina y caja trabajan en LAN aunque no haya internet.
- Azure consolida **la información completa de negocio de ambos locales**, incluidos
  detalles de operaciones, cuando se implemente la sincronización. Durante un corte
  conserva la última información recibida y debe mostrar su antigüedad.
- Primera versión de Azure: consulta consolidada, sin crear ventas ni editar catálogos
  desde la nube. Administración central y distribución de cambios quedan para otra etapa.
- Cada local es la autoridad de sus operaciones; Azure recibe datos confirmados y no
  vuelve a ejecutar cobros ni descuentos de stock.
- POS interno: emisión electrónica fuera del alcance de esta versión.
- Pruebas de negocio en una base separada; no resetear la base actual.

## 1. Sesiones y arranque — implementado y verificado

- [x] Validador compartido HTTP/Socket.IO de JWT, sesión, vencimiento, usuario y dispositivo.
- [x] JWT único por login, revocación al logout y desconexión de sockets de esa sesión.
- [x] Vencimiento de sockets y revalidación al solicitar salas; errores de infraestructura
  diferenciados de autenticación.
- [x] Identidad persistente por perfil/origen del navegador, sin terminal fija compartida.
- [x] 401 durante replay conserva cola y solicita login; logout confirma revocación
  únicamente cuando el servidor la confirma.
- [x] Backend Node ESM en `dist/index.js`, recursos HTML empaquetados, sin seeds.
- [x] Configuración de arranque validada y orígenes explícitos HTTP/WebSocket.
- [x] TypeScript, builds, 22 pruebas de servidor y 7 de cliente.
- [x] Smoke del artefacto compilado conectado a SQL Server, de solo lectura.
- [ ] Refrendo visual en navegador: login/logout, aviso de sesión inválida, reautenticación
  con cola y dos perfiles con distintas identidades. No confundirlo con pruebas automatizadas.

## 2. Maestro de Productos — implementado antes de Cocina/Barra

- [x] Módulo Productos antes de Fichas; lista, búsqueda, filtros y modal compartido.
- [x] Alta sin receta, edición, disponibilidad e identificación de empresa en Ambas.
- [x] Seleccionar/arrastrar URL no cierra el modal; confirmación antes de descartar cambios.
- [x] Crear/Ver ficha desde Productos y retorno al producto exacto desde Fichas.
- [x] Alta de ficha distingue producto existente/nuevo; aviso de nombre repetido.
- [x] Empresa fija en edición de ficha y cambio de vínculo explícito.
- [x] Seguimiento: 20 pruebas cliente, 13 escenarios SQL aislados y recorridos visuales aprobados.
- [x] Producto/fichas coherentes en una transacción; ingredientes e historial conservados.
- [x] UUID estable, control de versión, conflictos revisables y cola durable para productos.
- [x] Alta/edición offline acumuladas; recuperación desde cola tras F5.
- [x] REST completo tras avisos de producto/ficha, preservando pendientes locales.
- [x] POS por empresa de mesa, Brasas y rechazo de nuevas unidades no disponibles.
- [x] Recetas por vínculo/empresa; fallback antiguo solo sin vínculo y sin ambigüedad.
- [x] TypeScript, builds, 18 pruebas cliente, 26 servidor y 13 escenarios SQL aislados.
- [x] Navegador: escritorio/tablet, alta/F5, ficha coherente, offline/F5/replay,
  dos terminales, conflicto explícito y propagación de disponibilidad.
- [ ] Completar en el smoke E2E: corte real durante replay, reingreso visual tras 401
  con alta pendiente y ciclo completo de venta/cobro desde navegador.
- [ ] Validación en tablet física y LAN del local. La revisión visual usa viewports de navegador.

Comandos: `npm test`, `npm test --prefix server` y, desde `server/`,
`npm run test:products:sql`. Este último crea/elimina una BD temporal independiente;
no ejecuta seeds sobre la base actual. Evidencia detallada en la bitácora.

## Corrección de pedidos vacíos — implementada antes de Cocina/Barra

- [x] Borrador vacío nuevo eliminado físicamente; pedido despachado conservado como anulado.
- [x] Respuesta final, protección de cobrados, cantidades cero y tickets sin reutilización.
- [x] Apertura/cancelación y flush idempotente por terminal; cola durable y liberación condicionada al pedido.
- [x] Fecha de despacho, historial antiguo conservador y recibos para reintentos tras borrado físico.
- [x] 28 pruebas cliente, 26 servidor, 15 escenarios SQL/API/realtime; TypeScript y builds.
- [x] Navegador aislado: vaciado antes/después de despacho y mesa libre tras recargar.
- [x] Revisión de solo lectura y procedimiento separado de limpieza selectiva preparados.
- [x] Aplicada `0004_empty_orders` en `TaytaSabroso` durante el reset solicitado del 2026-10-21.
- [x] Pedidos vacíos anteriores retirados por el reset completo solicitado el 2026-10-21; no se ejecutó la herramienta de limpieza selectiva.
- [ ] Corte físico/LAN y tablet dentro del smoke general; las carreras de solicitudes/401/cola tienen pruebas automatizadas.

Detalle y comandos: `progreso/pedidos-vacios.md`.

## Kardex & Stock: edición y baja de insumos — implementado

- [x] Menú de acciones y formulario compartido; código, empresa y stock protegidos.
- [x] Nombre/categoría/mínimo editables; unidad/costo inicial solo sin uso.
- [x] Baja lógica con stock cero, sin fichas activas y versión revisada.
- [x] Validación en compras/recetas/ajustes/despacho; bloqueos coordinados y versiones.
- [x] Historial conservado y nombre actualizado en fichas activas.
- [x] UUID estable, cola durable, conflictos revisables y REST completo tras realtime.
- [x] 111 comprobaciones agregadas (37 cliente, 28 servidor y 46 escenarios SQL de los tres módulos); tipos y builds.
- [x] Navegador: alta/edición/F5/baja, bloqueos por stock/ficha, offline/F5 y dos terminales con conflicto.
- [ ] Tablet/LAN y corte físico durante replay en el smoke general.

Sin migración nueva ni reset operativo. Detalle: `progreso/insumos-edicion-baja.md`.

## 3. Cocina / Barra — siguiente implementación

- [ ] Pantalla por empresa, estación, mesa y ticket, actualizada por `order:changed`.
- [ ] Consulta específica de preparación: incluir pedidos cobrados con ítems pendientes.
  Conservar el significado actual de `/operations/orders/active` para el POS.
- [ ] Operación autenticada e idempotente para marcar una línea completa `servido`,
  sin alterar stock, total ni estado de pago.
- [ ] Despachar solo líneas `agregado`; conservar las servidas al enviar o reintentar.
- [ ] Separar cantidades nuevas de líneas despachadas para que tengan su propio envío.
- [ ] Cobrar libera la mesa, pero no marca automáticamente los ítems servidos.
  La comanda permanece en cocina hasta completarse, identificada por pedido/ticket.
- [ ] Distribución inicial: bebidas → Barra; demás categorías → Cocina.
- [ ] Pruebas: pedido mixto, segundo despacho, doble clic, cobro anticipado y nueva
  ocupación de la misma mesa con la comanda anterior pendiente.

## 4. Smoke E2E offline y refrendo UI

Ejecutar en base separada y registrar resultados por escenario:

- [ ] Abrir mesa → añadir ítems → cocina → cuenta → cobrar → transacción manual →
  compra y regularización → ajuste Kardex → cambio de turno.
- [ ] Reconectar: cola 0 y efectos correctos en stock, caja, bancos, pedidos y compras.
  No basta comprobar UUID únicos: verificar también cantidades, saldos y efectos de negocio.
- [ ] Mesa liberada offline: no debe aparecer una orden fantasma al sincronizar.
- [ ] Recarga con cola y red recuperada: conservar órdenes/mesas temporales.
- [ ] F5 tras altas de catálogos online y después de replay offline.
- [ ] Corte real de internet conservando LAN: login, recarga, comandas y cobro entre equipos.
- [ ] Corte durante replay, respuesta perdida después de commit y dos terminales concurrentes.
- [ ] Compra a crédito sin transacción de caja y error visible al re-regularizar
  (`409 ALREADY_REGULARIZED`).
- [ ] Voucher: impresión de solo voucher y un único adjunto al compartir por WhatsApp
  en escritorio/móvil, incluyendo cancelar y fallback de descarga.

## 5. Sincronización y operación local

- [ ] Idempotencia transaccional y recuperación del resultado por `clientOpId` para
  todas las mutaciones, incluidos ítems y altas de catálogos.
- [ ] Recuperación de apertura/flush parcial, mapeos temporales y conflictos entre terminales.
- [ ] Cola durable: tratar fallos de almacenamiento; no confirmar guardado si persistir falló.
- [ ] Registrar en la misma transacción local los cambios pendientes de enviar a Azure;
  retirarlos únicamente después de confirmación.
- [ ] Identidad del local en registros replicados para evitar colisiones entre bases.
  Consolidar stock y saldos por local; no fusionar automáticamente datos con empresa nula.
- [ ] Servicios Windows con arranque automático, almacenamiento persistente, HTTPS local
  y recursos de interfaz disponibles sin internet.
- [ ] Respaldos, restauración probada, última sincronización y errores pendientes visibles.

## 6. Azure y piloto

- [ ] Infraestructura y secretos de producción, API de recepción y consulta consolidada.
- [ ] Reconciliación por local: mismos detalles, importes y efectos, sin duplicaciones.
- [ ] Permisos por rol/empresa en todas las rutas; revisión completa previa al piloto.
- [ ] Reemplazar credenciales demo y rotar credenciales antiguas documentadas.
  Sanear el archivo actual no elimina valores de commits históricos.
- [ ] Reiniciar cada servidor y restaurar un respaldo en entorno de prueba.
- [ ] Validación operativa en ambos locales y actualización final de la bitácora.

## Riesgos todavía abiertos

- El ledger `operaciones_cliente` continúa siendo pasivo; no garantiza idempotencia de negocio.
- La apertura ya tiene deduplicación por `clientOpId`, pero el flush de ítems y su
  recuperación tras interrupción requieren pruebas y endurecimiento.
- Los catálogos pueden duplicarse si se pierde la respuesta de un alta y se reintenta.
- Una cola por navegador no sustituye al servidor local compartido para cocina/caja.
- Este bloque no despliega Azure ni instala servicios Windows en los locales.
