# Plan actual — Smoke E2E offline en navegador (E4) + persistencia F5 de catálogos (E5)

> Objetivo: validar de punta a punta en el navegador lo ya implementado y verificado a
> nivel API (2026-10-12): resiliencia offline E4/E4-b y persistencia de catálogos E5.
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
- [x] Seed canónico y sesión (PIN `1004`, device `TERM-CENTRAL-01`) — verificado por API 2026-10-12.
- [x] Servidor (`:4000`) + SQL Server local responden (`/health` OK, `verify-sync.ts` OK).

### Paso 1 — Re-verificación de procesos previos + fixes de estabilidad (✔ hecho 2026-10-12)
- [x] Gaps #2/#3/#4/#6 corregidos en `POSContext.tsx` (ver `progress.md`); gap #5 analizado
      (delta `quantity:1` correcto, sin cambio); `tsc` 0 + `build` OK.
- [x] **E5 completo**: 11 CRUD de catálogos → `POST/PATCH/DELETE /catalogs/*` con reconcile,
      rollback y replay (`entity:'catalog'`); temps preservados en `loadCatalogs`.
      Smoke API PASS (crear→leer→actualizar→borrar ×6 entidades).

### Paso 2 — Smoke E2E del ciclo offline en navegador (PENDIENTE — ejecutar con la app abierta)

> Con `npm run dev:all` corriendo (`:3000` + `:4000`), PIN `1004`.

- [ ] Desde Configuración → "Simular Corte de Internet".
- [ ] Operar el ciclo completo offline:
      abrir mesa → añadir ítems → enviar a cocina → pedir cuenta → cobrar (pago) → transacción manual de
      Caja → compra + regularización → ajuste de Kardex → cambio de turno.
- [ ] Reconectar (botón "Restablecer Conexión" o reload con red real).
- [ ] Verificar en la UI: contador de cola en 0, notificación "Sincronización completada", stock/caja/kardex
      coherentes (refrescan automáticamente).
- [ ] Verificar en BD (`server/scripts/verify-sync.ts` o `sqlcmd` a BD `tayta_sabroso`): una sola
      orden/transacción/compra/movimiento de kardex por op encolada, sin duplicados y sin doble deducción.
- [ ] Caso "mesa liberada offline": abrir mesa offline, vaciarla (se libera), reconectar → no se
      crea orden fantasma en BD.
- [ ] **Fix E4-b (recarga con cola pendiente)**: abrir mesa + ítems offline, y **sin** pulsar
      "Restablecer Conexión" recargar (F5) con red activa → el auto-replay debe crear/cobrar esa orden.
- [ ] **Persistencia E5 (nuevo)**: crear mesa/cuenta/método/impresora/receta/insumo online → **F5** →
      persisten (verificación clave de E5). Repetir uno en offline → reconectar → persiste tras replay.

### Paso 3 — Test "compra a crédito" (✔ verificado a nivel API 2026-10-12)
- [x] Compra `Crédito 15 días` → creada sin transacción (tx el-tayta 7→7). Falta refrendo en UI.

### Paso 4 — Test "error visible" (✔ verificado a nivel API 2026-10-12)
- [x] Re-regularizar → **409 `ALREADY_REGULARIZED`** ("La compra ya fue regularizada.").
      El dispatcher lo traduce a `already` (quita de la cola sin duplicar folios). Falta refrendo en UI.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Red cae exactamente entre `openOrder` y el flush de ítems del replay | Riesgo aceptado en v1 (ver progress.md E4): el `try/catch` marca `stuck` y no borra la cola; posible orden creada sin ítems. No se cerró con idempotencia total en `openOrder` en esta iteración |
| F5 / reload durante un replay en curso | Mutex `isReplayingRef` + idempotencia por `clientOpId`; recalcular contador real de `queueCount()` |
| Catálogos sin `clientOpId` en el server | Riesgo aceptado en v1 (ver progress.md E5): un fallo de red tras el POST podría duplicar al reintentar |
| Los refrendos en UI son opcionales | La lógica ya está verificada a nivel API; el smoke navegador los cubre de paso |

---

## Estado

- [x] Paso 0 — Preparación
- [x] Paso 1 — Re-verificación de procesos previos + fixes de estabilidad + E5
- [ ] Paso 2 — Smoke E2E del ciclo offline en navegador (E4) + persistencia F5 (E5)
- [x] Paso 3 — Test "compra a crédito" (API ✔, refrendo UI pendiente)
- [x] Paso 4 — Test "error visible" (API ✔, refrendo UI pendiente)
- [ ] Documentar resultado del smoke navegador en `progreso/progress.md` y limpiar este archivo.