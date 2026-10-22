# Insumos: edición y baja desde Kardex & Stock

Implementado el 2026-10-21. Sin migraciones nuevas, seeds ni cambios de negocio en la base operativa. Se aprovecharon UUID, `version` e `isDeleted` existentes.

## Uso

En Existencias Físicas, cada fila ofrece **Acciones → Editar insumo / Eliminar insumo**. El acceso a Ajuste / Merma permanece y precarga el insumo seleccionado.

El alta y la edición comparten formulario. Se permite editar nombre, categoría y stock mínimo (incluido cero). Código, empresa, stock actual y última compra quedan protegidos al editar. Unidad y costo inicial solo se corrigen cuando no hay existencias ni referencias en compras, recetas —incluidas las retiradas— o Kardex. No se convierte inventario entre unidades ni se cambia su valorización desde este formulario.

El formulario conserva su versión inicial aunque llegue un aviso realtime, muestra errores dentro del modal, bloquea campos durante el envío y confirma el cierre si hay cambios no guardados. Un conflicto que ya quedó persistido se revisa desde la lista.

Eliminar realiza una baja lógica, exige stock exactamente cero y ausencia de fichas técnicas activas. El diálogo identifica las fichas o existencias que impiden continuar y ofrece ir a Fichas & Recetas o Ajuste / Merma. La eliminación no descuenta existencias ni borra compras, movimientos o referencias históricas.

No se incluyó restauración de bajas ni conversión de unidades. Una devolución histórica puede registrar stock sobre una referencia conservada dada de baja: los nuevos filtros de catálogo no eliminan el registro ni bloquean el reverso histórico existente. La prueba de este caso usa una baja antigua simulada directamente en la BD aislada; la API nueva impediría eliminar un insumo todavía vinculado a una ficha activa. No se presenta este ajuste como reconstrucción de recetas históricas o corrección general del motor de devoluciones.

## API y consistencia

- POST `/api/catalogs/insumos`: acepta UUID estable opcional, valida categorías/unidades, nombres y números dentro de `Decimal(12,4)`. Repetir el UUID devuelve el mismo insumo y no restablece el stock de compras posteriores. Los códigos se asignan bajo bloqueo y no se reutilizan códigos de insumos retirados.
- PATCH `/api/catalogs/insumos/:id`: acepta solo nombre, categoría, mínimo, unidad/costo permitidos y `expectedVersion` opcional. Rechaza stock, empresa, código y fechas. Las terminales nuevas siempre envían la versión del formulario y solo los campos modificados.
- DELETE `/api/catalogs/insumos/:id?expectedVersion=...`: comprueba versión, stock y fichas dentro de la transacción; devuelve el insumo final con `isDeleted=true`. Repetir una baja aplicada es idempotente.
- GET devuelve código, mínimo, versión y metadatos `canEditBase`/`activeRecipes` completos. Se respeta la empresa asignada del usuario en las operaciones de catálogo; los insumos compartidos conservan el comportamiento existente.
- Conflictos identificables: `INSUMO_VERSION_CONFLICT`, `INSUMO_BASE_LOCKED`, `INSUMO_HAS_STOCK`, `INSUMO_IN_RECIPES`, `INSUMO_DELETED`, `INSUMO_UNIT_MISMATCH` y `INSUMO_COMPANY_MISMATCH`.

Compras, creación/edición de ingredientes, ajustes y despacho coordinan bloqueos por insumo. Se rechazan nuevas referencias a insumos eliminados, empresas incompatibles y unidades inconsistentes. Un rechazo revierte toda la operación, sin compra o producto parcial.

Compras, ajustes, consumo y devolución incrementan la versión del insumo. Renombrar actualiza la identificación en ingredientes de fichas activas y sus versiones, conservando cantidades/costos; compras, Kardex y fichas retiradas conservan sus datos históricos. Eventos después del commit, incluidos compra/ajuste, con reintentos acotados ante deadlocks.

## Offline y dos terminales

Las altas, ediciones y bajas se persisten con escritura verificada antes de modificar la UI. El alta conserva UUID; varias ediciones pendientes se acumulan sin convertir un mínimo cero en cinco. La cola reconstruye el insumo tras F5 aunque la caché de React no llegara a guardarse.

Los eventos de insumo se tratan como avisos y consultan REST completo: no inventan código, stock mínimo o última compra. Las respuestas antiguas no sustituyen versiones más recientes. Los cambios locales pendientes se superponen sin sobrescribir stock/costo nuevos cuando solo se editó otro campo.

Los errores de negocio se conservan para revisión; un 401 mantiene el pendiente. **Revisar** compara los datos locales/actuales y permite descartar el pendiente o reintentar únicamente los campos modificados sobre la versión actual. La baja pendiente se identifica en la fila y se excluye de nuevos selectores de compras/recetas/ajustes.

Compras, fichas o ajustes rechazados por una dependencia de insumo conservan su operación. Kardex muestra el error y permite revisar y, con confirmación explícita y conexión, descartar ese pendiente y recuperar los datos confirmados. Esto no incorpora edición completa de una compra pendiente desde Kardex.

Pendientes de insumos creados por versiones anteriores sin UUID estable se retienen para revisión en lugar de reenviarse automáticamente y arriesgar duplicados. No se inventa una correspondencia con registros del servidor.

## Evidencia

- 37 pruebas cliente y 28 servidor aprobadas.
- 18 escenarios SQL/API/Socket.IO de insumos aprobados sobre BD temporal; incluyen altas/reintentos, código concurrente, mínimo cero, protección de campos, historial, baja y referencias, rollback, versiones, compra/baja, receta/baja, ajuste/baja, empresa, unidades, devolución sobre referencia conservada y dos sockets reales.
- Regresiones SQL: 15 escenarios de pedidos y 13 de Productos/Fichas aprobados. Total: **111 comprobaciones**.
- TypeScript y builds frontend/backend aprobados. Persiste el aviso conocido de bundle JS mayor de 500 kB.
- Navegador, escritorio 1280×720: crear/editar/F5, baja confirmada, bloqueo por stock con acceso a ajuste, bloqueo por ficha mostrando su nombre, campos protegidos, alta offline/F5/replay sin duplicado y mínimo cero.
- Dos orígenes de navegador con identidades distintas: edición abierta en ambas terminales; A cambia el mínimo a 9, B intenta renombrar con versión antigua; conflicto visible, comparación y reintento conservan el mínimo 9 de A.
- Evidencias: `evidencias/insumos-edicion.png`, `insumos-confirmar-baja.png`, `insumos-baja-bloqueada.png`, `insumos-baja-receta.png`, `insumos-offline-f5.png`, `insumos-conflicto.png`.
- Bases temporales eliminadas, incluido el servidor visual detenido mediante `fin`. No se ejecutaron pruebas de negocio ni resets en `TaytaSabroso`.
- Pendientes de validación física: tablet/LAN, F5 sin conexión real al servidor y corte físico durante replay. No se confunden con la simulación offline o las pruebas de solicitudes/401.

Comandos:

```sh
npm test
npm test --prefix server
npm run lint
npm run build
npm run build --prefix server
npm run test:insumos:sql --prefix server
npm run test:orders:sql --prefix server
npm run test:products:sql --prefix server
```

Para repetir revisión visual aislada, ejecutar en terminal interactiva `npm run test:insumos:sql --prefix server -- --browser`; PIN temporal 9876, puerto 4310. `fin` y Enter cierra y elimina la base. No usar seeds para activar esta mejora; basta el nuevo código/build y recargar las terminales.
