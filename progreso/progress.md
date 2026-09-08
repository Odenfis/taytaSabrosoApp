# Progreso — Tayta & Sabroso POS (Producción)

> Bitácora de avance del proyecto. `2026-09-07` (fixes E3: auto-liberar mesa en BD + sincronización de estado de mesa).
> **Punto de retome: Fase E4 — replay automático de la cola offline (`ts_pending_queue_v2`) al reconectar.**
> Objetivo: transformar el demo React (SPA) en un sistema de producción:
> **SQL Server (Azure) + Express + offline-first + multi-empresa en una sola BD.**

---

## 1. Roadmap general

| Fase | Estado | Descripción |
|------|--------|-------------|
| **A** | ✅ Completada | Schema SQL Server (23 tablas), migración inicial, seed demo data |
| **B** | ✅ Completada | API Express + JWT + servicios de negocio (órdenes, compras, kardex, turnos, analítica) |
| **C** | 🔲 Pendiente | **Motor de sync offline** (endpoint `client_ops`, idempotencia, queue por terminal) |
| **D** | 🔲 Pendiente | **Socket.io** en tiempo real (empujar órdenes a cocina/barra, mesas en vivo) |
| **E** | 🚧 En curso | Frontend React → API. **E1 ✅ (auth + API client)** · **E2 ✅ (catálogos)** · **E3 ✅ (operaciones + clientOpId)** · **E4 cola offline (Pendiente)** |
| **F** | 🔲 Pendiente | Azure: SQL Server en la nube + deploy del backend (secretos reales) |

> Hasta **2026-09-05** no hay commits de git (el repo no es git todavía). Todo el código
> del `server/` es local. **Antes de continuar, considerar `git init`** para no perder avance.

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

## 8. Fase D — Socket.io (PRÓXIMA, después de C)

- Notificar a cocina/barra/caja cuando una orden se envía (`sendToKitchen`).
- Actualizar estado de mesas/órdenes en vivo entre terminales del mismo local.
- Rooms por `companyId` (o por local) para no mezclar empresas.
- Reconexión + re-sync del estado desde REST al conectar.

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

**Notas / pendientes de E**
- Fuera de alcance E3: mutaciones de catálogos (mesas/productos/insumos/bancos/métodos/impresoras/recetas)
  siguen **locales** (mock); `addNewTable`, CRUD bancos, `saveRecipe`, `addInsumo`, impresoras = locales —
  pasar a API en fase posterior.
- `regularizePurchase` **sí** quedó conectado a `POST /purchases/:id/regularize` (limpieza hecha en la
  sesión del 2026-09-06).
- `pendingSyncCount` ahora refleja `queueCount()` real (`ts_pending_queue_v2`).
- **E4 (cola offline)** = replay real de la cola al reconectar; **Fase C** = ledger `ClientOp` deductivo.
- Aún sin commits de git (repo sigue sin `git init`).

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

---

## 11. Estado de archivos clave (índice rápido)

| Archivo | Qué es |
|---------|--------|
| `server/prisma/schema.prisma` | 23 modelos (SQL Server) — con `@@map`/`@map` en español |
| `server/prisma/migrations/0001_init/migration.sql` | Migración inicial (sin BOM) |
| `server/prisma/migrations/0002_rename_spanish/migration.sql` | Españolización física (sp_rename, sin BOM) |
| `server/prisma/seed.ts` | Seed demo canónico |
| `server/src/lib/utils.ts` | AppError, errorHandler (Zod/Prisma), round*, toNum, plain |
| `server/src/lib/auth.ts` | JWT + requireAuth/requireRoles |
| `server/src/lib/prisma.ts` | PrismaClient singleton (plano) |
| `server/src/services/*.service.ts` | Lógica de negocio |
| `server/src/routes/*.routes.ts` | Endpoints (Zod) |
| `server/src/app.ts` | Factory Express |
| `server/src/index.ts` | Bootstrap |
| `server/.env` | Conexión local SQL Server |
| `server/.env.example` | Plantillas Azure SQL para producción |
| `src/` (raíz) | Front demo React — NO tocar (fase E) |

---

## 12. Estado de acceso actual (qué toca SQL y qué no)

> Aclaración registrada `2026-09-05` para no confundir backend con la UI al retomar.

**✅ Sí conectado a SQL Server (backend en `:4000`)**
- La API usa la BD real `tayta_sabroso` (23 tablas + seed).
- El **login tester** de la landing (`http://localhost:4000/` → "Probar login") ya autentica
  contra la BD real: PIN `1004` / `TERM-CENTRAL-01` lee las 2 empresas y los turnos;
  un PIN erróneo devuelve `401`.

**🔶 Parcialmente conectado a la BD desde la UI (frontend en `:3000`) — desde E1 (2026-09-06)**
- ✅ **Login/sesión real**: PIN `1004` autentica contra la API (`POST /api/auth/login` → SQL Server),
  token JWT guardado, sesión validada con `GET /api/auth/me` al recargar, logout revoca sesión.
- ✅ **Catálogos reales** (desde E2): mesas, productos, insumos, recetas, cuentas bancarias, métodos de
  pago e impresoras se descargan con `GET /api/catalogs/*` (ambas empresas) al iniciar sesión; metadatos
  para delta-sync guardados en `ts_catalog_meta_v2`.
- ✅ **Operaciones reales** (desde E3): con `clientOpId` idempotente — apertura y comanda rápida de órdenes,
  ítems (add/qty/nota/remove), envío a cocina (deducción Kardex), pago de mesa (`POST /tables/:id/pay`),
  transacciones manuales de Caja (`POST /transactions`), compras (`POST /purchases`), ajustes de Kardex
  (`POST /kardex/adjustments`) y arqueo de turnos (`POST /shifts/switch`). Fallos de red → cola local
  `ts_pending_queue_v2` (replay = E4).
- ❌ **Catálogos (mutaciones) y otros CRUD siguen en mock**: mesas nuevas, bancos, métodos de pago,
  insumos/recetas, impresoras y `regularizePurchase` aún no tocan la API (fase posterior a E3).

**Barrera para "usar el sistema de verdad" (operar sin internet)**
- E3 ya encola operaciones localmente ante fallas; falta **E4 (replay automático de la cola)** y luego la
  Fase C (sync completo) para offline-first robusto en 5+ terminales.
- Aún no hay commits de git; considerar `git init` para no perder avance.