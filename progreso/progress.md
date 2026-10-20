# Progreso — Tayta & Sabroso POS (Producción)

> Bitácora de avance del proyecto. `2026-10-20` (trabajo del 15–19 oct consolidation:
> Fase D realtime completa, ledger `operaciones_cliente`, regla Caja vs Bancos, voucher
> gráfico por WhatsApp, estándar 2 decimales en fichas — **todo commiteado y pusheado**;
> base de datos restaurada a vacío y verificada).
> **Punto de retome: `progreso/planpendiente.md` → (1) pantalla de Cocina/Barra,
> (2) smoke E2E offline en navegador (Paso 2), (3) Maestro de Productos/Menú,
> (4) auth: validar sesión en `requireAuth` (bloqueador de producción),
> luego Fase C y Fase F (Azure).**
> Objetivo: transformar el demo React (SPA) en un sistema de producción:
> **SQL Server (Azure) + Express + offline-first + multi-empresa en una sola BD.**

---

## 1. Roadmap general

| Fase | Estado | Descripción |
|------|--------|-------------|
| **A** | ✅ Completada | Schema SQL Server (23 tablas), migración inicial, seed demo data |
| **B** | ✅ Completada | API Express + JWT + servicios de negocio (órdenes, compras, kardex, turnos, analítica) |
| **C** | 🔲 Pendiente | **Motor de sync offline** (endpoint `client_ops`, idempotencia, queue por terminal) |
| **D** | 🚧 En curso (mesas/órdenes en vivo ✅) | **Socket.io** en tiempo real (mesas/órdenes por empresa; cocina/barra en vivo pendiente) |
| **E** | 🚧 En curso | Frontend React → API. **E1 ✅ · E2 ✅ · E3 ✅ · E4 ✅ (+E4-b)** · **E5 ✅ (código + smoke API; refrendo navegador pendiente)** · 1.ª ronda UI del usuario OK (2 ventas cobradas) + fix cocina verificado · **apertura perezosa ✅** |
| **F** | 🔲 Pendiente | Azure: SQL Server en la nube + deploy del backend (secretos reales) |

> Repo con git desde 2026-10-12 (`main` + `origin/main`, mensajes `update ...` en minúscula).
> Antes de cada sesión: `git status --short` debe estar limpio.

---

## 2. Decisiones de arquitectura (NO cambiar sin revisar)

- **Multi-empresa por fila**: todas las tablas de negocio tienen `companyId`.
  `companyId = NULL` = recurso compartido entre empresas (`'ambas'` / holding).
- **Offline-first obligatorio**: el restaurante tiene problemas de internet; 5+ terminales
  por local. Las operaciones se crean con UUID client-side y `clientOpId` como clave de
  idempotencia para reintentos seguros del sync.
- **Prisma 6.19.3 sobre SQL Server**: `provider = "sqlserver"` en `schema.prisma`.
  ⚠️ Ver "Gotchas" más abajo: el motor de migraciones lo canonicaliza internamente a `mssql`.
- **SQL Server NO tiene enum en Prisma**: todo se guarda como `NVARCHAR` y se valida
  en el servicio con Zod.
- **Cascades**: `onUpdate: NoAction, onDelete: NoAction` en TODAS las relaciones, salvo
  composiciones puras (OrderItem→Order, PurchaseItem→Purchase, RecipeIngredient→Recipe,
  PrinterCategory→Printer, Session→User, CompanyShift→Company, NumberingSequence→Company).
- **Decimal**: Prisma devuelve `Prisma.Decimal`, no `number`. Para aritmética usar
  `toNum()` (`src/lib/utils.ts`). `plain()` convierte recursivamente Decimal→number y
  Date→ISO al devolver JSON.
- **Demo data preservada**: IDs (`t-02`, `prod-lomo`, `ins-*`, `pur-*`), strings display
  (`date`/`time`/`createdAt`), más columnas `*Utc` para consultas/filtros reales por fecha.
- **Insumos sin catálogo**: `pur-04`/`pur-05` referencian insumos inexistentes
  (`ins-gas`, `ins-bebidas`) → `insumoId` es FK nullable.
- **Sin `$extends`**: se probó extender Prisma para auto-convertir Decimals y se REVIRTIÓ
  (complejidad). Se usa `toNum()` explícito y `plain()` al devolver.
- **Umbrales analítica**: `foodCostPctReal > 38` **o** `operatingExpenseRatio > 45` →
  `'critico'`; `>= 32.5` **o** `>= 38` → `'alerta'`; si no, `'optimo'`.
- **JWT 12h** con sesión en BD (`sessions.tokenHash`); logout borra la sesión.
  PIN de usuario (`pinHash`) verificado con `bcrypt.compare`.
- **Endpoints con Zod** para validar entrada. `errorHandler` mapea `ZodError` → 400,
  `AppError` → código HTTP propio, Prisma `P2002` → 409, `P2025` → 404.

---

## 3. Fase A — Base de datos (✅ completada)

- Schema: `server/prisma/schema.prisma` — **23 modelos**:
  Company, Device, NumberingSequence, User, Session, Table, Product, Order, OrderItem,
  Transaction, BankAccount, CustomPaymentMethod, ShiftRecord, CompanyShift, Insumo,
  Recipe, RecipeIngredient, Purchase, PurchaseItem, KardexMovement, Printer,
  PrinterCategory, ClientOp.
- Migración inicial: `server/prisma/migrations/0001_init/migration.sql` (553 líneas).
- Seed: `server/prisma/seed.ts` — pobla todo el demo:
  2 empresas, 16 productos, 13 insumos, 7 recetas, 13 mesas, 4 cuentas, 9 métodos de
  pago, 4 impresoras, 1 usuario, 1 dispositivo, 2 turnos, 3 órdenes, 5 compras,
  5 kardex, 8 transacciones, 1 shift record.

### Data sembrada (estado canónico)

| Tabla | Filas | |
|-------|------|---|
| companies | 2 | `el-tayta`, `el-sabroso` |
| products | 16 | ej. `prod-lomo`, `prod-ceviche`, `prod-chicha` |
| insumos | 13 | `ins-lomo` (stock 18.5), `ins-pollo-entero` (42), ... |
| recipes | 7 | `rec-aji`, ... |
| tables | 13 | `t-b1` (libre), `t-02` (en_cocina), `t-03` (por_cobrar), ... |
| orders | 3 | `order-mesa-02` (en_cocina), `order-mesa-03` (por_cobrar, 142.50), `order-mesa-s1` |
| purchases | 5 | `pur-01`..`pur-05` |
| bank_accounts | 4 | BCP/BBVA de ambas empresas |
| users | 1 | Carlos M. — PIN `1004` |
| devices | 1 | `TERM-CENTRAL-01` |

### Credenciales de prueba
- PIN: **1004** · deviceCode: **`TERM-CENTRAL-01`** · terminalName: "Terminal Central 01"

---

## 4. Fase B — Backend Express (✅ completada)

`server/` — TypeScript, Express 5, Prisma, Zod, JWT. `npm run dev` con `tsx watch`.

### Estructura
```
server/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/0001_init/migration.sql
│   └── seed.ts
├── src/
│   ├── index.ts            # bootstrap + listen
│   ├── app.ts              # factory express (cors, json, /health, /api, errores)
│   ├── types/express.d.ts  # augmenta Request.auth
│   ├── lib/
│   │   ├── prisma.ts       # PrismaClient singleton (PLANO, sin $extends)
│   │   ├── utils.ts        # AppError, errorHandler, round1/2/3, toNum, plain
│   │   └── auth.ts         # signAccessToken, hashToken, verify, requireAuth, requireRoles
│   ├── services/
│   │   ├── auth.service.ts     # login (device upsert + sesión + JWT), logout, getMe
│   │   ├── master.service.ts   # CRUD empresas/mesas/productos/insumos/recetas/cuentas/métodos/impresoras
│   │   ├── order.service.ts    # abrir orden, quick bar, items, cocina, pago, activas
│   │   ├── purchase.service.ts # compra (kardex ENTRADA + costo promedio ponderado)
│   │   ├── kardex.service.ts   # ajustes de inventario
│   │   ├── shift.service.ts    # cambio de turno (arqueo completo)
│   │   └── analytics.service.ts# ratios y resumen de reportes
│   └── routes/
│       ├── index.ts            # monta /auth, /catalogs, /operations, y reports sueltos
│       ├── auth.routes.ts
│       ├── catalogs.routes.ts
│       ├── operations.routes.ts
│       └── reports.routes.ts
```

### Endpoints

**Auth** (sin token)
- `POST /api/auth/login` `{pin, deviceCode?, terminalName?}` → token + user + companies + companyShifts
- `GET  /api/auth/me` (Bearer)
- `POST /api/auth/logout` (Bearer)

**Catálogos** (`/api/catalogs`, Bearer) — GETs listan por `?companyId=`
- `GET|POST /companies`
- `GET|POST /tables`, `PATCH|DELETE /tables/:id`
- `GET|POST /products`, `PATCH|DELETE /products/:id`
- `GET|POST /insumos`, `PATCH|DELETE /insumos/:id`  (`companyId` nullable = 'ambas')
- `GET|POST /recipes`, `PATCH|DELETE /recipes/:id` (anida `ingredients`)
- `GET|POST /bank-accounts`, `PATCH|DELETE /bank-accounts/:id`
- `GET|POST /payment-methods`, `PATCH|DELETE /payment-methods/:id`
- `GET|POST /printers`, `PATCH|DELETE /printers/:id` (anida `categories` de PrinterCategory)

**Operaciones** (`/api/operations`, Bearer)
- `GET /orders/active?companyId=`
- `POST /orders/open` `{tableId, waiter?}`
- `POST /orders/quick-bar` `{companyId, waiter?}`
- `GET /orders/:id`
- `POST /orders/:id/items` `{productId, quantity?, notes?}`
- `PATCH /orders/:id/items/:itemId/quantity` `{delta}` (merge lógico)
- `PATCH /orders/:id/items/:itemId/notes` `{notes}`
- `DELETE /orders/:id/items/:itemId`
- `POST /orders/:id/send-to-kitchen` (descuenta kardex)
- `POST /tables/:id/pay` `{paymentMethod, amountReceived, customPaymentMethodId?, referenceNumber?}`
- `GET /purchases?companyId=`
- `POST /purchases` (items[] → kardex ENTRADA + costo promedio ponderado + libro de caja)
- `POST /purchases/:id/regularize` `{invoiceNumber, supplierRuc, notes?}`
- `GET /kardex?companyId=&insumoId=`
- `POST /kardex/adjustments` `{insumoId, quantity, type: AJUSTE_MERMA|ENTRADA_COMPRA, reason, companyId?}`
- `GET /shifts/records?companyId=`
- `POST /shifts/switch` `{companyId, targetShift, reportedCash, initialCashForNext, notes?}`
- `GET /transactions?companyId=`

**Reportes** (`/api/reports`, Bearer)
- `GET /reports/ratios?companyId=all` → totalSales, foodCostPctReal, foodCostPctTheoretical, operatingExpenseRatio, nivel por empresa
- `GET /reports/summary?companyId=all` → totalIngresos, totalEgresos, saldoActual, por método de pago

### Flujos de negocio verificados (smoke test)
1. **Login** end-to-end con PIN → device upsert → sesión → JWT. ✅
2. **Catálogos** listan con filtro por empresa. ✅
3. **Orden**: abrir mesa → agregar ítem → enviar a cocina (descuenta kardex) → estado `en_cocina`. ✅
4. **Kardex**: ajuste de merma actualizó stock 18.5 → 16.5. ✅
5. **Compra**: crea compra + movimientos kardex ENTRADA + costo promedio ponderado actualizado. ✅
6. **Pago**: mesa `t-03` total 142.50, recibido 150 → vuelto 7.50; orden `cobrado`,
   transacción `Venta (Mesa)` creada, mesa liberada. ✅

---

## 5. Bugs arreglados en la sesión (2026-09-05)

1. **Error TS Decimal vs number** en `order.service.ts:221` y `purchase.service.ts:115-116` →
   envueltos con `toNum()`. `tsc --noEmit` = 0 errores.
2. **SQL Server no escuchaba en 1433**: TCP/IP estaba deshabilitado en
   `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQLServer\SuperSocketNetLib\Tcp`
   → `Enabled=1` + `Restart-Service MSSQLSERVER`. (Se hizo vía `powershell -Verb RunAs` con
   script en `%LOCALAPPDATA%\Temp\opencode\elev-*.ps1`.)
3. **Login `sa` inválido**: se actualizó `ALTER LOGIN sa WITH PASSWORD = 'CambiaEstaPassword!'; ALTER LOGIN sa ENABLE;`.
4. **P3019 provider mismatch**: el engine de migraciones canonicaliza `sqlserver`→`mssql`
   internamente. Solución: `provider = "mssql"` en `prisma/migrations/migration_lock.toml`
   manteniendo `sqlserver` en `schema.prisma`. **No hacerlo al revés** (el schema valida
   solo `sqlserver`).
5. **P3018 "Incorrect syntax near BOM"**: `migration.sql` tenía BOM UTF-8 al inicio
   (`EF BB BF`). Reescrito sin BOM.
6. **P3009 migración fallida**: se resolvió con `npx prisma migrate resolve --rolled-back 0001_init`.
7. **JWT "Bad options.subject"**: `signAccessToken` ponía `sub` en el payload Y pasaba
   `subject:` en options. Se eliminó la opción `subject`.
8. **Hashes expuestos en `/login` y `/me`**: se agregó `publicUser()` en `auth.service.ts`
   que elimina `pinHash` y `passwordHash` de la respuesta.
9. **404 en `/api/catalogs` y `/api/operations`**: en `routes/index.ts` se montaban sin
   prefijo. Se montan con `router.use('/catalogs', ...)` y `router.use('/operations', ...)`.
10. **ZodError devolvía 500 INTERNAL_ERROR**: `errorHandler` no lo contemplaba.
    Ahora → 400 `VALIDATION_ERROR` con array de `issues [{field, message}]`.
11. **`GET /` en el puerto 4000 daba 404**: la API solo tenía `/health` y `/api/*`.
    Se agregó índice JSON en `GET /` y `GET /api` (`server/src/app.ts`) que lista los
    endpoints disponibles. `notFound` sigue cubriendo el resto.
12. **Levantar frontend + API juntos**: scripts en el `package.json` raíz
    `dev:server` y `dev:all` (con `concurrently`). Con `npm run dev:all` desde la raíz
    corren Vite (`:3000`) y Express (`:4000`) a la vez. Requiere `npm install` previo.
13. **Mejora del puerto 4000 (landing HTML)**: `GET /` ahora negocia por `Accept`:
    navegador (`text/html`) → página HTML en `server/public/index.html` con estado del
    servicio, login tester (PIN/device → token) y catálogo de endpoints; clientes API
    (curl/fetch) → JSON `apiIndex` como antes. `GET /api` siempre JSON y `GET /health`
    intacto. Ruta resuelta con `fileURLToPath(import.meta.url)` (ESM de tsx).

---

## 5b. Españolización de la capa física de la BD (✔ realizado 2026-09-05)

> Objetivo del plan (`progreso/planactual.md`): que el equipo que revisa en **SSMS** vea
> tablas, columnas y constraints **en español**, SIN tocar código TS, JSON de API ni frontend.
> Resultado: **comportamiento idéntico**, contrato de API intacto (inglés).

### Estrategia
- **Solo capa física.** No existe SQL crudo en `server/src` (solo `$transaction` vía el
  cliente Prisma) → el renombrado es 100% seguro con `@@map`/`@map`.
- **Identificadores TS NO cambian**: `model Order`, `prisma.order` siguen en inglés.
  Solo se añadieron `@@map("pedidos")`/`@map("empresa_id")` etc. en `schema.prisma`.
- **Migración `0002_rename_spanish`** con `sp_rename`, generada mecánicamente (script temp
  `gen-rename.mjs` que parsea `0001_init` + el schema nuevo). Aplicada con `migrate deploy`.

### Cantidades renombradas
| Objeto | Antes | Después |
|---|---|---|
| Tablas | 22 en inglés (1 ya en español) | 23 tablas en español (`empresas` … `usuarios`) |
| Columnas | ~255 en inglés | 255 en español, snake_case sin tildes |
| PK | 23 en inglés | `pk_<tabla>` |
| UNIQUE | 10 en inglés | `uq_<tabla>_<columna>` |
| Índices | 36 en inglés | `ix_<tabla>_<columna>` |
| DEFAULT | 71 en inglés | `df_<tabla>_<columna>` |
| FKs | 35 en inglés | `fk_<tabla_origen>_<tabla_destino>` |

> La tabla `_prisma_migrations` (interna de Prisma) NO se toca. Sus objetos
> (`DF___prisma_m__*`, `PK___prisma___*`) matchean los prefijos `df_`/`pk_` al contar por
> **collation case-insensitive** de SQL Server — no confundir con objetos de la app (los
> nuestros son exactamente 23 pk, 10 uq, 36 ix, 71 df, 35 fk = 175 objetos; verificado).

### Gotcha clave de `sp_rename` (SQL Server)
- Renombrar **índices** con `@objtype='INDEX'` **exige nombre calificado**:
  `sp_rename N'dbo.<tabla>. <índice>', N'nuevo', N'INDEX'`. Con el nombre desnudo falla
  `Msg 15248` (level 11). Tablas → `'<vieja>'`, columnas → `'<tabla>.<columna>'`
  (`@objtype='COLUMN'`), defaults/FKs → `@objtype='OBJECT'`.
- Orden correcto: **tablas primero** (las FKs referenciadas se actualizan solas), luego
  columnas, luego índices/PK/unique y al final defaults/FKs.
- El archivo de migración se generó **sin BOM** (regla ya registrada en §Gotchas).

### Verificación (todo ✔)
- `npx tsc --noEmit` = **0 errores** (antes y después de `prisma generate`).
- `npx prisma validate` OK; `migrate deploy` aplicó `0002` sin errores.
- **Smoke test API completo** (server `:4000`): `/health` OK → login (PIN `1004` /
  `TERM-CENTRAL-01`) → catálogos → abrir mesa `t-b1` → ítem (Lomo Saltado x1, total 53.10)
  → cocina (descuenta kardex) → pago mesa (60.00 → vuelto 6.90) → orden `cobrado`, mesa
  liberada, transacción creada. **JSON de la API sigue en inglés** (`companyId`, `createdAt`).
- **Conteos SQL intactos** vs línea base (2 empresas, 16 productos, 13 insumos, 3 pedidos,
  7 items, 8 transacciones, etc.); **cero** nombres legacy en inglés
  (`legacy_idx=0`, `legacy_fk=0`, `legacy_df=0`).
- **Seed re-ejecutable**: `npx tsx prisma/seed.ts` vuelve a poblar todo contra el schema
  renombrado → confirma que el ORM mapea correctamente los 23 modelos. Forma de reset.

### Respaldo
- Backup pre-cambio: `C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\Backup\tayta_sabroso_2026-09-05.bak`
  (verificado con `RESTORE VERIFYONLY`; el servicio SQL escribió en su propio `Backup\`
  porque no tiene permisos en carpetas de usuario).

### Nota para el futuro
- Constraints/índices que Prisma cree **nuevos** en migraciones futuras volverán a salir en
  inglés (regla del motor). Solo afecta objetos nuevos; se pueden renombrar a mano si se
  quiere mantener la convención `pk_/uq_/ix_/df_/fk_`.

---

## 6. Entorno local — cómo reanudar

### Requisitos de la máquina (una vez)
1. SQL Server corriendo y **TCP/IP habilitado en 1433** (ver bug #2). Puerto comprobable:
   `Test-NetConnection localhost -Port 1433`.
2. `.env` en `server/`:
   ```
   DATABASE_URL="sqlserver://localhost:1433;database=tayta_sabroso;user=sa;password=Sedim2026;encrypt=true;TrustServerCertificate=true"
   JWT_SECRET="dev-only-secret-cambiar-en-produccion"
   APP_URL="http://localhost:5173"
   PORT=4000
   ```
   (> El password real de `sa` es **`Sedim2026`** (aportado por el usuario). La
   contraseña temporal `CambiaEstaPassword!` del bug #3 fue reemplazada.)
   (`.env.example` tiene plantillas de Azure SQL para la fase F.)

### Arrancar el backend
```powershell
cd server
npm run dev          # tsx watch, http://localhost:4000
npx prisma migrate deploy   # si se agregó una migración nueva
npx tsx prisma/seed.ts      # si se ensucia la data demo
npx tsc --noEmit            # chequear tipos ANTES de probar
```

### Arrancar TODO desde la raíz (frontend + API)
```powershell
npm run dev:all
```
- `WEB` → Vite demo en `http://localhost:3000` (datos mock, aún NO conectado a la API; Fase E)
- `API` → Express en `http://localhost:4000`
- Requiere `npm install` previo (primera vez) y SQL Server corriendo en 1433.
- `Ctrl+C` detiene ambos. Scripts definidos en el `package.json` raíz:
  `dev:server` (lanza `npm run dev --prefix server`) y `dev:all` (usando `concurrently -k`).

### Índice de la API
- `GET /` en el puerto 4000 muestra una **landing HTML** (`server/public/index.html`)
  al navegador (estado, login tester, endpoints) o el JSON `apiIndex` a clientes API.
- `GET /api` devuelve JSON siempre; `GET /health` intacto (lo usa el smoke test).

Comprobación rápida: `http://localhost:4000/health` → `{"ok":true,...}`.

### Comandos útiles
```powershell
sqlcmd -S localhost -U sa -P "Sedim2026" -C -d tayta_sabroso -Q "SELECT * FROM pedidos"
npx prisma studio           # explorador visual (SQL Server local)
```

### Nota sobre el seed
`npx tsx prisma/seed.ts` borra y vuelve a crear TODO (estado canónico). Es la forma de
"resetear" la demo tras probar operaciones.

---

## 7. Fase C — Motor de sync offline (PRÓXIMA)

Objetivo: operar sin internet en 5+ terminales por local y sincronizar cuando haya red.

### Piezas a diseñar (borrador)
1. **Cola local por terminal** (en el front): mapa `{opType, clientOpId, payload, companyId, createdAt}`.
2. **Idempotencia en el server** vía tabla `client_ops`:
   - `clientOpId` UNIQUE por operación enviada desde una terminal.
   - Si llegó un `clientOpId` repetido → devolver el resultado previo (200) sin re-ejecutar.
   - Campos típicos: `{clientOpId, deviceId, entity, entityId, action, payload}`.
3. **Endpoint candidato**: `POST /api/sync/client-ops` (Bearer) que procesa un array de ops
   y devuelve `{results:[{clientOpId, ok, data?, error?}]}` y `{serverTime, lastSyncUtc}`.
4. **Bajada incremental**: `GET /api/sync/delta?since=<utc>` filtrando tablas por
   `updatedAt > since` (y `isDeleted` para soft-deletes) → el cliente actualiza su cache.
5. **Resolución de conflictos**: catálogos `version` + `updatedAt` → last-write-wins
   protegido por `clientOpId`. Operaciones de negocio (ventas/pagos) son append-only
   (no requieren merge).
6. **Ticket off-line**: cuando no hay red, el terminal asigna numeración aproximada
   (`ticketNumber` provisional tipo `LOCAL-<seq>`) y la renumera al sincronizar con
   `numbering_sequences` (por empresa). Definir estrategia de re-numeración (riesgo:
   tickets ya impresos/cobrados).

### Riesgos > Recordar
- **No romper el backend actual**: el sync agrega nuevas rutas/servicios; NO tocar el
  esquema de tablas existentes salvo sumar a `client_ops` si hiciera falta.
- La tabla `client_ops` ya existe en el schema (modelo `ClientOp`) — verificar campos
  antes de asumir.

---

## 8. Fase D — Socket.io (🚧 en curso: mesas/órdenes en vivo ✅ 2026-10-15)

- ✅ Mesas/órdenes en vivo entre terminales (rooms por `companyId`, reconexión + re-sync REST).
- ✅ **Kardex & Stock en vivo**: movimientos de kardex (ajuste/merma en `kardex/adjustments`, despacho `sendToKitchen`, devolución de cocina, entrada de compra `ENTRADA_COMPRA`) se notifican por socket (`kardex:changed`) y se reflejan al instante en el módulo Kardex & Stock de todos los terminales de la empresa (idempotente por `referenceDoc`, respeta modo offline simulado).
- ✅ **Compras & Facturas en vivo**: alta de compra (`POST /purchases`) y regularización de vale (`POST /purchases/:id/regularize`) se notifican por socket (`purchase:changed`) y aparecen al instante en el módulo Compras, Facturas & Vales de todos los terminales de la empresa (dedup por `purchaseId`, respeta modo offline simulado).
- ✅ **Recetas / Fichas Técnicas en vivo**: creación (`POST /catalogs/recipes`), actualización (`PATCH /catalogs/recipes/:id`) y soft-delete (`DELETE /catalogs/recipes/:id`) se notifican por socket (`recipe:changed`) y se reflejan al instante en el módulo Fichas Técnicas de todos los terminales de la empresa (dedup por `recipeId`, respeta modo offline simulado).
- ✅ **Fix validación recetas**: `saveRecipe` en `POSContext.tsx` ahora convierte `quantity`/`costPerUnit`/`subtotalCost` de ingredientes a número con `Number()` antes del `POST /catalogs/recipes`, evitando error `VALIDATION_ERROR: expected number, received string`. También envía `null` en lugar de `undefined` en campos opcionales (`productId`, `preparationNotes`).
- ✅ **Ficha técnica → plato en el menú (mesas)**: `saveRecipe` crea/actualiza el plato vinculado en el catálogo de productos: si no existe, lo crea con `POST /catalogs/products` (`hasRecipe: true`, nombre, precio de venta, categoría `platos`, empresa de la ficha); si ya existe, lo actualiza con `PATCH /catalogs/products/:id`. El plato aparece al instante en las mesas (escritura optimista local + sincronización al servidor) y se replica a todos los terminales mediante el nuevo evento `product:changed` (Fase D). Si la ficha no vincula un plato existente, se crea uno nuevo automáticamente, resuelviendo que un plato creado desde una ficha técnica no apareciera al elegir en la mesa. Verificado a nivel API con smoke test (2026-10-17): `POST`/`PATCH`/`DELETE /catalogs/products` → HTTP 200 con `hasRecipe` persistido, y `POST /catalogs/recipes` con el `productId` real retornado. Fix colateral: `emitProductChanged` usa conversión segura de fechas (`new Date(...).toISOString()`) porque `plain()` ya serializa fechas a string.
- ✅ **Fix raíz: FK `fk_recetas_productos` al guardar fichas (2026-10-17)**: el bug reportado ("Arroz con Huevo a la Limeña" visible en la app pero ausente en `recetas`) era que `POST /catalogs/recipes` fallaba con violación de FK cuando el `productId` temporal (`prod-<timestamp>`, fichas creadas con API caída o offline simulado) no existía en `productos` → HTTP 500 → la op en cola quedaba en `retry` infinito (nunca en BD). Correcciones (server `master.service.ts`):
    1. `resolveRecipeProduct()` en `createRecipe`/`updateRecipe`: si `productId` es nulo o no existe, **se crea el producto automáticamente** con los datos de la ficha (`companyId`, nombre, precio, categoría, `hasRecipe: true`) + `emitProductChanged`; si el producto ya existe, se marca `hasRecipe` si faltaba.
    2. `validInsumoIds()`: ingredientes con `insumoId` de insumos no sincronizados en BD (ids temporales `ins-*` offline) se guardan ahora con `insumo_id NULL` conservando `nombre_insumo` — antes violaban FK y la receta completa quedaba en cola eterna.
    3. Schema Zod de `POST /catalogs/recipes`: `preparationNotes` ahora `nullable` (el cliente enviaba `null` y el POST respondía 400 VALIDATION_ERROR aunque el PATCH sí lo aceptaba).
    4. Cliente: la op en cola `saveRecipe` lleva `tempProductId` y `reconcileCatalogCreate` remapea el plato local al id real tras el replay (sin duplicado en mesa). Si el producto ya se creó en línea pero la receta falla por red, la cola viaja con el `productId` real.
    5. **Test API/BD confirmado (2026-10-17)**: `POST /catalogs/recipes` con `productId` e `insumoId` inexistentes → HTTP 201; filas verificadas en `recetas`, `productos` (producto auto-creado) e `ingredientes_receta` (`insumo_id` NULL, nombre conservado); `PATCH` → HTTP 200 con reemplazo de ingredientes; limpieza de datos de prueba OK (0 filas activas).
    6. **✅ Confirmado por el usuario**: tras recargar la app con la API arriba, la ficha pendiente en cola se sincronizó y "Arroz con Huevo a la Limeña" quedó registrada correctamente en la BD (el contador de cola se vació y la ficha ya impacta en `recetas`).
- ✅ **Insumos en vivo**: creación (`POST /catalogs/insumos`), actualización (`PATCH /catalogs/insumos/:id`) y soft-delete (`DELETE /catalogs/insumos/:id`) se notifican por socket (`insumo:changed`) y se reflejan al instante en el módulo Kardex & Stock de todos los terminales de la empresa (dedup por `insumoId`, respeta modo offline simulado).
- ✅ **Métodos de pago en vivo**: creación, actualización y soft-delete se notifican por socket (`paymentMethod:changed`) y aparecen al instante en el módulo de configuración de todos los terminales (dedup por `paymentMethodId`, respeta modo offline simulado).
- ✅ **Impresoras en vivo**: creación, actualización y soft-delete se notifican por socket (`printer:changed`) y aparecen al instante en el módulo de impresoras de todos los terminales (dedup por `printerId`, respeta modo offline simulado).
- Pendiente: notificar a cocina/barra/caja al enviar (`sendToKitchen`) — pantalla dedicada de cocina/barra pendiente de Fase D/E5.

---

## 9. Fase E — Frontend React a la API (PRÓXIMA A RETOMAR)

- Front actual (`src/`) = DEMO intacto: `POSContext.tsx` (lógica), `initialData.ts` y
  `types.ts`. Servirá como referencia visual/lógica, no como capa de datos.

### ⚠️ Decisión previa: contrato de sync mínimo ANTES/durante E
El requisito NO negociable del sistema es operar sin internet (offline-first, 5+ terminales).
Por eso la Fase E debe incorporar desde el inicio el "contrato de sync" mínimo para NO
rehacer el front después:
- **`clientOpId` en toda mutación: órdenes, items, pagos, compras, kardex, turnos.**
  La UI debe generar el `clientOpId` (UUID) al momento de crear la operación local,
  guardarlo con el payload y enviarlo a la API. Así el servidor puede deduplicar reintentos.
- **Operaciones no destructivas**: el front NUNCA edita/borra catálogos compartidos de
  forma ciega; cualquier fallo debe poner la op en cola (para Fase C) en vez de perderse.
- **Cache local + versión**: al cargar catálogos, guardar `version`/`updatedAt` para poder
  hacer delta sync (Fase C) sin re-descargar todo.
- **Diseño de la cola desde el arranque**: aunque el sync completo (Fase C) se construya
  después, el front debe preparar la estructura (mapa de ops por terminal + estado por
  `clientOpId`) para no re-trabajar.
> Si se hace E sin este contrato, la UI dejará de funcionar sin internet (rompe el
> requisito offline-first) y habrá que reescribir gran parte del front.

### Pasos de implementación de E
1. **Inventario del front**: mapear pantallas/contextos que usan mock para decidir qué reemplazar.
2. **Cliente API** (`src/lib/api.ts`): `fetch` con base `http://localhost:4000/api`,
   `Authorization: Bearer`, manejo de `{error:{code,message}}`, helper de token con expiración
   (localStorage + `expiresAt`).
3. **Login real**: pantalla PIN + deviceCode con `POST /api/auth/login`; guard de sesión
   (redirigir si expira); `GET /api/auth/me` para validar.
4. **Catálogos desde API**: reemplazar mock por `GET /api/catalogs/*?companyId=`
   (empresas, mesas, productos, métodos de pago). Guardar `version`/`updatedAt`.
5. **Operaciones**: conectar órdenes y pagos a `POST /api/operations/*` llevando `clientOpId`.
6. **Base del sync**: dejar la estructura de cola + estado por `clientOpId` (para Fase C).

### E1 — Cliente API + Auth real (✔ realizado 2026-09-06)

> Milestone corto y verificable: la UI ya autentica contra la API real (ya NO acepta cualquier PIN).

**Archivos**
- `src/lib/api.ts` (nuevo) — `apiClient.get/post/patch/del`, `ApiError` (code/status), token store
  `ts_auth_token` / `ts_auth_expires`, inyecta `Authorization: Bearer`, parsea
  `{error:{code,message}}` del backend.
- `src/vite-env.d.ts` (nuevo) — referencia `vite/client` para tipar `import.meta.env`.
- `src/types.ts` — `User` reconciliado con `publicUser()` del API (se quitó `pin`; `avatar`→`avatarUrl`;
  se sumaron `companyId`, `isActive`, `version`, `createdAt`, `updatedAt`). Nuevos tipos de contrato:
  `AuthToken`, `DeviceDTO`, `CompanyShiftDTO`, `LoginResponse`, `MeResponse`, `ApiErrorResponse`.
- `src/data/initialData.ts` — `INITIAL_USER` ajustado al nuevo tipo (sin `pin`, `avatarUrl`, `assignedCompanyId: null`).
- `src/context/POSContext.tsx` — `currentUser` inicia en `null` (ya no confía en localStorage);
  estado `authToken`, `isAuthenticating`, `isSessionInitializing`, `companies` (del API);
  `login(pin)` async → `POST /api/auth/login` (device `TERM-CENTRAL-01`), guarda token+user+companies+shifts,
  re-elige empresa activa si ya no existe; `logout()` revoca sesión (`POST /api/auth/logout`) y limpia token;
  restauración al montar vía `GET /api/auth/me` con token (401 → limpia y muestra login).
- `src/components/LoginScreen.tsx` — submit async con `isAuthenticating`, errores del server
  (ej. "PIN incorrecto. Intente nuevamente."), se quitó el campo password decorativo, quick-login Carlos M. (1004).
- `src/App.tsx` — splash "Validando sesión..." mientras `isSessionInitializing` (evita parpadeo del login).
- `vite.config.ts` — proxy `/api` y `/health` → `http://localhost:4000` (sin CORS en dev).

**Verificación (todo ✔)**
- `npx tsc --noEmit` = **0 errores** (`npm run lint` = lo mismo).
- `npm run build` = **52 módulos, sin errores**.
- Smoke test con Vite (`:3000`) + API (`:4000`):
  - `GET /health` por proxy OK.
  - `POST /api/auth/login` PIN `1004` → token + user (Carlos M.) + 2 empresas + 2 turnos.
  - `GET /api/auth/me` con Bearer → restaura sesión (user + 2 empresas + 2 turnos).
  - PIN `9999` → **401** `{error:{code:"INVALID_CREDENTIALS",message:"PIN incorrecto. Intente nuevamente."}}`
    (el front lo muestra tal cual).

**Notas / pendientes de E**
- Catálogos y operaciones siguen en mock (`initialData.ts` / localStorage) → son **E2** y **E3**.
- El `clientOpId` en mutaciones y la estructura de cola se incorporan en E3 (contrato de sync mín.).
- Aún no hay commits de git (repo sigue sin `git init`).

### E2 — Catálogos desde API (solo lectura) (✔ realizado 2026-09-06)

> Alcance aprobado por decisión del usuario: **SOLO lectura (GET)** y **SOLO catálogos**.
> Sin mutaciones ni operaciones (compras/kardex/turnos/transacciones) → quedan para E3/E4.
> Trae **ambas empresas** (sin `?companyId=`) para que el modo "todas" y el switcher client-side sigan igual.

**Archivos**
- `src/types.ts` — campos optativos de sync (`version?`, `updatedAt?`, `createdAt?`, `isDeleted?`) en
  Table, Product, BankAccount, CustomPaymentMethod, ThermalPrinterConfig, Insumo y Recipe;
  nuevos tipos `CatalogEntity`, `CatalogMeta {entity, updatedAt, version, count, fetchedAtUtc}`,
  `CatalogSyncMeta = Partial<Record<CatalogEntity, CatalogMeta>>` (para el delta-sync de Fase C).
- `src/lib/catalogMapper.ts` (nuevo) — DTOs crudos del API + mappers puros:
  `mapTable`, `mapProduct`, `mapInsumo`, `mapRecipe` (ingredients anidados), `mapBankAccount`,
  `mapPaymentMethod`, `mapPrinter`; `companyId: null` → `'ambas'` (insumos, payment methods, printers);
  printers: `categories[]` aplanadas → `categoriesMapped: string[]` (ordenadas por `idx`);
  helper `extractMeta(entity, items)` → `CatalogMeta` (toma el `updatedAt`/`version` mayor).
- `src/context/POSContext.tsx` — estado `catalogSyncMeta` (persistido en localStorage `ts_catalog_meta_v2`)
  e `isCatalogsLoading` (ambos expuestos en el contexto); función `loadCatalogs()` que dispara **7 GETs en
  paralelo** (`/catalogs/tables|products|insumos|recipes|bank-accounts|payment-methods|printers`),
  mapea y aplica al estado, actualiza la meta, y con `Promise.allSettled` tolera fallo parcial
  (conserva el dato local + notificación warning); se invoca tras login y tras restaurar sesión vía `/me`.

**Verificación (todo ✔)**
- `npm run lint` (`tsc --noEmit`) = **0 errores** · `npm run build` = **53 módulos, sin errores**.
- Smoke test API `:4000` (login PIN `1004` → Bearer):
  - `/catalogs/tables` → 13 (t-b1) · `/products` → 16 (prod-sab-inca) · `/insumos` → 13 (ins-lomo)
    · `/recipes` → 7 (rec-pollo-entero, con `ingredients[]`) · `/bank-accounts` → 4 (bank-tayta-bbva)
    · `/payment-methods` → 9 (pm-sabroso-cash) · `/printers` → 4 (prn-03, `categories[]` → `bebidas@0, postres@1`).
  - Formas exactas verificadas contra los DTOs del mapper (propiedades coinciden 1:1).
  - `companyId: null` presente en insumos (→ 'ambas') y en todos los printers; payment-methods solo el-tayta/el-sabroso.
- Smoke proxy Vite `:3000` → `/api/catalogs/products` con Bearer = **200, count=16** (el proxy de E1 sirve para catálogos).

**Notas / pendientes de E**
- `loadCatalogs()` reemplaza el mock de catálogos al iniciar sesión; si NO hay API (offline), el
  fallo parcial mantiene `initialData.ts`/localStorage (la app no se rompe).
- Aún sin commits de git (repo sigue sin `git init`).

### E3 — Operaciones reales con `clientOpId` (✔ realizado 2026-09-06)

> Alcance aprobado por el usuario ("luz verde"): **write-through de operaciones** manteniendo
> el efecto optimista local; contrato de sync mínimo de Fase C vía `clientOpId` + cola local.
> Decisiones de respuesta a preguntas de alcance: (1) transacciones manuales de Caja **sí** se
> conectan (nuevo endpoint `POST /api/operations/transactions`); (2) overhaul offline toggle real
> (encola sin llamar al API); (3) dedup mínimo: `clientOpId` repetido devuelve el registro existente (no 409).

**Backend (server compila ✔ con `npm run build`)**
- `order.service.ts` — `clientOpId?` en `openOrderForTable` / `createQuickBarOrder` /
  `openOrderForTableTx` / `payTable` (`PayTableInput`): **dedup** `findFirst` por `clientOpId`
  (open → devuelve la orden existente; pay → devuelve `{order, transaction}` existente);
  creates usan `input.clientOpId ?? randomUUID()`.
- `purchase.service.ts` — `clientOpId?` en `CreatePurchaseInput`; create **idempotente** (reusa el registro con `items`).
- `kardex.service.ts` — `clientOpId?` en input de ajuste; dedup → `{movement, companyId}`.
- `shift.service.ts` — `clientOpId?` en `switchCompanyShift` (el Ajuste de Saldo queda idempotente);
  **nuevo `createManualTransaction(input)`** → valida empresa/turno, opcionalmente incrementa/decrementa
  `currentBalance` del banco, arma `bankAccountAlias`, retorna `plain(transaction)`.
- `operations.routes.ts` — zod de `orders/open`, `orders/quick-bar`, `tables/:id/pay`, `purchases`,
  `kardex/adjustments`, `shifts/switch` aceptan `clientOpId?`; **nuevo `POST /transactions`** (201).

**Frontend (nuevo/front E3)**
- `src/types.ts` — `clientOpId?: string` en Order/Transaction/Purchase/KardexMovement; tipos
  `PendingOpEntity` (`order|orderItem|transaction|purchase|kardexMovement|shift`), `PendingOp {
  clientOpId, entity, op, payload, createdAt }`, `ManualTransactionInput`.
- `src/lib/operationMapper.ts` (nuevo) — DTOs (Order/OrderItem/Transaction/Purchase(+items)/
  KardexMovement/ShiftRecord) + `mapOrder/mapTransaction/mapPurchase/mapKardexMovement/mapShiftRecord`;
  `timestamp` ISO string → `number` (Date.parse); `companyId: null` → `undefined`;
  reutiliza `toCompanyId` de `catalogMapper.ts`.
- `src/lib/offlineQueue.ts` (nuevo) — cola persistente `ts_pending_queue_v2`
  (`loadQueue/saveQueue/enqueue/removeByClientOpId/clearQueue/queueCount`).
- `src/context/POSContext.tsx` — `isOperationsLoading` (expuesto); `loadOperations()` (5 GETs paralelos:
  `/orders/active`, `/purchases`, `/kardex`, `/shifts/records`, `/transactions`) disparada tras login y `/me`;
  refreshers granulares (`refreshKardex/refreshInsumos/refreshTransactions/refreshBankAccounts/refreshShiftRecords`);
  `newUuid()` (crypto.randomUUID + fallback); **`attemptMutation({clientOpId, entity, op, queuePayload, endpointOp})`**:
  offline simulado → encola sin API; éxito → `endpointOp` reconcilia; red/5xx → conserva local + encola + warning;
  4xx de negocio → `loadOperations()` (resync) + warning; `syncPendingCount()` = `queueCount()`.

**Conversión de mutaciones (mantienen su efecto optimista local + write-through)**
- Apertura de mesa → `POST /orders/open` con orden temporal `order-tmp-*`; al resolver cambia al id real
  del server (mesa + `currentOrderId` + `selectedTableId`) y **flushes ítems añadidos** durante el window
  (`tmpOrderItemsRef`, re-POST + GET refrescado).
- Comanda rápida sin barra libre → `POST /orders/quick-bar` (el server crea la mesa de barra; se sustituye
  la mesa temporal `t-express-*` por la real).
- `addItemToOrder` / `updateItemQuantity` / `updateItemNotes` / `removeItemFromOrder` → POST/PATCH/DELETE
  de ítems sobre la orden real (solo si el id no es `order-tmp-`); reconciliación con la respuesta del server.
- `sendToKitchen` → `POST /orders/:id/send-to-kitchen`; la deducción local de insumos se conserva y,
  al éxito, `refreshKardex + refreshInsumos` la reemplazan por la verdad del server; offline → queda la local.
- `completePayment` → `POST /tables/:id/pay` (`{order, transaction}` reconciliados; mesa libre ya hecha por el
  flujo optimista; `lastCompletedOrder` = orden del server; `refreshTransactions + refreshBankAccounts`).
- `addManualTransaction` → `POST /transactions` (reemplaza el id optimista `tx-*` por el real del server).
- `addPurchase` → `POST /purchases`; al éxito descarta la compra optimista y recarga desde `/purchases`
  + `refreshInsumos/refreshKardex/refreshTransactions/refreshBankAccounts`.
- `switchCompanyShift` → `POST /shifts/switch` (+ `refreshShiftRecords + refreshTransactions`).
- `addKardexAdjustment` → `POST /kardex/adjustments` (+ `refreshKardex + refreshInsumos`).
- Offline: `toggleSimulatedOffline` muestra el conteo real de cola; `syncOfflineQueue` = **placeholder**
  (replay automático real = **Fase E4**).

**Verificación (todo ✔)**
- `npx tsc --noEmit` = **0 errores** · `npm run build` = **55 módulos, sin errores**.
- **Bugs reales encontrados y fijados (2026-09-06), verificados por el usuario al probar:**
  - `completePayment` llamaba `POST /orders/:orderId/pay` — pero la ruta real es **`POST /tables/:id/pay`**
    (`operations.routes.ts`). El 404 entraba en la rama 4xx de `attemptMutation` → `loadOperations()` →
    **borraba la transacción optimista local**, por eso la venta no quedaba en BD. Fix: URL corregida en
    `POSContext.completePayment` a `` `/tables/${table.id}/pay` ``.
  - `createQuickBarOrder` sin mesa de barra libre creaba `t-express-${randomUUID()}` **> 36 chars** vs.
    `mesas.id NVarChar(36)` → `P2000` truncation → `DATABASE_ERROR`. Fix: id `t-express-` + 26 hex.
  - `regularizePurchase` era **solo local**; ahora hace write-through a `POST /purchases/:id/regularize`.
  - `attemptMutation` 4xx: la notificación ahora muestra `params.op`.
- **Matriz exhaustiva de verificación** (script
  `C:\Users\Mauro\AppData\Local\Temp\opencode\verify_e3.ps1`; API `:4000` + lectura SQL `sqlcmd`)
  → **17/17 PASS en 2 ejecuciones** (sobre mesas de `el-tayta`):
  1. login PIN malo → `401` · login `1004` → token · `/auth/me` → user.
  2. `POST /orders/open` 201 + `clientOpId` repetido → **misma orden**; mesa en BD `ocupada` + `pedido_actual_id`.
  3. `POST items` ×3 → **3 filas** en `detalle_pedidos` · `PATCH quantity` (delta=2 → qty `3.00`) ·
     `PATCH notes` (`bien cocido`) · `DELETE item` → 2 filas.
  4. `send-to-kitchen` → orden `en_cocina` + **kardex `SALIDA_VENTA_POS`** (stock insumo 17.91→17.64).
  5. **`POST /tables/:id/pay`** → pedido `cobrado|180.54|Efectivo`, 1 transacción, mesa `libre`.
  6. `POST /transactions` manual → tx en BD + **saldo banco 3178→3166 (−12)**.
  7. `POST /purchases` (regularizado) → compra+item, kardex `ENTRADA`, **stock 28.5→34.5 (+6)**, tx **Pago Proveedor**.
  8. `POST kardex/adjustments` ×2 mismo `clientOpId` → **1 sola** merma (`23→24`).
  9. `POST /shifts/switch` → **registro nuevo** + turno nuevo (registros +1, `turno_actual` cambia).
  10. `POST /orders/quick-bar` → orden real + mesa de barra `ocupada` (reusa la libre), luego liquidada.
  11. `POST /purchases` (provisional) + `POST /purchases/:id/regularize` → `regularizado|B001-XXXX`.
- Smoke extra API `:4000`: `POST /transactions` dedup (Caja Chica 15.5) → misma tx · proxy Vite `:3000`
  → `/api/operations/transactions` = `200, count=10`.

**Fase E3 — verificación final (20/20 PASS): auto-liberar mesa al vaciar comanda (2026-09-06)**
- **Auto-liberar mesa**: si la comanda queda sin ítems (borrar el último o reducir a 0), el server libera la mesa
  (`estado=libre`, limpia `pedido_actual_id`/ocupada desde/mesero) y elimina lógicamente el pedido
  (`esta_eliminado=1`). Helper `vacateOrderAndFreeTable` en `order.service.ts`, invocado desde
  `removeItemFromOrder` y `updateItemQuantity`.
- **Guard anti-race**: solo libera la mesa si esa comanda sigue siendo su `pedido_actual_id` (evita pisar una
  orden nueva creada durante replays offline del queue).
- **Frontend**: `vacateTableState` libera la mesa, limpia la orden del estado local, vuelve a la pantalla de mesas
  con notificación; mutaciones `removeItem`/`updateItemQuantity` ahora tienen `rollback` que restaura mesa/orden/
  pantalla si el server rechaza la operación.
- **Hallazgo/diagnóstico**: `pedidos.id_operacion_cliente` es `nvarchar(36)`; un `clientOpId` >36 chars provoca
  `DATABASE_ERROR` al abrir mesa. El frontend usa UUIDs de 36 (OK). El harness ahora usa clientOpId corto.
- **Nota de entorno**: se detectaron **dos instancias `npm run dev:all`** corriendo (la API quedó sirviendo código
  viejo hasta reiniciar su proceso tsx watch). Recomendado cerrar una y reiniciar `dev:all` limpio.

**Fase E3 — verificación final (19/19 PASS): ciclo de venta cerrado (2026-09-06)**
- Harness `verify_e3.ps1`: 19/19 PASS (nuevos pasos: reverso Kardex + items `servido` al pagar). Logger temporal quitado.
- **Ciclo de estado de ítems completado**: al cobrar, `payTable` marca todos los `orderItem`
  (`detalle_pedidos.estado`) como **`servido`** → la venta final queda `agregado → en_cocina → servido`
  (antes quedaban `en_cocina` tras pagar).
- **Reverso de Kardex**: `updateItemQuantity` (al reducir) y `removeItemFromOrder` (al borrar) detectan ítems
  en `en_cocina` (ya hubo rebaja por receta) y generan `ENTRADA_DEVOLUCION_VENTA_POS` + reposición de
  `stock_actual` por insumo (helper `reverseKitchenForItems`, misma lógica de receta que `sendToKitchen`).
- **Política de cancelación (decisión)**: borrado físico actual. Quitar ítem = se borra la fila (con reverso de
  Kardex si estaba despachado). Sin soft-delete `cancelado`; sin anulación de pedido completo (no existe aún).
- **Decisiones documentadas (NO implementadas — pendientes)**:
  - **IGV doble criterio**: ventas aplican 18% sobre subtotal (excl.); compras guardan IGV "incluido"
    (`total - total/1.18`). Unificar cuando se defina el criterio contable.
  - **Folio de ticket sin reset diario**: `allocateTicket` incrementa secuencia por empresa/entidad
    indefinidamente (no arranca en 1 cada día).
  - **Pantalla de Cocina/despacho inexistente**: solo hay badge `en_cocina` en la comanda; el cliente no ve
    comandas pendientes (fase E5).

**Fase E3 — verificación final (18/18 PASS) y fixes extra (2026-09-06)**
- Harness `verify_e3.ps1`: 18/18 PASS. Logger temporal del server quitado; app limpia de instrumentación.
- **Fix "pedidos.estado no cambia al pasar a por cobrar"**: `proceedToPayment` solo tocaba estado local (nunca
  había llama server). Agregado **write-through**: nuevo servicio `markTableForBilling` + ruta
  `POST /api/operations/tables/:id/por-cobrar` (devuelve la orden con items; setea `pedidos.estado='por_cobrar'`
  y `mesas.estado='por_cobrar'`, ambos nvarchar soportan el valor) + en `POSContext.proceedToPayment` se llama por
  `attemptMutation` con `rollback` (vuelve mesa/orden al estado previo si falla).
- **Auditoría de transiciones de estado (write-throughs)**: abrir→`ocupada` ✓, agregar items ✓, cantidad/notas/
  borrar ✓, cocina→`en_cocina` ✓, **por cobrar ✓ (CERO)** techo. Pagar→`cobrado`+mesa `libre` ✓. Gaps conocidos
  (fuera del alcance E3-despliegue): CRUD de mesas/insumos/proveedores en settings es client-only (hay endpoints en
  server `/api/catalogs` sin usar), y `ts_pending_queue_v2` se llena en offline pero el replay es E4.
- **ErrorBoundary** (`src/lib/AppErrorBoundary.tsx`, montado en `main.tsx`): error de render → pantalla de recarga
  en vez de pantalla negra.
- **`attemptMutation` roto por forma de respuesta**: quantity/delete ya usan orden directa (`res.id`) y pay la
  mantiene en `{order, transaction}`. La píldora `btn-sync-status` + `notify` muestran cualquier fallo futuro.

**Fixes post-confirmación (2026-09-06)**
- Usuario confirma que la app YA impacta en BD (mesa t-04 `ocupada` con pedido tras abrir + agregar items).
- Bug de forma de respuesta encontrado: `updateItemQuantity` y `removeItemFromOrder` del server devuelven la **orden
  directa**, pero el frontend esperaba `{ order }` → `res.order.id` lanzaba TypeError dentro de `endpointOp`
  (toast "Fallo" + resync vía `loadOperations`). Corregido en `POSContext.tsx` para usar `res.id`/`mapOrder(res)`
  directos. El resto de contratos cuadran (order directo en open/add/quick-bar, `{order,transaction}` en pay,
  purchase directo en regist/regularize).
- El "pantalla negra al aumentar cantidad": NO es bug de la app — fue un **full-reload de Vite (HMR)** por la
  edición de `POSContext.tsx` en el mismo momento (al editar un módulo de contexto Vite recarga toda la página);
  F5 la restauró. No habrá más recargas al no haber más edits.

**CAUSA RAÍZ REAL (confirmada por logger de peticiones del server, 2026-09-06)**
- Se instrumentó `server/src/app.ts` con un logger temporal (append a `C:/Users/Mauro/AppData/Local/Temp/opencode/browser_requests.log`).
  El navegador SÍ llegaba al server con auth correcto y origin `http://localhost:3000`, pero TODAS las escrituras/lecturas de
  operaciones usaban rutas **sin** el prefijo `/operations`:
  `POST /api/orders/open` (404), `POST /api/orders/:id/items` (404), `GET /api/orders/active` (404),
  `/api/purchases`, `/api/transactions`, `/api/kardex`, `/api/shifts/records` (404). El server solo monta
  `router.use('/operations', operationsRoutes)` (`server/src/routes/index.ts`) → el frontend jamás escribió nada.
  El harness E3 pasaba porque prueba el server con las rutas CORRECTAS del contrato, no el frontend.
- **Fix**: en `src/context/POSContext.tsx` se agregó el prefijo `/operations` a TODAS las llamadas de operaciones
  (`/operations/orders/open|quick-bar|active|:id|:id/items…`, `/operations/tables/:id/pay`, `/operations/purchases…`,
  `/operations/transactions`, `/operations/kardex…`, `/operations/shifts/records|switch`). Verificado con `tsc --noEmit`
  (0 errores) y con el módulo servido por Vite. La píldora `btn-sync-status` + `notify` muestran cualquier fallo futuro.

**Endurecimiento de resiliencia (2026-09-06) — diagnóstico de "no impacta en BD"**
- **Síntoma**: al probar en la UI (abrir mesa + items) la BD no cambiaba (pedidos/tx sin deltas), aunque la
  UI se veía normal. Infra OK (API `:4000` 401 en login malo, proxy `:3000/api` OK, CORS abierto `origin:true`,
  JWT secreto estable TTL 12h, sin service worker). La BD tenía una mesa `T2|ocupada|sig Pedido NULL` = rastro
  de apertura **solo local** (jamás write-through).
- **Causas cubiertas por el endurecimiento** (`POSContext.attemptMutation`, ramas):
  1. **Offline simulado ON** (toggle en Configuración→Sincronización): encolaba en `ts_pending_queue_v2` y
     **nunca llamaba al API**. Era invisible (solo existía en el modal de Configuración).
  2. Token vencido a mitad de sesión → 401 silencioso en cada POST (no se validaba `expiresAt`).
  3. 4xx de negocio dejaba "mesas fantasma" (`ocupada` sin `pedido_actual_id`) y estados optimistas colgados
     (el bump de saldo de banco en un pago rechazado).
  4. Navegador → `http://localhost:4000/api` **directo** (no usaba el proxy de Vite): expuesto a bloqueos
     CORS/red del browser.
- **Fixes aplicados (todo verificado: `tsc --noEmit` 0 errores + `npm run build` OK + cadena por proxy OK):**
  - `src/lib/api.ts`: `API_BASE` = `import.meta.env.VITE_API_URL ?? '/api'` (**usa el proxy de Vite**, elimina
    el salto directo a `:4000`); nuevo `isTokenExpired()` → valida `expiresAt` antes de CADA request y lanza
    `401 UNAUTHORIZED` + `clearAuthToken()` si venció.
  - `POSContext.attemptMutation`: nuevo `rollback?` por operación; en **401 → `logout()`** automático +
    notificación; en 4xx → `rollback?.()` + notificación con `params.op` + `loadOperations()`. Se agregaron
    rollbacks para: **openOrder** (libera la mesa y quita la orden `order-tmp-*`), **quickOrder** (elimina la
    mesa Express + orden tmp creadas), **payOrder** (restaura la mesa a `por_cobrar`, re-vincula la orden y
    **deshace el bump optimista de `currentBalance`** del banco).
  - Nuevo estado/UI: `lastSyncResult` (ok/ts/op de la última escritura) + **indicador de conexión permanente
    en el Header** (`btn-sync-status`): `Online` / `Offline Simulado` / `Sin Red`, con badge de nº de
    operaciones en cola y tooltip de la última escritura → ningún fallo vuelve a ser invisible.

**Sesión 2026-09-07 — migración a Mac + fixes de sincronización mesa/BD (todo verificado por el usuario)**
1. **Fix entorno: `concurrently: Permission denied` tras migrar de PC.**
   - Síntoma: `npm run dev:all` fallaba con `sh: .../node_modules/.bin/concurrently: Permission denied`.
   - Causa: al copiar el proyecto entre máquinas, los binarios de `node_modules/.bin` pierden el bit de ejecución.
   - Fix: `rm -rf node_modules package-lock.json` (raíz y `server/`) + `npm install` en ambos.
2. **Fix "auto-liberar mesa no impactaba en BD"** (`src/context/POSContext.tsx`).
   - Síntoma: al vaciar una comanda (borrar el último ítem o reducir a 0) la mesa se liberaba visualmente pero la
     BD quedaba con mesa `ocupada` y pedido activo; al recargar reaparecía el último producto y la mesa seguía ocupada.
   - Causa raíz: en las ramas `becomingEmpty` de `removeItemFromOrder` y `updateItemQuantity` el `endpointOp` de
     `attemptMutation` era un **no-op** (comentario "Orden anulada (isDeleted) en el server...") → **nunca se enviaba**
     el DELETE/PATCH al server → `vacateOrderAndFreeTable` jamás se ejecutaba en el backend.
   - Fix: ambas ramas ahora ejecutan el endpoint real y reconcilian con la respuesta:
     - `removeItemFromOrder` → `DELETE /operations/orders/:id/items/:itemId`; si `res.isDeleted` confirma la
       liberación; si no, `setOrders` con `mapOrder(res)`.
     - `updateItemQuantity` → `PATCH /operations/orders/:id/items/:itemId/quantity`; misma lógica.
   - Nota: `vacateOrderAndFreeTable` ya existía en `order.service.ts` y se invocaba desde el server; solo faltaba
     que el frontend llamara al endpoint final.
3. **Fix "mesa visualmente ocupada pero BD `libre`"** (`server/src/services/order.service.ts`).
   - Síntoma: al abrir una mesa y agregar productos, pedidos/ítems SÍ quedaban en BD pero la mesa se mantenía `libre`.
   - Causa raíz: al forzar mesas a `libre` con `UPDATE mesas SET estado='libre' ...` **sin** limpiar `pedido_actual_id`,
     `openOrderForTable` entraba en el early return `if (table.currentOrderId) { ... if (existing) return existing; }`
     → devolvía la orden existente (activa) **sin actualizar la mesa**. Los ítems se agregaban a esa orden vieja
     (por eso aparecían en BD) pero la mesa nunca cambiaba a `ocupada`.
   - Fix aplicado en `openOrderForTable` y `openOrderForTableTx` (quick-bar):
     - Al resolver la orden referenciada filtran `isDeleted: false` y rechazan `status === 'cobrado'`.
     - Si la orden es válida y la mesa NO está `ocupada` → la sincronizan (`status:'ocupada'`, `occupiedSince`,
       `currentOrderId`, `waiter`) **antes** de retornar (cubre desincronización por UPDATE manual en BD).
     - Si la orden referenciada ya no es válida → limpian `currentOrderId` (referencia muerta) y crean orden nueva.
   - Verificación: usuario confirma que al abrir mesas 04/05 (forzadas `libre` con pedidos previos) la mesa ya
     queda `ocupada` en BD con su pedido correcto.
4. **Verificación**: `npx tsc --noEmit` = **0 errores** (raíz y `server/`) · `npm run build` = 56 módulos OK.

**Sesión 2026-09-08 — revisión de Compras E3: fix "Guardar Compra y Afectar Kardex no hace nada"**
1. **Síntoma (reportado por el usuario en la UI, modal "Registrar Compra Formal con Factura")**: al hacer clic en
   "Guardar Compra y Afectar Kardex" no pasaba nada (modal abierto, sin toast). En F12 → Console se vio
   `Uncaught TypeError: (stockBefore + item.quantity).toFixed is not a function` en `POSContext.tsx:2000`;
   en Network **no salía ningún POST** a `/operations/purchases`.
2. **Causa raíz**: el input de cantidad `/ costo unitario` del modal guardaba el **string** de `e.target.value`
   (`handleItemChange` solo hacía `parseFloat` para el `totalCost`). Entonces en `addPurchase` el cálculo del
   kardex hacía `stockBefore + item.quantity` → `18.5 + "3"` = `"18.53"` (concatenación) → `.toFixed` sobre un
   string → TypeError. La excepción cortaba `addPurchase` **antes** del `attemptMutation` y del toast.
3. **Bug latente descubierto**: aunque se arreglara el crash, `quantity`/`unitCost` viajaban como **string** en el
   body (`z.number()` de la ruta → 400) y la línea 2039 tenía el mismo patrón (`ins.currentStock + quantity`).
   También comprometía el contrato de la cola `ts_pending_queue_v2` para el replay de E4.
4. **Fixes aplicados (verificado: `tsc --noEmit` = 0 errores raíz+server · `npm run build` = 56 módulos OK):**
   - `src/components/PurchasesScreen.tsx` → `handleItemChange`: coercer a número `quantity` (`+value || 0`) y
     `unitCost` al guardar en estado (causa raíz de la UI).
   - `src/context/POSContext.tsx` → `addPurchase`: normalizar `items` (`Number(...)`) al construir
     `completedPurchase` → corrige las líneas 2000/2039 y garantiza que `queuePayload` (cola) y el body del
     `POST /purchases` lleven **números** (exigencia Zod de la ruta y contrato del replay E4).
   - `handleSavePurchase`: los 2 retornos silenciosos de validación ahora emiten **notification** visible
     ("Faltan datos del proveedor" / "Falta seleccionar insumos"), para que ningún fallo de validación quede invisible.
5. **Pendiente de la revisión de Compras (plan A+B+C)**: correr en la UI los 6 tests del flujo de compras
   (factura/caja, vale provisional, regularización, banco, crédito, error visible) y verificar en BD.
   `regularizePurchase` **sin `clientOpId`** sigue pendiente para el replay idempotente de E4.

**Sesión 2026-09-08 — fix "regularizar vale no propagaba el folio formal a Kardex/Caja" (migración `0003`)**
1. **Síntoma (reportado por el usuario)**: al regularizar un vale provisional, `compras` quedaba `regularizado` con
   la factura, pero `movimientos_kardex.referenceDoc` y `transacciones.descripcion` seguían mostrando
   `#PENDIENTE FACTURA`.
2. **Diagnóstico**: las filas de Kardex y del libro de caja se crean como **snapshots** (referencia al momento de
   la entrada de mercancía) y **no existía ningún vínculo** Kardex/Transacción → Compra: `KardexMovement` solo tenía
   `insumoId` y `Transaction` solo `orderId`; `regularizePurchase` solo actualizaba la cabecera `compras`.
   La expectativa del usuario es correcta: al formalizar el comprobante, la referencia SUNAT debe reflejarse en
   Kardex y Caja (guardando el vale como huella).
3. **Fix aplicado (schema + servicios + frontend), todo verificado:**
   - **Migración `0003_purchase_reference`** (sin BOM): columna nullable **`compra_id`** en `movimientos_kardex`
     y `transacciones` + FK `fk_<tabla>_compras` (NoAction/NoAction) + índices `ix_<tabla>_compra_id`.
   - **`purchase.service.ts`**: `createPurchase` ahora escribe `purchaseId` en cada movimiento kardex y en la
     transacción "Pago Proveedor" (caja y banco). `regularizePurchase` (dentro del mismo `$transaction`)
     propaga el folio formal: kardex → `Compra Factura #F00-… (<Proveedor>) [antes <VALE>]` y transacción
     → `Compra Factura #F00-… - <Proveedor> [antes <VALE>]` vía `updateMany` por `purchaseId`.
   - **`POSContext.regularizePurchase`**: tras el POST exitoso, `refreshKardex()` + `refreshTransactions()`
     para que la UI muestre la referencia nueva sin recargar.
   - **Verificación**: `prisma validate` OK · migración aplicada (columnas presentes) · `tsc --noEmit` = 0
     (raíz+server) · `npm run build` OK · **E2E API PASS**: vale provisional (kardex/tx con `#PENDIENTE FACTURA`
     y `compra_id` seteado) → `POST /regularize` → compra `regularizado` + kardex/tx con `#F00-TEST888 …
     [antes VALE-TEST01]`. Seed canónico restaurado después de la prueba.
4. **Nota**: filas históricas sin `compra_id` (vales creados antes de `0003`) no se actualizarían al regularizar
   → en demo basta el re-seed; en producción un backfill puntual SQL por coincidencia de referencia.
5. **Confirmación del usuario (2026-09-08)**: probado en la UI — "Quedó todo bien". Vale provisional →
   regularización → Kardex y Transacciones cambian al folio formal con `[antes VALE-XXX]` sin recargar.
   Quedan como **tests opcionales** (anotados en `progreso/planactual.md`): compra a crédito y error visible
   (409 al re-regularizar).

**Notas / pendientes de E**
- Fuera de alcance E3: mutaciones de catálogos (mesas/productos/insumos/bancos/métodos/impresoras/recetas)
  siguen **locales** (mock); `addNewTable`, CRUD bancos, `saveRecipe`, `addInsumo`, impresoras = locales —
  pasar a API en fase posterior.
- `regularizePurchase` **sí** quedó conectado a `POST /purchases/:id/regularize` (limpieza hecha en la
  sesión del 2026-09-06).
- `pendingSyncCount` ahora refleja `queueCount()` real (`ts_pending_queue_v2`).
- **E4 (cola offline)** = replay real de la cola al reconectar; **Fase C** = ledger `ClientOp` deductivo.
- Aún sin commits de git (repo sigue sin `git init`).

### E4 — Replay automático de la cola offline (✔ realizado 2026-09-18)

> Alcance aprobado por el usuario: **solo E4** (sin deploy ni Fase C/D/F); endurecer idempotencia en
> `regularizePurchase` + `sendToKitchen`; replay automático al arrancar. Objetivo: dejar el modo offline
> operativo de extremo a extremo (encolar → reconectar → aplicar en BD una sola vez).

**Decisión clave tomada en sesión:** los **ítems** de una orden temporal **NO se encolan** en E4. En su
lugar, el payload de `openOrder`/`quickOrder` guarda `tmpOrderId` (y `tmpTableId` para la barra); al
replay, el dispatcher crea la orden real, **refluye los ítems desde el estado local** (`orders[tmpOrderId]`)
hacia el server y migra la orden/mesa a los ids reales. Esto evita doble deducción de Kardex y
duplicados de ítems con payloads no idempotentes.

**Semántica del dispatcher** (`src/lib/replayQueue.ts`, `replayCall(op, payload)`):
- `ok` → quitar de la cola.
- `already` (409 `ALREADY_REGULARIZED`/`ALREADY_PAID`) → quitar en silencio (la op ya se aplicó).
- `gone` (404 en ops que no son create, p.ej. la orden se liberó) → quitar (no aplicar).
- `business` (otros 4xx) → quitar + aviso.
- `retry` (401 / red caída status 0 / 5xx) → **conservar y detener** el loop; `network=true` = solo
  cuando es una caída real de red (status 0) para no marcar "Sin Internet" por un 5xx del server.
- Mapa `op → {method, path, body}` para las 14 ops: `openOrder`, `quickOrder`, `addItem`,
  `updateItemQuantity`, `updateItemNotes`, `removeItem`, `sendToKitchen`, `markForBilling`, `payOrder`,
  `manualTransaction`, `createPurchase`, `regularizePurchase`, `switchShift`, `kardexAdjustment`.

**Backend (compila ✔ con `npm run build`)**
- `order.service.ts` — `sendToKitchen(orderId, input?: {clientOpId?})`: dedup por
  `kardexMovement.findFirst({where:{clientOpId}})` → si ya existía devuelve `{order, kardexMovements:0,
  replayed:true}` sin deducir stock dos veces; los movimientos usan `input?.clientOpId ?? randomUUID()`.
- `purchase.service.ts` — `regularizePurchase` acepta `clientOpId?: string` (SE MANTIENE el 409
  `ALREADY_REGULARIZED`: el dispatcher lo traduce a `already` y lo aplica una sola vez).
- `operations.routes.ts` — zod `clientOpId?` en `POST /orders/:id/send-to-kitchen` y `POST /purchases/:id/regularize`.

**Frontend (`src/context/POSContext.tsx` + `src/lib/replayQueue.ts`)**
- `replayOfflineQueue()`: loop FIFO con mapping `tmpToOrder`/`tmpToTable`, `deadTmpOrder`/`deadTmpTable`
  (mesa de barra/orden temporal abandonada al vaciarla → NO se crea orden fantasma, se dropea la apertura),
  `flushTmpItems()` (re-POST de ítems + GET refrescado) y `migrateTmpOrder()` (reemplaza `order-tmp-*`
  por la real en `orders`/`tables`/`selectedTableId`, limpia refs). `try/catch/finally` con
  `isReplayingRef` como mutex; al terminar dispara `loadOperations` + refreshes (kardex/insumos/transacciones/
  bancos/turnos) y notifica el resumen (sincronizada / omitidas / en cola).
- Guards cambiados a `(!id.startsWith('order-tmp-') || offlineState.isSimulatedOffline)`: ahora se encolan
  offline `sendToKitchen`, `proceedToPayment` y `completePayment` (pago) de órdenes temporales (antes el pago
  de una orden tmp offline se perdía). `payOrder` payload ahora incluye `tableId` + `tmpTableId` cuando aplica.
- Triggers del replay: `toggleSimulatedOffline` al volver online; `syncOfflineQueue` (botón "Forzar
  Sincronización", con info si está simulado); listeners `window.online/offline` (actualizan
  `isOnline` y reintentan al reconectar); efecto en montaje con sesión restaurada o tras login (cola no vacía).
- El guard de "modo offline simulado" vive en los **disparadores** y no dentro de `replayOfflineQueue` para
  que el toggle a online funcione aunque el estado React aún no se haya aplicado.

**Gap menor conocido (aceptado para esta v1):** si la red cae exactamente entre el `openOrder` del replay y
el flush de ítems, la orden real quedó creada sin ítems y el reintento re-crearía una segunda orden; el
`try/catch` evita el fallo sin manejar, marca `stuck` y no borra la cola. No se cerró con idempotencia
total en `openOrder` para no añadir complejidad en esta iteración.

**Verificación (todo ✔)**
- `npx tsc --noEmit` (raíz) = **0 errores** · `npm run build` (raíz y `server/`) = sin errores (solo el
  warning preexistente de chunk >500 kB).
- Smoke E2E sugerido para el cliente (ver `planactual.md`): ciclo offline completo → reconectar → `sqlcmd`
  para confirmar una sola aplicación en BD y cola vacía.

### E4-b — Preservación de órdenes/mesas temporales ante recarga con cola pendiente (✔ realizado 2026-09-18)

**Síntoma:** al recargar la página (F5) con la red ya recuperada y cola pendiente de sync, el auto-replay
creado en E4 veía la apertura de mesa offline como "abandonada" y la descartaba → el cobro se perdía.

**Causa raíz:** `loadOperations` (`setOrders`, reemplazo total por la verdad del server) y `loadCatalogs`
(`setTables`, idem) destruían del estado React las órdenes `order-tmp-*` y las mesas `t-express-*` que la
cola aún referenciaba. Al arrancar el replay, `orders[tmpOrderId]` ya no existía → `deadTmpOrder` dropeaba
la apertura sin crear la orden real.

**Fix aplicado**
- `src/lib/offlineQueue.ts` → **`getPendingTmpIds()`**: escanea `ts_pending_queue_v2` y devuelve los ids
  `order-tmp-*` / `t-express-*` presentes en los payloads (defensivo ante valores no string).
- `loadOperations` → al aplicar la verdad del server conserva del estado previo las órdenes tmp referenciadas.
- `loadCatalogs` (tables) → conserva las mesas `t-express-*` referenciadas y, para mesas reales cuyo
  `currentOrderId` local pertenece a la cola, re-aplica `ocupada` / `currentOrderId` / `waiter` sobre la
  versión del server (cubre el caso openOrder con mesa real + orden tmp).
- Limpieza menor: eliminado `didAutoReplayRef` (quedó como escritura sin lectura tras simplificar el trigger).
- El merge solo preserva lo que la cola referencia; entidades temporales huérfanas se descartan
  (semántica de mesa liberada). Tras el replay exitoso los ids cambian a reales y salen del merge.

**Script de verificación en BD (se conserva): `server/scripts/verify-sync.ts`**
- Ventana configurable (por defecto últimas 3h): lista órdenes, transacciones, compras, kardex, turnos
  cerrados, saldos de cuentas bancarias y stock de insumos, + **check de duplicados por `clientOpId`**.
- Uso: `npx tsx scripts/verify-sync.ts` (dentro de `server/`); conecta con el `.env` local (BD `TaytaSabroso`).
- Pensado para el smoke E2E: cruzar "una sola aplicación" de cada op encolada contra lo reportado en la UI.

**Verificación (todo ✔)**
- `npx tsc --noEmit` (raíz) = **0 errores** · `npm run build` (raíz y `server/`) = sin errores.
- `verify-sync.ts` corrido contra BD local: conecta OK, ventana limpia, cero duplicados.
- **Estado del smoke E2E:** pendiente de ejecutar por el usuario (2 fases en `planactual.md`: toggle y
  reload — la Fase II valida explícitamente este fix).

### Paso 1 — Fixes de estabilidad E1–E3 (✔ realizado 2026-10-12)

> Re-verificación de código + corrección de los 6 gaps del relevamiento antes del smoke.

1. **Gap #4 (alta)**: `addItemToOrder` fabricaba `order-<table>-...` → 404 garantizado.
   Ahora crea `order-tmp-*` y dispara el `openOrder` real con flush (igual que
   `selectAndOpenTable`), con rollback que libera la mesa si el server rechaza.
2. **Gap #2**: `sendToKitchen` sumó `rollback` (restaura items a `agregado`, revierte
   kardex/stock local y estado de mesa ante 4xx).
3. **Gap #3**: `completePayment` completó su rollback (quita tx optimista `tx-*`,
   orden a `por_cobrar`, cierra recibo, revierte bump de saldo).
4. **Gap #5 (análisis)**: `quantity:1` es el DELTA correcto (el server hace merge por
   producto+nota con `increment`); el flush de tmp sí envía cantidades acumuladas.
   Se dejó como está + comentario aclaratorio.
5. **Gap #6**: arqueo usa caja inicial del último `ShiftRecord` (fallback 350, igual que
   el server) y calcula `bankTransferSales` (antes hardcodeado 0). El server sigue
   siendo la verdad tras el refresh post-write.
- Verificación: `tsc --noEmit` 0 (raíz+server) · `npm run build` OK.

### E5 — Mutaciones de catálogos a API (✔ código + smoke API 2026-10-12)

> Las 11 funciones eran 100% locales (se perdían con F5). Ahora hacen write-through a
> `POST/PATCH/DELETE /catalogs/*` con reconcile del id real del server, rollback ante
> 4xx y replay offline en la cola (`entity:'catalog'`).

- **Tipos/cola**: `PendingOpEntity += 'catalog'` (`src/types.ts`); `getPendingCatalogTmpIds()` +
  `updateQueuedPayload()` en `src/lib/offlineQueue.ts` (editar un alta sin sincronizar
  parchea el create encolado; borrarla retira la op de la cola).
- **Dispatcher** (`src/lib/replayQueue.ts`): 19 ops de catálogos (create/update/delete de
  table, bankAccount, paymentMethod, printer, recipe, insumo + `saveRecipe` upsert con
  fallback PATCH→POST). `companyId 'ambas'` → `null`; `categoriesMapped` → `categories`.
- **Contexto** (`src/context/POSContext.tsx`): `tmpCatalogOpRef` (tempId→clientOpId);
  `loadCatalogs` preserva altas temporales referenciadas por la cola (extensión E4-b);
  el replay reconcilia altas (temp→id real, con fallback de ingredientes en recetas
  porque `PATCH /recipes` no devuelve `ingredients`) y converge catálogos si `stuck==0`.
- **Limitación conocida v1**: los endpoints de catálogos no aceptan `clientOpId`
  (sin idempotencia server); un fallo de red tras el POST podría duplicar al reintentar
  (mismo riesgo aceptado de `openOrder` en E4).
- **Smoke API `:4000` (todo PASS, filas de prueba eliminadas después)**:
  create table/bank/payment/printer/insumo/recipe → 201; GET lista el nuevo;
  PATCH table/bank/recipe → 200; DELETE ×6 → 200.
- **Tests Compras opcionales (PASS a nivel API)**: compra `Crédito 15 días` → creada sin
  transacción (tx el-tayta 7→7); re-regularizar → **409 `ALREADY_REGULARIZED`**
  ("La compra ya fue regularizada."). BD restaurada con `npx tsx prisma/seed.ts`;
  `verify-sync.ts` conecta OK, cero duplicados por `clientOpId`.
- **Commits**: `f8b9175` (E4/E4-b + verify-sync + docs db) · `3977804` (Paso 1 + E5).

**Pendiente**: smoke E2E offline en navegador (Paso 2 de `planactual.md`: ciclo offline →
reconectar → cola 0 + F5-con-cola E4-b + persistencia F5 de catálogos E5).

### Fase 1 — Reset total a seed demo (✔ realizado 2026-10-12)

> Limpieza para pruebas completas por fase, previa a la ruta Azure (Fase F).

- **Backup**: `BACKUP DATABASE [TaytaSabroso]` verificado en `msdb`
  (`/var/opt/mssql/backup/tayta_sabroso_20261012.bak`, `WITH INIT, COMPRESSION`).
- **Reset**: `npx tsx prisma/seed.ts` (borra las 23 tablas incl. `sessions`/`client_ops` y
  recrea el canónico).
- **Verificación**: `verify-sync.ts` OK (cero duplicados); catálogos por API 13/16/13/7/4/9/4;
  re-login PIN `1004` OK.
- ⚠️ **Hallazgo (bloqueador prod, no bloquea pruebas)**: `requireAuth`
  (`server/src/lib/auth.ts:33`) solo verifica firma JWT + usuario activo — **NO valida
  `sessions.tokenHash`**. El token viejo siguió con `/me` 200 tras borrar sesiones; el
  logout no revoca efectivamente el JWT hasta su expiración (12h). Endurecer en Fase F
  (chequear sesión en el middleware + `JWT_SECRET` real + `CORS_ORIGIN` restringido).

### Seed vacío para pruebas desde cero (✔ realizado 2026-10-12)

> El usuario pidió base realmente vacía (el seed demo trae 3 órdenes + 5 mesas ocupadas
> que confundían el inicio de pruebas).

- **Nuevo `server/prisma/seed-empty.ts`**: corre tras el seed canónico; vacía solo
  operaciones (`orderItem/order/purchaseItem/purchase/kardexMovement/transaction/
  shiftRecord/session/clientOp`), libera las 13 mesas y resetea `numberingSequence` a 0.
  No toca catálogos, stocks, saldos, turnos ni usuarios. Volver al demo:
  `npx tsx prisma/seed.ts`.
- **Verificación**: `verify-sync.ts` 0 órdenes/compras/tx/kardex/turnos + cero duplicados;
  API `orders/active` 0 en ambas empresas, tx/kardex 0, 13/13 mesas libres; saldos y
  stocks de apertura intactos; `tsc` server 0.
- **Reset post-pruebas (2026-10-12)**: tras las primeras pruebas del usuario (2 ventas
  cobradas + 41 kardex), re-ejecutado `seed.ts + seed-empty.ts` → base vacía verificada
  (0/0/0/0, cero duplicados).

### Fix cocina: UNIQUE en kardex por `clientOpId` compartido (✔ realizado 2026-10-12)

> Reportado por el usuario: "enviar a cocina no genera ninguna acción".
> Causa: E4 ponía UN solo `clientOpId` a todos los movimientos del despacho
> (`order.service.ts:493`) y esa columna es `UNIQUE` → con 2+ movimientos el `createMany`
> revertía todo (visible en el log como `uq_movimientos_kardex_id_operacion_cliente`).
> En la UI parecía no-op por el rollback + resync. Latente desde E4, primer despacho real
> que lo disparó.
- **Fix** (`server/src/services/order.service.ts` `sendToKitchen`): solo deduce ítems en
  `agregado` (cierra además una doble-deducción latente al pulsar cocina 2 veces); sin
  nada que deducir → no-op `replayed:true` (cubre el replay sin depender del `clientOpId`
  compartido); cada movimiento vuelve a su propio UUID. Compras ya usaba UUID por
  movimiento (a salvo).
- **Verificación API**: mesa t-04 → lomo+ceviche → cocina 200 con **11 movimientos** y
  stock 18.5→18.28 (una sola rebaja); 2.º despacho mismo `clientOpId` → 0 movs,
  `replayed:true`, stock intacto; borrado de ítems reversó cocina (18.5) y liberó la mesa.
  Orden de prueba vaciada por API; `tsc` server 0.

### 1.ª ronda de pruebas UI del usuario (2026-10-12, sobre base vacía)

- El usuario operó el ciclo real: **2 ventas cobradas** (tickets 1 y 3, mesa 01, con sus
  transacciones `Venta (Mesa)`) + despachos a cocina con sus movimientos kardex (41 movs
  en ventana, incl. devoluciones de pruebas de vaciado).
- En la ronda salió el bug de cocina UNIQUE (sección anterior) → fix verificado a nivel API;
  **refrendo del botón en UI pendiente en la 2.ª ronda**.
- Tras la ronda: reset a base vacía (`seed.ts + seed-empty.ts`, 0/0/0/0 verificado,
  commit `19d6d80`). Lección: el seed demo trae órdenes/mesas ocupadas a propósito y
  confundía el inicio → por eso existe `seed-empty.ts`.

### Apertura perezosa de mesa (✔ realizado 2026-10-15)

> Reportado por el usuario: entrar a una mesa libre la ponía `ocupada` aunque no se
> agregara ningún producto (y no había ningún timer de 1m: ese `1` era solo el
> `minutesElapsed: 1` inicial de display). La orden `abierto/total 0` quedaba en BD
> para siempre hasta vaciar/cobrar.

- **Fix (`src/context/POSContext.tsx`)**: `selectAndOpenTable` y `openQuickOrder` ahora
  solo seleccionan (mesa sigue `libre`, sin POST). La orden real se crea en
  `addItemToOrder` al primer producto — mesas normales vía `POST /orders/open`, mesas
  temporales de barra (`t-express-*`) vía `POST /orders/quick-bar` con migración a la
  mesa real. `OrderTakingScreen/PaymentScreen` ya soportaban orden nula.
- Al abandonar un tmp (quitar el único ítem antes del sync) se limpian
  `tmpOrderItemsRef` + cola para no flushear ítems rancios.
- **Verificación**: `tsc` 0 (raíz+server) · `build` OK · BD 0/0/0/0 tras limpiar el
  fantasma `ticket=1/mesa 01/abierto/0` detectado en la sesión.

### Fase D acotada — mesas/órdenes en vivo (✔ realizado 2026-10-15)

> Reportado por el usuario: con 2 navegadores contra la misma BD, el segundo no veía
> la mesa ocupada hasta F5. Causa: el front solo cargaba al login/`/me` (sin polling
> ni sockets).

- **Server**: `server/src/lib/realtime.ts` (nuevo) — Socket.io sobre el mismo `:4000`,
  auth JWT en handshake, rooms `company:el-tayta / el-sabroso` (`todas` = ambas).
  `notifyOrderState/notifyTableState` emiten `table:changed` + `order:changed` tras cada
  mutación (`operations.routes.ts`: open, quick-bar, items add/qty/notes/remove, cocina,
  por-cobrar, pay), best-effort. `server/src/index.ts` crea `httpServer` + `initRealtime`.
  Deps: `socket.io@4.8.1` (server), `socket.io-client@4.8.4` (front); proxy
  `/socket.io → :4000` en `vite.config.ts`.
- **Front**: `src/lib/realtime.ts` (nuevo, singleton) + integración en `POSContext.tsx`
  (`realtimeStatus`, handlers vía refs estables): merge de mesa sin pisar tmps offline,
  retiro de orden local al liberar, fetch por GET de órdenes nuevas/vistas; resync REST
  al reconectar; pausa en offline simulado/sin red; `logout` desconecta. `Header.tsx`:
  punto verde/ámbar de tiempo real en `btn-sync-status`.
- **Verificación**: `tsc` 0 + `build` OK (ambos) · smoke 2 sockets en `:4001`: B recibió
  `table:changed ocupada` al abrir A + aislamiento por empresa OK · BD restaurada a
  0/0/0/0 con `seed-empty.ts`.
- **Pendiente**: refrendo en UI con 2 navegadores (`dev:all`, PIN `1004`) + cocina/barra
  en vivo y catálogos en vivo (siguiente paso de Fase D).

### 2.º reset a base vacía (✔ realizado 2026-10-15)

- Tras apertura perezosa + smoke realtime (órdenes de prueba del harness): re-ejecutado
  `seed-empty.ts` → 0/0/0/0 + cero duplicados, 13/13 mesas libres, saldos/stocks intactos.

### Estandarización a 2 decimales en Fichas Técnicas (✔ realizado 2026-10-17)

> Pedido: solo dos decimales en creación/observación de fichas técnicas. Decisiones del
> usuario: (1) quantity/costPerUnit de ingredientes TAMBIÉN a 2 dec; (2) porcentajes
> (% FC de ficha) mostrados a 2 dec; (3) normalización defensiva en server + front.
> **Sin migración de BD**: la DB ya acota (money `Decimal(12,2)`); para ingredientes
> (`Decimal(12,4)`) se redondea ANTES de escribir → sin alterar esquema.

- **`src/lib/format.ts` (nuevo)**: helper `round2(n)` (`Math.round((n+EPSILON)*100)/100`) para el front.
- **`src/components/RecipesScreen.tsx`**:
  - Submit (`handleSaveRecipeSubmit`): ingredientes normalizados (`quantity`/`costPerUnit` → `parseFloat().toFixed(2)`, sub-total **recalculado** con valores ya redondeados), `salePrice` → 2 dec (elimina el quantity-string latente al construir la ficha).
  - `handleIngredientChange`: `costPerUnit` del insumo se copia a 2 dec.
  - Input cantidad: `min="0.01"` (antes 0.001, incoherente con step 0.01).
  - Visualización a 2 dec: badges/KPI `% FC` (`toFixed(1)`→`(2)`), `% del Costo` por ingrediente, cantidad en tabla BOM (`Number(ing.quantity).toFixed(2)`).
- **`src/context/POSContext.tsx` `saveRecipe`**: `serverBody` normaliza salePrice/totalCost/pct y por-ingrediente quantity/costPerUnit/subtotalCost vía `r2()`. El plato vinculado (local + `POST /catalogs/products`) usa `r2(recipe.salePrice)`. La cola offline viaja con valores ya redondeados (replay coherente).
- **`server/src/services/master.service.ts`**: `round2` (de `utils.ts`) en `createRecipe` (escalares + ingredientes), `updateRecipe` (escalares en el merge + ingredientes del createMany) y en `price` de `resolveRecipeProduct` (auto-creación del plato). Fix colateral de tipos: `preparationNotes?: string | null` en `createRecipe` (la sesión previa hizo nullable el Zod del POST pero no el typo del service — error preexistente del árbol sin commitear, capturado en `tsc`).
- **No tocado**: `round3` de kardex/despacho (`order.service.ts`, `deductIngredientsForOrder`), ratios analítica a 1 dec, Zod de `/recipes` (la normalización vive solo en el service), seed, mapeadores.
- **Verificación (todo ✔)**:
  - `npx tsc --noEmit` raíz + server = 0 · `npm run build` raíz + server OK.
  - Smoke API: `POST /recipes` con `qty 0.12501 / cost 8.33333 / sale 35.555` → BD (`ingredientes_receta`/`recetas`): `0.38 / 18.12 / 6.80`, `43.00 / 3.46 / 0.13`; producto auto-creado con `precio_venta 35.56`. `PATCH` (`42.995 / 3.45678 / 0.3755 / 18.1234`) → `43.00 / 3.46 / 0.38 / 18.12`. `GET /recipes` refleja 2 dec; luego DELETE de la ficha y el producto de prueba restantes → 200.

### Sesión 2026-10-18 — resumen consolidado (ver entradas detalladas abajo)

> Cinco mejoras entregadas en una sola sesión, todas sin migración de BD y con la base demo
> restaurada a vacío al final. Detalle completo en las subsecciones siguientes.

1. **Regla "no cobrar sin despacho de cocina"** — guard server `assertKitchenDispatched`
   (409 `PENDING_KITCHEN`) en `payTable` + `markTableForBilling`; modal híbrido de confirmación
   en `OrderTakingScreen`; la cola offline FIFO nunca dispara el guard por accidente.
2. **Caja (gaveta) vs Bancos sin doble imputación** — regla única `un movimiento toca la
   gaveta ⇔ bankAccountId == null` (`src/lib/finance.ts`); `saldoActual` cash-only + caja
   inicial vigente por empresa (`companyShiftCash`); arqueo (`shift.service`) y ReportsScreen
   alineados. La venta con banco ya no infla la gaveta.
3. **Ledger `operaciones_cliente` (Opción A, pasivo)** — `recordClientOp` upsert idempotente
   por `clientOpId` instrumenta las 35 mutaciones (14 `/operations` + 21 catálogos); los fallos
   también quedan escritos (`FALLO_*` + `ultimo_error`); lectura `GET /api/sync/client-ops`.
4. **Españolización del ledger + `resolveCompanyId`** — entidad/operacion/estado y las llaves
   del wrapper de `carga` 100% en español snake_case (`pedido/linea_pedido/...`,
   `APLICADO/FALLO_*`, `parametros/consulta/cuerpo`); lookup perezoso de `empresa_id`
   (orderId→`pedidos`, mesaId→`mesas`, catálogo concreto→su tabla) → 0 filas con empresa NULL
   incluso en fallos y líneas de item; UPDATE one-off tradujo las 8 filas históricas del
   usuario.
5. **Realtime Libro de Caja** — eventos `transaction:changed` + `shift:changed` emitidos desde
   `payTable`, transacción manual, compra (pago/regularización) y cambio de turno; la OTRA
   terminal refresca `transacciones/bancos/turnos` y alinea `companyShiftCash` SIN refrescar
   la página (smoke con 2 sockets: 12/12 PASS).

- **Estado de verificación al cierre**: `tsc --noEmit` + `npm run build` = 0/OK (raíz + server);
  smokes API 13/13 y 20/20 previos + realtime 12/12 · log del server sin advertencias
  `[oplog]` · `operaciones_cliente` activo, en español y con `empresa_id` completo · base demo
  restaurada a vacío (`seed.ts + seed-empty.ts`).

### Regla "no cobrar sin despacho de cocina" (✔ realizado 2026-10-18)

> Reportado por el usuario: pedido desde mesa → elegir producto → "Cobrar Mesa" directo (sin
> "Enviar a Cocina") → la venta se cobró y el Kardex NUNCA se descontó. Decisión del usuario:
> **híbrido con confirmación** (modal) + guard del server en **cobro y paso a por_cobrar**.

- **Server** (`order.service.ts`): helper `assertKitchenDispatched` — lanza `409 PENDING_KITCHEN`
  si hay ítems activos en `agregado` (nunca despachados = Kardex sin descontar). Aplicado en
  `payTable` (antes de calcular vuelto/abonar) y en `markTableForBilling` (a quien se le añadió
  `include: { items }` que no traía). `sendToKitchen` marca TODOS los ítems `en_cocina`
  (incl. productos sin receta), así que el criterio `agregado` nunca bloquea un flujo legítimo.
- **Front** (`POSContext.tsx`): `attemptMutation` ahora retorna `'ok' | 'queued' | 'rejected'`
  (retrocompatible); `sendToKitchen` → `Promise<boolean>` (true si ok/queued; false si 4xx/rollback;
  notificación de éxito solo si no fue rechazado); `proceedToPayment` detecta ítems `agregado`
  (lee por `ordersRef`/`tablesRef` + updater para evitar stale) → en vez de navegar, abre el
  estado `pendingKitchenConfirm {tableId, itemCount}`; nuevo `finishProceedToPayment` (navegación
  real al cobro sin pisar ítems despachados) + `confirmDispatchAndProceed` (despacha y, si
  `ok/queued`, continúa; si `rejected` se queda en comanda) + `dismissKitchenConfirm`.
- **UI** (`OrderTakingScreen.tsx`): modal "Ítems sin enviar a cocina — si cobras sin despachar los
  insumos NO se descontarán del Kardex. ¿Enviar a Cocina ahora y continuar al cobro?" con botones
  *"Enviar a Cocina y Cobrar"* / *"Cancelar"* (feedback `Enviando...` mientras espera el despacho).
- **Offline coherente**: la cola es FIFO (`sendToKitchen` encolado antes que `markForBilling`/
  `payOrder`) → el replay FIFO nunca dispara el guard; un `PENDING_KITCHEN` en replay caería en
  rama `business` → aviso y omisión (correcto). `replayQueue.ts` SIN cambios.
- **Verificación**: `tsc --noEmit` 0 (raíz+server) · `npm run build` OK (ambos) · smoke API 13/13
  PASS: open+item sin despacho → `pay` 409 PENDING_KITCHEN · `por-cobrar` 409 PENDING_KITCHEN ·
  `send-to-kitchen` 200 (6 movimientos) · `por-cobrar` 200 · `pay` 200 cobrado con ítems `servido`.
  BD verificada: 6 movimientos `SALIDA_VENTA_POS` (stock 18.5→18.06 lomo, etc.) + 1 transacción.
  Base restaurada a vacío (`seed.ts + seed-empty.ts`).

### Regla de cuenta: Caja (gaveta) vs Bancos, sin doble imputación (✔ realizado 2026-10-18)

> Reportado por el usuario: pagos con métodos vinculados a banco incrementaban el banco pero
> TAMBIÉN sumaban a "Efectivo en Caja" (tarjeta *Billetes y monedas en gaveta* del Libro de Caja).
> Decisiones del usuario: **(1)** el saldo de gaveta incluye la caja inicial del turno
> (`turnos_empresa.caja_inicial`); **(2)** corregir el arqueo de turnos en la misma pasada;
> **(3)** distribución por método del ReportsScreen alineada por cuenta real.
> **Regla única adoptada: un movimiento toca la gaveta ⇔ `bankAccountId == null`.**

- **Diagnóstico**: el `saldoActual` del front (`POSContext.tsx` memo) sumaba ingresos−egresos de
  TODAS las transacciones sin excluir las de banco → doble conteo. Mismo cálculo en
  `analytics.service.ts` (`reportsSummary.saldoActual`). El arqueo (`shift.service.ts:62`) restaba
  `totalExpenses` GLOBAL del efectivo esperado (compras pagadas desde banco "salían" de la gaveta).
  Detalle: `ShiftModal` restaba egresos `type==='Caja Chica'` AUNQUE tuvieran banco, y el
  ReportsScreen clasificaba "efectivo" por nombre (todo lo que no es 'Tarjeta'/'Yape / Plin').
- **Front**: nuevo `src/lib/finance.ts` con `isCashMovement`/`isBankMovement` (gaveta ⇔ sin
  `bankAccountId`); estado `companyShiftCash` (caja inicial vigente por empresa, cargado de los
  `companyShifts` del login/`/me` vía `mapCompanyShiftCash`, actualizado con `initialCashForNext`
  al cerrar turno) y expuesto en el contexto; **`saldoActual` = caja inicial + ingresos caja −
  egresos caja** (×2 si `todas`); `totalIngresos`/`totalEgresos` quedan como facturación general
  (subtítulos de tarjetas claros en `CashLedgerScreen`). Arqueo local (`switchCompanyShift`) y
  `ShiftModal`: `systemCashExpected = initialCash + cashSales − cashExpenses` (egresos cash-only);
  `ShiftModal` pre-llena el efectivo esperado al abrir (estados no muertos por montado permanente)
  y `bankTransferSales` = ingreso con banco que no es tarjeta/billetera/efectivo.
  `ReportsScreen`: distribución Efectivo (sin banco) / Cuentas Bancarias (con banco) / Digital
  (yape/plin sin banco) y usa `filteredTransactions` (respetaba empresa sin filtrar).
- **Server**: `shift.service.ts` — `cashExpenses` (sin banco) para `systemCashExpected`;
  `totalExpenses` del historial sigue siendo el operativo general; `bankTransferSales: 0 →` valor
  real. `analytics.service.ts` — `reportsSummary` ahora返回 `initialCash`, `cashIngresos`,
  `cashEgresos` y `saldoActual` cash-only + caja inicial → cuadra con el front.
- **Verificación**: `tsc --noEmit` 0 (raíz+server) · `npm run build` OK (ambos) · **smoke API
  20/20 PASS** (base vacía): saldo inicial 350 → venta efectivo T1 → gaveta 350+T1, banco intacto →

  venta banco T2 → banco +T2, gaveta intacta (403.10) · compra desde banco → banco −compra,
  gaveta intacta · `totalIngresos` = T1+T2 (facturación) · switch turno con `reportedCash =
  expected` → `systemCashExpected` 403.10, diferencia 0, `bankTransferSales` = T2 · caja nueva
  200 propagada al summary (saldo 200+T1). Libro de Caja verificado: tx de banco
  `bankAccountId+alias`, tx de efectivo sin banco. Base restaurada a vacío.

### Ledger de operaciones: `operaciones_cliente` activo (✔ realizado 2026-10-18)

> La tabla existía desde la Fase B pero NINGÚN runtime la escribía/leía. Decisión del usuario
> (oct-2026): **(1) Ledger pasivo — Opción A** (no el motor completo de sync de Fase C),
> **(2) incluir mutaciones de catálogos (E5)**, **(3) registrar también los fallos** (`FAILED_*`
> con `lastError`). La auditoría JAMÁS rompe la respuesta del API.

- **`server/src/lib/oplog.ts`** (nuevo): `recordClientOp(req, {entity, operation}, {status, result?, error?})` —
  upsert idempotente por `clientOpId` (UNIQUE): create con `APPLIED`/`FAILED_*`, `processedAt`
  y `attemptCount=1`; reenvío del MISMO id → `attemptCount++` + re-fija `processedAt` (sin
  duplicar fila). `deviceId` de `req.auth.deviceId`; `companyId` del body o del resultado
  (nullable si no está, p.ej. fallo en `/tables/:id/pay` que no lleva companyId); `payload` =
  JSON `{params, query, body}` truncado a 20k. `statusForError`: `FAILED_TERMINAL` (AppError
  4xx) / `FAILED_RETRYABLE` (resto). Todo en `try/catch` silencioso con `console.warn('[oplog]')`
  — la auditoría nunca tumba el flujo. `clientOpId` ausente (ítems, por-cobrar, catálogos
  PATCH/DELETE) → UUID one-off por request (queda firmado en la fila; SIN deduplicación de
  negocio — eso es Fase C). Zod NO-strict: acepta `clientOpId` de más sin cambios extra.
- **Instrumentación mecánica**: helper `oplog(req, entity, operation)` (2 líneas por handler:
  `const op = ...` FUERA del try (scope) + `op.ok(x)` tras el servicio y `op.fail(err)` en el
  catch). `operations.routes.ts`: las 14 mutaciones (open/quickBar/addItem/updateQuantity/
  updateNotes/removeItem/sendToKitchen/markForBilling/payTable/purchases/regularize/adjustments/
  shifts switch/transactions). `catalogs.routes.ts`: las 21 mutaciones POST/PATCH/DELETE
  (tables, products, insumos, recipes, bank-accounts, payment-methods, printers) con operation
  = nombre del servicio (createTable, updateRecipe, …). GETs sin ledger.
- **Lectura**: `server/src/routes/sync.routes.ts` (nuevo) montado en `/api/sync`:
  `GET /api/sync/client-ops?companyId&deviceId&entity&operation&status&since&limit&offset`
  (Bearer, zod, orderBy `creado_en desc`, `{items, total}` via cliente Prisma).
- **Verificación (todo ✔)**: `tsc --noEmit` 0 + `npm run build` OK (raíz+server) · smoke API
  13/13 PASS sobre base vacía (open+item+kitchen+pay dup+409 guard+compra+ajuste kardex+catálogo
  create/delete+transacción) → BD: **12 filas = 12 clientOpIds distintos**, todas `deviceId=dev-01`,
  payload ok · reenvío del pay con el mismo `op-pay-A1`: pay vuelve a 200 idempotente y la fila
  sube a `attemptCount=2` sin duplicar · cobro sin despacho → fila `FAILED_TERMINAL` con
  `lastError="Hay 1 ítem(s) sin enviar a cocina…"` · companyId de fallo en pay nullable
  (por diseño). `GET /api/sync/client-ops` filtros: status FAILED_TERMINAL → 1 (payTable),
  entity=order → 4, deviceId dev-01 → 12, dev-zz → 0, sin token → 401 · `processedAt` lleno
  en toda fila cerrada (bug de create corregido). Server log sin `[oplog]` warnings. Base
  restaurada a vacío (el seed vacío limpia la tabla).

#### Españolización del ledger + resolveCompanyId (✔ realizado 2026-10-18, misma sesión)

> Petición del usuario tras ver sus primeras filas reales en BD: todo el resto del sistema usa
> español → traducir TODO el contenido del ledger; además corregir la fila con `empresa_id = NULL`.
> Decisión de nomenclatura: **snake_case español** (como columnas BD y tipos kardex). Datos
> existentes: **UPDATE one-off** (8 filas de su sesión de prueba, no se perdieron).

- **Contenido 100% español** (`oplog.ts` + 35 declaraciones de rutas):
  - `entidad`: `pedido / linea_pedido / transaccion / compra / movimiento_kardex / turno` +
    catálogos con **entidad concreta** (no genérico): `mesa / producto / insumo / receta /
    cuenta_bancaria / metodo_pago / impresora`.
  - `operacion` (snake_case): `abrir_pedido, abrir_barra_rapida, agregar_item, actualizar_cantidad,
    actualizar_notas, quitar_item, enviar_cocina, marcar_por_cobrar, cobrar_mesa, crear_compra,
    regularizar_compra, ajustar_kardex, cambiar_turno, crear_transaccion` + crear_/actualizar_/
    eliminar_ × sujeto por catálogo (ejemplo `crear_mesa`, `actualizar_cuenta_bancaria`,
    `eliminar_impresora`).
  - `estado`: `PENDIENTE / EN_VUELO / APLICADO / FALLO_REINTENTABLE / FALLO_TERMINAL` — es
    `NVarChar(30)` String sin constraint → **sin migración de BD**. Comentario del schema.prisma
    actualizado al nuevo default ("PENDIENTE") para evitar drift futuro.
  - `carga`: wrapper re-key `{"parametros": …, "consulta": …, "cuerpo": …}` (el cuerpo del front
    queda intocado — contrato API intacto).
- **`resolveCompanyId` (enriquecimiento) — fin de los `empresa_id NULL`**: si ni body ni resultado
  traen empresa, lookup perezoso por parámetros de ruta: `linea_pedido` (y `enviar_cocina`) →
  orderId → `pedidos`; `cobrar_mesa/marcar_por_cobrar` → mesaId → `mesas`; catálogos concretos →
  tabla según entidad (map `CATALOGO_MODELO`). Solo consulta la BD cuando falta (happy path sin
  costo extra); fallo del lookup → warn + `NULL` explícito. A partir de este cambio ni el 409 de cocina ni
  las líneas de item pierden empresa.
- **Script one-off** (`migrate-oplog-es.ts`, ejecutado y BORRADO): tradujo las 8 filas de la
  sesión del usuario (entidad/operacion/estado + re-key de carga) y rellenó `empresa_id` por
  lookup. Lección: parsear `.parametros ?? .params` (idempotente) porque el lookup original usaba
  la key inglesa sobre el payload YA re-keyed → seguía NULL en `actualizar_notas` hasta re-run.
- **`sync.routes.ts`**: zod del filtro `status` con los 5 valores en español (value en inglés → 400).
- **Verificación (todo ✔)**: `tsc --noEmit` + `npm run build` OK (raíz+server) · smoke 13/13
  PASS en base vacía → **12 filas: entidad/operacion/estado/carga-keys en español, `empresa_id`
  lleno en 12/12** (incl. `FALLO_TERMINAL` de `cobrar_mesa` → el-sabroso y todas las
  `linea_pedido`), reenvío `numero_intentos=2` · filtros: FALLO_TERMINAL→1 (cobrar_mesa),
  entidad linea_pedido→2, mesa→2 (crear/eliminar), estado en inglés→400 · server log 0
  `[oplog]` warnings · base restaurada a vacío.

#### Boleta ANTES del pago + compartir voucher GRÁFICO por WhatsApp (✔ realizado 2026-10-18)

> Ajuste posterior del voucher: el usuario quiere que la boleta de la cuenta aparezca **ANTES**
> del pago (el cliente la revisa/imprime/comparte) y **luego** continuar a la pantalla de resumen
> de cuenta + método de cobro; además, en vez de enviar el voucher como texto, compartirlo en
> **modo gráfico** (él confirma: en su mac y en el cliente Windows tienen la app de WhatsApp
> Desktop). Decisiones user: (1) Ambas boletas — preview ANTES del pago + voucher "Pago
> Completado" DESPUÉS (con método/vuelto, para compartir); (2) camio por envío de texto: ahora
> SOLO gráfico (el deep-link wa.me solo envía texto; con imagen: PNG → portapapeles/se abre
> WhatsApp Desktop → pegar Cmd+V/Ctrl+V; en móvil usa la ventana nativa Compartir del SO con la
> imagen). Eliminado el campo de celular del cliente. Backend INTOCADO — frontend only.

- **Nuevo orden del flujo**: Cobrar Mesa (guad cocina intacto) → BOLETA preview
  (`PENDIENTE DE PAGO`) → botón "Continuar al pago" (cierra modal, queda en cobro) → Resumen
  + Métodos → cobrar → voucher "Pago Completado" → Volver a Mesas.
- **`src/lib/voucherImage.ts` (nuevo)**: render del voucher como PNG estilo rollo de 80mm
  (`TICKET_WIDTH=320`, fuente Courier, sin librerías nuevas — package igual):
  - `buildVoucherCanvas(order, header, isPaid)`: canvas dinamico con header empresa/RUC/slogan,
    "BOLETA ELECTRÓNICA #" (pagado) o "COMANDA / CUENTA PRE-VENTA" (preview), mesa/hora/atendido,
    ítems con cantidades/notas (wrap manual), Subtotal/IGV/TOTAL; si pagado + recibido/vuelto;
    si preview + "*** PENDIENTE DE PAGO ***"; caption final según modo.
  - `shareVoucherImage(...)` escalonado: (1) `navigator.share` con File (móvil: ventana
    nativa); (2) desktop: `clipboard.write(ClipboardItem image/png)` + abre `https://wa.me/?text=`
    con caption corta (limitación WhatsApp: el deep-link solo texto) — notificación "Imagen
    copiada: pégala en WhatsApp (Cmd+V / Ctrl+V)"; (3) fallback: descarga `boleta-<ticket>.png` +
    abre wa.me (adjuntar manual). "AbortError" en share = no notifica.
- **`POSContext.tsx`**: nuevo `receiptMode: 'preview' | 'paid'` (+ setter en interfaz y value);
  `finishProceedToPayment`: después de `setCurrentScreen('cobro')` → `setReceiptMode('preview')`
  + `setLastCompletedOrder({...currentOrder})` + abre modal (el write-through `markForBilling`
  sigue igual, offline incluido); `completePayment`: optimista y endpointOp éxito ambos
  `setReceiptMode('paid')` (el voucher post-pago sobrevive igual con re-apertura).
- **`ReceiptModal.tsx`**: un modal en dos modos: preview = título "Boleta de la Cuenta" + badge
  ámbar "Pendiente de pago", footer "Documento no válido como comprobante de pago", botones
  [Compartir WhatsApp]/[Imprimir]/[Continuar al pago →] (cerrar con X o continuar NO navega —
  el usuario ya está en cobro); paid = título "Pago Completado con Éxito", footer PAGO
  REGISTRADO, [Compartir]/[Imprimir]/[Volver a Mesas] (cerrar → mesas). Se elimina el botón
  de texto + campo de celular (reemplazados por el gráfico).
- **Verificación (✔)**: `tsc --noEmit` + `npm run build` = 0/OK (raíz; server sin cambios);
  smoke API 13/13 PASS (regresión backend); base restaurada a vacío.
- **QA manual pendiente del usuario** (checklist): Cobrar Mesa desde comanda → boleta preview
  "PENDIENTE DE PAGO" → Continuar al pago cae en cobro → voucher pagado con vuelto → Compartir
  → imagen copiada + WhatsApp Desktop abre → pegar Cmd+V · Imprimir en ambos modos muestra solo
  el voucher a 80mm · cobro sin despachar desde comanda → guard y rollback sin voucher ·
  offline: preview ok + voucher pagado local · El Sabroso con su marca/RUC.

---

#### Voucher siempre visible + compartir por WhatsApp + impresión de solo voucher (✔ realizado 2026-10-18)

> Pedido: al cobrar mesa se pasaba directo a la pantalla del voucher "método de pago" y el
> voucher (venta del ticket) ya no siempre aparecía; además quería el botón de compartir por
> WhatsApp en la pantalla del voucher. Decisiones del usuario: (1) el texto de WhatsApp lleva el
> **voucher completo** (ítems con notas, subtotal/IGV/total, vuelto); (2) el celular del cliente
> es un **campo opcional** (con número abre el chat directo, sin número abre selector de
> contacto). Backend INTOCADO — frontend only.

- **Diagnóstico del voucher** (`ReceiptModal.tsx` + POSContext):
  - El modal SÍ se abría optimistamente (`completePayment` 2661-2662) pero estaba montado
    DENTRO de `PaymentScreen` → si la pantalla cambiaba, el voucher moría con ella; y nada
    re-abría si algo lo cerraba antes de la confirmación del server.
  - Encabezado HARCODEADO "El Tayta POS / RUC 20601234567" → una venta de *El Sabroso* imprimía
    marca errada.
  - `window.print()` imprimía TODO el app: no existía `@media print` en ningún CSS.
  - Consolidado el "¿está todo bien con el proceso?": guard de cocina, idempotencia `clientOpId`, cola
    offline, realtime caja/bancos y rollback del 409 — SANOS; sin toques de negocio.
- **Voucher SIEMPRE**:
  - `ReceiptModal` montado a nivel raíz en `App.tsx` (junto a ShiftModal/PrinterTest/Offline) y
    quitado de `PaymentScreen` → sobrevive a cambios de pantalla.
  - `completePayment.endpointOp` (éxito server): re-afirma `setIsReceiptModalOpen(true)` tras
    `setLastCompletedOrder(serverOrder)` (belt & suspenders; el server reemplaza los datos
    locales con los reales: ticket/cerrado/servido).
  - Offline/encolado mantiene el voucher con datos locales; el replay al reconectar no lo
    interrumpe (path probado en E4: no toca `lastCompletedOrder`).
- **Encabezado por empresa**: `companyHeader` memo desde `companies` del contexto (tradeName +
  RUC del seed: el-tayta 20601234567 / el-sabroso 20609876543) con fallback por companyId —
  eslogan conservado vía mapa estático.
- **Compartir por WhatsApp** (`ReceiptModal.tsx`):
  - `WhatsAppIcon` SVG inline (Material Symbols no trae el ícono).
  - Campo opcional de celular (`type="tel"`, se normalizan solo dígitos) + botón verde
    **Compartir por WhatsApp** full-width sobre Imprimir/Volver.
  - `whatsappMessage` memo: mensaje completo = empresa, boleta #, mesa (zona), hora, atendido,
    ítems con cantidades/notas, subtotal/IGV/**TOTAL**, método de pago, recibido/vuelto,
    gracias. Abre `https://wa.me/{num}?text=` (o `https://wa.me/?text=`) en `_blank`
    noopener — PC (WhatsApp Web/Desktop) y móvil.
  - Al cerrar el modal se limpia el celular.
- **Impresión solo del voucher** (`src/index.css` `@media print`):
  - `@page size: 80mm auto` (rollo térmico) + `body * visibility:hidden` =
    `.receipt-print-target*` visible (clase añadida al papel junto al id `receipt-paper`),
    papel anclado top-left sin sombras/bordes, fondo blanco.
- **Verificación (todo ✔)**: `tsc --noEmit` + `npm run build` = 0/OK (raíz + server); smoke API
  oplog 13/13 PASS (regresión backend intacto); base restaurada a vacío.
- **QA manual pendiente del usuario** (checklist): cobro efectivo → voucher SIEMPRE visible
  aunque navegue entre pantallas · Imprimir → preview muestra solo el voucher a 80mm ·
  Compartir → wa.me con voucher completo (con y sin celular) · cobro sin despachar desde el
  mapa → rollback y ningún voucher falso · cobro offline → voucher queda y revive el replay ·
  venta de El Sabroso → su marca/RUC en la boleta.

---

#### Realtime Libro de Caja: `transaction:changed` + `shift:changed` (✔ realizado 2026-10-18)

> Reportado por el usuario: cobró una mesa con EFECTIVO en una computadora y el Libro de Caja de
> la otra PC no se reflejó hasta refrescar manualmente. Diagnóstico: la Fase D nunca emitió
> eventos para transacciones de caja, turnos ni saldos bancarios (solo mesas/órdenes/kardex/
> compras/catálogos) → el estado `transactions` del otro terminal solo se hidrataba en
> login/loadOperations. La pista "¿no estaba realizado?" era correcta: ESE bloque faltaba.

- **Server** (`realtime.ts`): nuevos `emitTransactionChanged` y `emitShiftChanged` (rooms por
  empresa, best-effort, "evento = aviso; la verdad en REST"). `TransactionChangedPayload` con
  `transactionId?` (opcional en regularización — varias filas re-etiquetadas), `amount`,
  `isIncome`, método, `bankAccountId/Alias`, `shift`, `tableNumber`. `ShiftChangedPayload` lleva
  `closedShift/newShift/initialCash/reportedCash/systemCashExpected/difference`.
- **Emisiones** (en los servicios, junto a los `emit*` ya existentes, DENTRO del callback de la
  `$transaction` — mismo patrón que `emitPurchaseChanged`):
  - `order.service.ts` `payTable`: venta de mesa/barra (caja O banco, una sola fuente).
  - `shift.service.ts` `createManualTransaction` (Caja Chica/Retiro/Ingreso/Ajuste manual) y
    `switchCompanyShift` (arqueo + nueva caja inicial del turno).
  - `purchase.service.ts` `createPurchase` (pago proveedor: gaveta O banco) y
    `regularizePurchase` (re-etiqueta las transacciones con la factura formal — aviso liviano).
  - Bandas viejas de saldo bancario SIN transacción no existen en el negocio (todo cambia banco
    a través de una fila); catálogos de banco no emiten (fuera de alcance).
- **Front** (`src/lib/realtime.ts`): tipos `TransactionChangedEvent`/`ShiftChangedEvent` +
  `socket.on(...)` + callbacks `onTransactionChanged/onShiftChanged` en `connectRealtime`.
- **Front** (`POSContext.tsx`): `transactionHandlerRef` → `Promise.all([refreshTransactions(),
  refreshBankAccounts()])`; `shiftRealtimeHandlerRef` → `refreshShiftRecords` +
  `refreshTransactions` + **`setCompanyShiftCash` con la nueva `initialCash`** (clave para que el
  arqueo hecho en OTRA PC no deje desfasada la gaveta local — `CashLedgerScreen` y el arqueo core
  de esa cifra). Ambos con el guard `isSimulatedOffline` estándar.
- **Smoke realtime automatizado (12/12 PASS)**: 2 sockets (terminal A y B, mismo PIN/room
  el-tayta) + REST desde "A": cobro mesa en Efectivo → A y B reciben `transaction:changed` con
  `paymentMethod='Efectivo'`, `bankAccountId=null`, `tableNumber` correcta; transacción manual →
  2º aviso en B; switch turno (reported 0, caja nueva 120) → `shift:changed` con
  `initialCash=120, closedShift='Día', newShift='Noche'`. El terminal B NUNCA refrescó manualmente
  y quedó sincronizada (todo fluyó por el evento, sin acciones del usuario).
- **Verificación**: `tsc --noEmit` + `npm run build` = 0/OK (raíz+server); 0 advertencias de
  ni `[oplog]` en server log · base restaurada a vacío.
- **Fuera de alcance**: mutaciones del catálogo de cuentas bancarias (el saldo vivo ya fluye por
  cada transacción que toca banco) y reportes históricos (solo lectura).

---

#### Fix duplicación de voucher al compartir por WhatsApp (✔ realizado 2026-10-19)

> Reporte: "al pegar en WhatsApp el voucher se copia dos veces". Diagnóstico con el usuario
> (Mac + WhatsApp Desktop, Chrome): (1) el portapapeles copiaba BIEN la imagen (Notes/TextEdit
> muestran 1 voucher — la escritura `clipboard.write` es única y correcta); (2) la duplicación
> era por **doble handoff**: en Chrome desktop `navigator.canShare({files})` es true →
> `navigator.share` entregaba el archivo a WhatsApp vía la hoja nativa y, si el share
> rechazaba (error ≠ `AbortError` tras abrir la hoja), el código caía al portapapeles + wa.me
> → voucher de la hoja + voucher pegado = 2 en el mismo chat; (3) además el caption de texto
> precargado en wa.me daba la impresión de "solo envía un mensaje" (o 2 burbujas al enviar
> imagen + caption). Backend INTOCADO — frontend only.

- **`src/lib/voucherImage.ts` — reestructurado con UN solo mecanismo por entorno**:
  - **Lock de reentrancia** (`shareInProgress`, module-level con `try/finally`): un solo
    share a la vez; descarta doble invocación del botón.
  - **`navigator.share` con archivo: SOLO táctil** (`window.matchMedia('(pointer: coarse)')`).
    En desktop ya NO se usa la hoja nativa (era la fuente del doble handoff).
  - **Fall-through controlado en táctil**: `AbortError` (usuario canceló) → return silencioso;
    cualquier otro error tras abrir la hoja → NO cae al portapapeles (pegaría un 2° voucher)
    → solo avisa "Revisa WhatsApp: el voucher pudo haberse adjuntado".
  - **Desktop**: `clipboard.write([ClipboardItem image/png])` 1 sola vez → avisa
    "Voucher copiado al portapapeles (1 vez). Pégalo en WhatsApp" → abre `https://wa.me/`
    **sin texto precargado** (`openWhatsAppApp()` sin caption; el boleta #/mesa/total ya viajan
    DENTRO del PNG) → 1 Cmd+V = 1 único contenido en el borrador.
  - **Notificaciones diferenciadas**: éxito de portapapeles vs "No se pudo copiar. Se descargó
    el voucher: adjúntalo manualmente" (fallback descarga `boleta-<ticket>.png` + wa.me vacío,
    solo si `clipboard.write`/ClipboardItem fallan de verdad).
- **`src/components/ReceiptModal.tsx`**: `handleShareWhatsApp` async con guard `isSharing`
  (deshabilita el botón mientras corre, opacity + cursor-wait) — segunda barrera anti doble click.
- **Sin cambios en**: `buildVoucherCanvas`/`buildLines` (render del PNG 80mm), los dos modos
  del modal (preview/paid), impresión `@media print`, POSContext, backend.
- **Verificación (✔)**: `npm run lint` (`tsc --noEmit`) = 0 errores · `npm run build` = OK
  (90 módulos).
- **QA pendiente del usuario** (checklist): Mac + WhatsApp Desktop → Compartir → abre
  borrador vacío → Cmd+V UNA vez → **1 solo voucher** (si aún se pegan 2 con un solo Cmd+V
  persiste el multi-sabor del portapapeles de Chromium → aplicar Plan B:
  `document.execCommand('copy')` sobre `<img>` oculto con data-URL); móvil → ventana nativa
  Compartir con la imagen; cancelar la ventana nativa → modal sigue usable; navegador sin
  ClipboardItem → descarga + wa.me.

---

### Consolidación P0 — commit + push + base vacía (✔ realizado 2026-10-20)

> Hallazgo al retomar: **todo el trabajo del 15–19 oct estaba SIN commitear** (~2.600 líneas
> en 30 archivos modificados + 7 archivos nuevos) y **8 commits sin pushear**. Riesgo real de
> perder el trabajo completo. Además `progreso/planactual.md` estaba borrado (migrado a
> `planpendiente.md`) y la BD tenía datos de prueba (4 pedidos / 4 tx / 10 kardex / 28 oplog).

- **Backup previo**: `BACKUP DATABASE [TaytaSabroso] TO DISK=... WITH INIT, COMPRESSION` →
  `tayta_sabroso_20261020.bak` (1.6 MB) copiado a `~/tayta_sabroso_backups/` (fuera del repo)
  y verificado con `RESTORE VERIFYONLY` → *"The backup set on file 1 is valid."*
  ⚠️ En Docker **no hay volumen montado**: hay que `mkdir -p /var/opt/mssql/backup` dentro
  del contenedor y luego `docker cp` al host. La ruta `/var/opt/mssql/backup` de la bitácora
  anterior era de la máquina Windows.
- **3 commits** (reparto por capa, sin staging parcial — `POSContext.tsx` mezclaba realtime +
  finance + cola + guard de cocina y `git add -p` sobre ese archivo es propenso a errores):
  | # | Hash | Alcance |
  |---|------|---------|
  | 1 | `2051a0c` | backend: `server/**` (socket.io, oplog, sync.routes, regla caja/bancos, guard cocina, round2) |
  | 2 | `5212c38` | frontend: `src/**` + `vite.config.ts` + `package.json` raíz (socket.io-client, proxy `/socket.io`) |
  | 3 | `5c45953` | docs: bitácora + `planactual.md` → `planpendiente.md` + `.gitignore` (`.claude/`) |
- **Push**: `4e5468e..5c45953` → `origin/main` (11 commits subidos, 0 pendientes).
- **`.claude/settings.json` NO se commitea**: tiene `ANTHROPIC_AUTH_TOKEN` local → se añadió
  `.claude/` a `.gitignore`. Recordatorio: los `.env` nunca están trackeados (`.env*` ignorado,
  solo `.env.example`); el password de `sa` no sale del repo.
- **Reset a base vacía**: `npx tsx prisma/seed.ts && npx tsx prisma/seed-empty.ts`.
- **Verificación (todo ✔)**: `tsc --noEmit` 0 (raíz) · `npm run build` OK (raíz y server) ·
  conteos = **0** en pedidos / detalle / transacciones / compras / kardex / turnos /
  `operaciones_cliente` / sesiones; **13/13 mesas libres**; catálogos intactos
  (2 empresas · 16 productos · 13 insumos · 7 recetas · 4 cuentas · 9 métodos · 4 impresoras) ·
  `verify-sync.ts` sin duplicados por `clientOpId` · smoke API: login PIN `1004` → 200,
  los 7 catálogos con los conteos esperados, las 5 operaciones de lectura en 0, oplog en 0.

---

## 10. Gotchas / Convenciones (leer antes de tocar código)

- **`toNum()` para Decimal**: toda aritmética con `currentStock`, `costPerUnit`, `price`,
  `quantity`, `total`, `amount`, etc. debe pasar por `toNum()` (los campos de BD son
  Prisma.Decimal). `plain()` para respuestas JSON.
- **`provider` no tocar**: schema = `sqlserver`; `migration_lock.toml` = `mssql`.
  Es un mismatch INTENCIONAL por versión de Prisma (ver bug #4).
- **Migraciones**: el archivo `migration.sql` debe guardarse SIN BOM UTF-8. Si una nueva
  migración falla con *"Incorrect syntax near '﻿'"*, es eso.
- **Idempotencia**: toda mutación que crea una factura/venta/compra/pago necesita
  identificación del cliente (`clientOpId`) ANTES de integrarse con el front.
- **Autenticación**: todos los endpoints excepto `/health` y `/api/auth/login` pasan por
  `requireAuth`. `req.auth.user` es el usuario DB, `req.auth.deviceId` la terminal.
- **Zod en cada input**: cualquier `req.body`/`query`/`params` se parsea con zod en la ruta;
  no confiar en tipos del front.
- **No romper la demo**: `src/` (raíz) NO se toca hasta la Fase E. El backend compila con
  `tsconfig.json` de `server/`.
- **Errores**: lanzar `AppError(msg, statusCode, code)` en servicios; deja pasar
  Prisma/Zod al `errorHandler` central.
- **Decimal en JSON**: nunca devolver el objeto raw de Prisma; pasar por `plain()`.
- **2 decimales en fichas técnicas**: al crear/editar una receta se redondea ANTES de
  escribir (front: `round2` de `src/lib/format.ts`; servidor: `round2` de `utils.ts` en
  `createRecipe`/`updateRecipe`/`resolveRecipeProduct`). NO requiere migración: la DB
  ya acota los campos monetarios (`Decimal(12,2)`); para `quantity`/`costPerUnit`
  (`Decimal(12,4)`) el redondeo a 2 ocurre en la app. NO tocar `round3` de kardex
  (deducción de despacho) ni los ratios analítica a 1 dec (fuera de alcance).

---

## 11. Estado de archivos clave (índice rápido)

| Archivo | Qué es |
|---------|--------|
| `server/prisma/schema.prisma` | 23 modelos (SQL Server) — con `@@map`/`@map` en español |
| `server/prisma/migrations/0001_init/migration.sql` | Migración inicial (sin BOM) |
| `server/prisma/migrations/0002_rename_spanish/migration.sql` | Españolización física (sp_rename, sin BOM) |
| `server/prisma/seed.ts` | Seed demo canónico |
| `server/prisma/seed-empty.ts` | Seed vacío (tras el canónico: 0 operaciones, 13 mesas libres, secuencias en 0) |
| `db/processes/` + `db/process-map.html` | DBML por proceso (01–09 + _all) y mapa visual de procesos |
| `db/gen-process-dbml.mjs` + `db/gen-process-map.mjs` | Generadores del DBML fragmentado y del mapa HTML |
| `src/lib/format.ts` | `round2()` para el front (estándar 2 decimales en fichas técnicas) |
| `src/lib/replayQueue.ts` | Dispatcher del replay offline (`replayCall`, 14 ops E4 + 19 E5) |
| `src/lib/realtime.ts` | Singleton socket.io-client mesas/órdenes (Fase D acotada) |
| `server/src/lib/realtime.ts` | Socket.io server: auth JWT, rooms por empresa, `notifyOrderState/notifyTableState` |
| `server/src/lib/utils.ts` | AppError, errorHandler (Zod/Prisma), round*, toNum, plain |
| `server/src/lib/auth.ts` | JWT + requireAuth/requireRoles |
| `server/src/lib/prisma.ts` | PrismaClient singleton (plano) |
| `server/src/services/*.service.ts` | Lógica de negocio |
| `server/src/routes/*.routes.ts` | Endpoints (Zod) |
| `server/src/app.ts` | Factory Express |
| `server/src/index.ts` | Bootstrap |
| `server/scripts/verify-sync.ts` | Verificación de sync en BD (ventana 3h; órdenes/tx/compras/kardex/turnos/cuentas/insumos + check duplicados `clientOpId`) — smoke E4 |
| `server/.env` | Conexión local SQL Server |
| `server/.env.example` | Plantillas Azure SQL para producción |
| `src/` (raíz) | Front React conectado a la API (E1–E5); `POSContext.tsx` = estado + write-through + replay |

> Nota: `src/data/initialData.ts` queda como fallback offline/demo cuando la API no responde.

---

## 12. Estado de acceso actual (qué toca SQL y qué no)

> Aclaración registrada `2026-09-05` para no confundir backend con la UI al retomar.

**✅ Sí conectado a SQL Server (backend en `:4000`)**
- La API usa la BD real `tayta_sabroso` (23 tablas + seed).
- El **login tester** de la landing (`http://localhost:4000/` → "Probar login") ya autentica
  contra la BD real: PIN `1004` / `TERM-CENTRAL-01` lee las 2 empresas y los turnos;
  un PIN erróneo devuelve `401`.

**🟢 Todo conectado a la BD desde la UI (frontend en `:3000`, desde E1–E5)**
- ✅ **Login/sesión real**: PIN `1004` autentica contra la API (`POST /api/auth/login` → SQL Server),
  token JWT guardado, sesión validada con `GET /api/auth/me` al recargar, logout revoca sesión.
- ✅ **Catálogos lectura** (desde E2): mesas, productos, insumos, recetas, cuentas bancarias, métodos de
  pago e impresoras se descargan con `GET /api/catalogs/*` (ambas empresas) al iniciar sesión; metadatos
  para delta-sync guardados en `ts_catalog_meta_v2`.
- ✅ **Catálogos escritura** (desde E5): altas/ediciones/bajas → `POST/PATCH/DELETE /catalogs/*`
  con reconcile de id real, rollback y replay offline (`entity:'catalog'`); F5 persiste.
- ✅ **Operaciones reales** (desde E3): con `clientOpId` idempotente — apertura y comanda rápida de órdenes,
  ítems (add/qty/nota/remove), envío a cocina (deducción Kardex), pago de mesa (`POST /tables/:id/pay`),
  transacciones manuales de Caja (`POST /transactions`), compras (`POST /purchases`), ajustes de Kardex
  (`POST /kardex/adjustments`) y arqueo de turnos (`POST /shifts/switch`). Fallos de red → cola local
  `ts_pending_queue_v2` (replay = E4).
- `regularizePurchase` conectado a `POST /purchases/:id/regularize` y propaga el folio formal a
  Kardex/Caja (migración `0003`, kardex/tx con `[antes <VALE>]`).

**Barrera para "usar el sistema de verdad" (operar sin internet)**
- **E4 (replay de la cola) ✅**: el POS encola ante fallas, reconecta y drena
  `ts_pending_queue_v2` con idempotencia por `clientOpId` (replay automático al reconectar, al arrancar con
  sesión o con el botón "Forzar Sincronización"). Falta **Fase C** (ledger `ClientOp` deductivo para
  conflictos multi-terminal).
- **Fase D (mesas/órdenes en vivo) ✅ acotada**: 2.º navegador ve `ocupada/libre` sin F5
  (rooms por empresa + resync al reconectar + punto en vivo en el Header). Pendiente:
  cocina/barra en vivo y catálogos en vivo.
- Repo con git (`main` + `origin/main`); verificar `git status` limpio antes de cada sesión.