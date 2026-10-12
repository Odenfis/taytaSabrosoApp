# Plan actual — Re-verificación E1–E3 + fixes de estabilidad, luego smoke offline (E4) y tests opcionales de Compras

> Objetivo (orden de ejecución): (1) re-probar los procesos ya implementados (E1–E3) en la UI y corregir
> los gaps de código hallados, sobre una base estable ANTES del smoke; (2) validar de punta a punta la
> resiliencia offline recién implementada (E4); (3) cerrar los 2 casos de control de Compras opcionales.
> El avance histórico y las decisiones van en `progreso/progress.md`.

---

## Contexto

- **E4 (replay de la cola offline) quedó implementado** (2026-09-18): `ts_pending_queue_v2` se drena con
  idempotencia por `clientOpId` (replay automático al reconectar, al arrancar con sesión, o con el botón
  "Forzar Sincronización"); `sendToKitchen` y `regularizePurchase` quedaron idempotentes del lado server.
- **Decisión (2026-09-18)**: ANTES del smoke offline se re-prueban los procesos E1–E3 para mejorar la app
  sobre una base verificada y se cierran los gaps detectados en el relevamiento del frontend. El smoke del
  ciclo offline se ejecutará con la base ya estable.
- Falta la **prueba de extremo a extremo** del ciclo: operar offline → reconectar → confirmar en BD que todo
  se aplicó exactamente una vez y que la cola quedó vacía.
- Simplificación adoptada en E4: los **ítems** de órdenes temporales NO se encolan; se refluyen desde el
  estado local durante el replay (evita doble deducción de Kardex y duplicados).

---

## Plan de ejecución

### Paso 0 — Preparación
- [ ] Asegurar seed canónico y sesión iniciada (PIN `1004`, device `TERM-CENTRAL-01`).
- [ ] Levantar servidor (`:4000`), front (`:3000`) y confirmar que SQL Server local responde.

### Paso 1 — Re-verificación de procesos previos + fixes de estabilidad (nuevo, previo al smoke)

> Re-prueba guiada de los procesos E1–E3 ya implementados; cada ítem se verifica en la UI y en BD
> (`sqlcmd` a BD `tayta_sabroso` / `server/scripts/verify-sync.ts`). Todo bug o mejora detectada se
> anota y se corrige aquí mismo antes de pasar al Paso 2.

#### Checklist de re-prueba guiada (UI + BD)
- [ ] **Login/seguridad**: PIN erróneo → 401 con mensaje; login OK; F5 restaura sesión vía `/me`;
      logout revoca; switcher de empresa activa.
- [ ] **Ciclo de venta completo**: abrir mesa → ítems (merge mismo producto+nota) → cocina
      (kardex baja) → por cobrar → cobrar (vuelto, boleta, tx, saldo banco, mesa libre).
      Vaciar comanda libera mesa; borrar ítem en cocina revierte kardex.
- [ ] **Caja (transacciones manuales)**: ingreso/egreso actualiza saldo banco + tx; dedup por
      `clientOpId`.
- [ ] **Compras + regularización**: compra formal (kardex ENTRADA + costo promedio + tx); compra a
      crédito (sin tx); vale → regularizar propaga folio a kardex/caja; re-regularizar → 409 visible.
- [ ] **Kardex / inventario**: ajuste merma/entrada; recargar sin perder datos.
- [ ] **Arqueo de turnos**: switch → record + turno nuevo + ajuste de saldo si difiere.
- [ ] **Catálogos/settings**: crear mesa/cuenta/método/impresora/receta/insumo → **F5** → ¿persisten?
      (hoy NO deberían: es el gap #1 confirmado).

#### Gaps a corregir (orden de prioridad, del relevamiento del frontend)
1. **CRUD catálogos 100% local** (se pierde al recargar online) → conectar
   `addNewTable | addBankAccount/update/delete | addPaymentMethod/update/delete |
   addPrinter/update/delete | saveRecipe | addInsumo` a `POST/PATCH/DELETE /catalogs/*`
   (endpoints ya existen en `server/src/routes/catalogs.routes.ts`); los ids client-side se
   reemplazan por los del server; fallback a estado local + cola si falla la red.
2. **`sendToKitchen` sin rollback**: restaurar items a `agregado` + revertir kardex/stock local
   si el server rechaza con 4xx (`POSContext.tsx:1845-1916`, `1171-1236`).
3. **`completePayment` rollback parcial**: remover tx optimista, mesa a `por_cobrar`, revertir
   bump de saldo (`POSContext.tsx:1980-2147`).
4. **`addItemToOrder` fabrica id `order-<table>-...`** → 404 garantizado; usar rama temporal
   `order-tmp-*` con flush o resync (`POSContext.tsx:1496-1520,1566-1589`).
5. **Payload `addItem` quantity:1 hardcodeado**: enviar la cantidad acumulada real del merge
   (`POSContext.tsx:1522-1542,1566-1585`).
6. **Arqueo heurístico** (caja inicial fija 350 + match por descripción): mejoras post-reconciliación
   con la verdad del server (`POSContext.tsx:2517-2553`).

#### Verificación de cierre de la ronda
- `npx tsc --noEmit` (raíz y `server/`) = 0 errores · `npm run build` OK.
- F5 con catálogos creados → **persisten** (verificación clave del gap #1).
- Re-correr lo tocado (catálogos, cocina, cobro).
- Documentar resultado en `progreso/progress.md`.

### Paso 2 — Smoke E2E del ciclo offline (nuevo, E4)
- [ ] Desde Configuración → "Simular Corte de Internet".
- [ ] Operar el ciclo completo offline:
      abrir mesa → añadir ítems → enviar a cocina → pedir cuenta → cobrar (pago) → transacción manual de
      Caja → compra + regularización → ajuste de Kardex → cambio de turno.
- [ ] Reconectar (botón "Restablecer Conexión" o reload con red real).
- [ ] Verificar en la UI: contador de cola en 0, notificación "Sincronización completada", stock/caja/kardex
      coherentes (refrescan automáticamente).
- [ ] Verificar en BD con `sqlcmd` (BD `tayta_sabroso`): una sola orden/transacción/compra/movimiento de
      kardex por op encolada, sin duplicados y sin doble deducción de stock.
- [ ] Verificar el caso "mesa liberada offline": abrir mesa offline, vaciarla (se libera), reconectar → no se
      crea orden fantasma en BD.
- [ ] **Verificar el fix E4-b (recarga con cola pendiente)**: abrir mesa + ítems offline, y **sin** pulsar
      "Restablecer Conexión" recargar la página (F5) con la red real activa → el auto-replay al arrancar debe
      crear/cobrar esa orden (antes se perdía porque `loadOperations`/`loadCatalogs` borraban la orden/mesa tmp).

### Paso 3 — Test "compra a crédito" (opcional)
- [ ] Compras → Registrar Compra → modo de pago **Crédito 15 días** → Guardar.
- [ ] Verificar: la compra aparece en la lista, pero **NO** se crea transacción "Pago Proveedor" en Caja
      ni cambia el saldo de ninguna cuenta bancaria.

### Paso 4 — Test "error visible" (opcional)
- [ ] Tomar una compra ya `regularizado` (o regularizar primero) e intentar **regularizar de nuevo**.
- [ ] Verificar: notificación de error visible ("La compra ya fue regularizada." / 409), sin pantalla en blanco.
- [ ] (Con E4) El mismo 409 al reintentar **online** TAMBIÉN cubre el caso "already" del replay: debe
      quitarse de la cola sin duplicar folios.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Red cae exactamente entre `openOrder` y el flush de ítems del replay | Riesgo aceptado en v1 (ver progress.md E4): el `try/catch` marca `stuck` y no borra la cola; posible orden creada sin ítems. No se cerró con idempotencia total en `openOrder` en esta iteración |
| F5 / reload durante un replay en curso | Mutex `isReplayingRef` + idempotencia por `clientOpId`; recalcular contador real de `queueCount()` |
| Los 2 tests de Compras son opcionales | No bloquean la entrega; pueden marcarse como hechos o diferirse |

---

## Estado

- [ ] Paso 0 — Preparación
- [ ] Paso 1 — Re-verificación de procesos previos + fixes de estabilidad
- [ ] Paso 2 — Smoke E2E del ciclo offline (E4)
- [ ] Paso 3 — Test "compra a crédito" (opcional)
- [ ] Paso 4 — Test "error visible" (opcional)
- [ ] Documentar resultado en `progreso/progress.md` y limpiar este archivo.