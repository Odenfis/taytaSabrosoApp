# Plan pendiente — Tareas restantes post-Fase D/E

> Objetivo: documentar lo que falta por cerrar una vez completados los módulos de tiempo real
> (mesas/órdenes, Kardex & Stock, Compras & Facturas, Recetas/Fichas, Insumos, Métodos de pago,
> Impresoras) y el sync offline (E4/E5).

> El avance histórico y las decisiones van en `progreso/progress.md`.

---

## 1. Pantalla de Cocina / Barra (pendiente)

`sendToKitchen` ya emite el evento `order:changed` al cambiar el estado de la orden a `en_cocina`,
pero **no existe una pantalla dedicada** que muestre las comandas pendientes en cocina/barra.
Falta crear una pantalla que:
- Suscriba a los eventos `order:changed` del socket (o consulte `/operations/orders/active`).
- Liste las órdenes con estado `en_cocina` o `por_cobrar` agrupadas por empresa/mesa.
- Permita al personal de cocina/barra marcar ítems como `servido` (si se define ese flujo).

---

## 2. Smoke E2E offline en navegador (Paso 2 — pendiente)

Probar el ciclo completo offline → reconectar → confirmar en BD que todo se aplicó exactamente una vez
y que la cola quedó vacía.

Con `npm run dev:all` corriendo (`:3000` + `:4000`), PIN `1004`:

- [ ] Desde Configuración → "Simular Corte de Internet".
- [ ] Operar el ciclo completo offline:
      abrir mesa → añadir ítems → enviar a cocina → pedir cuenta → cobrar (pago) → transacción manual de
      Caja → compra + regularización → ajuste de Kardex → cambio de turno.
- [ ] Reconectar (botón "Restablecer Conexión" o reload con red real).
- [ ] Verificar en la UI: contador de cola en 0, notificación "Sincronización completada",
      stock/caja/kardex coherentes (refrescan automáticamente).
- [ ] Verificar en BD (`server/scripts/verify-sync.ts` o `sqlcmd` a BD `tayta_sabroso`): una sola
      orden/transacción/compra/movimiento de kardex por op encolada, sin duplicados y sin doble deducción.
- [ ] Caso "mesa liberada offline": abrir mesa offline, vaciarla (se libera), reconectar → no se
      crea orden fantasma en BD.
- [ ] **Fix E4-b (recarga con cola pendiente)**: abrir mesa + ítems offline, y **sin** pulsar
      "Restablecer Conexión" recargar (F5) con red activa → el auto-replay debe crear/cobrar esa orden.
- [ ] **Persistencia E5 (nuevo)**: crear mesa/cuenta/método/impresora/receta/insumo online → **F5** →
      persisten (verificación clave de E5). Repetir uno en offline → reconectar → persiste tras replay.

---

## 3. UI refrendo: compra a crédito y error visible al re-regularizar (pendiente)

Ambos ya están verificados a nivel API (2026-10-12), falta el refrendo en la pantalla:

- [ ] **Compra a crédito**: crear una compra con modalidad "Crédito 15 días" desde la UI y
      verificar que se cree sin transacción de caja (tx el-tayta 7→7).
- [ ] **Error visible al re-regularizar**: intentar regularizar una compra ya regularizada desde la
      UI y verificar que se muestre el error `409 ALREADY_REGULARIZED` ("La compra ya fue regularizada.")
      y que el dispatcher lo traduzca a `already` (quita de la cola sin duplicar folios).

---

## 4. Maestro de Productos / Menú (pendiente, Fase E)

Las fichas técnicas ahora crean/actualizan su plato automáticamente (ver progress.md), pero **no existe una pantalla dedicada para administrar productos** del menú (alta de bebidas/entradas/postres sin ficha, editar precio/nombre/categoría, foto, disponible/no disponible, activar/desactivar `hasRecipe`). Falta crear:

- Pantalla Maestro de Productos con CRUD sobre `/catalogs/products` (GET ya existe; POST/PATCH/DELETE en el server ya están implementados).
- Evento `product:changed` ya implementado en tiempo real (servidor + cliente + POSContext handler); la pantalla solo debe consumirlo para replicar entre terminales.
- Opcional: indicador visual de `hasRecipe` en OrderTakingScreen para distinguir platos con ficha técnica.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Red cae exactamente entre `openOrder` y el flush de ítems del replay | Riesgo aceptado en v1 (ver progress.md E4): el `try/catch` marca `stuck` y no borra la cola; posible orden creada sin ítems. |
| F5 / reload durante un replay en curso | Mutex `isReplayingRef` + idempotencia por `clientOpId`; recalcular contador real de `queueCount()`. |
| Catálogos sin `clientOpId` en el server | Riesgo aceptado en v1 (ver progress.md E5): un fallo de red tras el POST podría duplicar al reintentar. |

---

## Estado

- [ ] Pantalla de Cocina / Barra (pendiente)
- [ ] Smoke E2E offline en navegador (Paso 2) + persistencia F5 (E5)
- [ ] UI refrendo: compra a crédito y error visible al re-regularizar
- [ ] Maestro de Productos / Menú (Fase E)
- [ ] Documentar resultados en `progreso/progress.md` y limpiar este archivo.
