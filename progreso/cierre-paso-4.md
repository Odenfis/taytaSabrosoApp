# Paso 4 — aceptación y preparación de entrega de roles

Cierre local: **2026-11-02**. La fase de roles queda implementada y validada en esta PC. No se ha actualizado al cliente ni se han modificado usuarios, ventas o migraciones de la base operativa durante este paso. La aceptación física del cliente sigue diferida por acuerdo.

## Evidencia ejecutada

| Comprobación | Resultado |
|---|---|
| Frontend `npm test` | 81/81 |
| Backend `npm test --prefix server` | 74/74, incluye 3 casos nuevos de preparación de roles |
| Pedidos SQL/API/realtime | 31 escenarios |
| Productos SQL | 13 escenarios |
| Insumos SQL/API/realtime | 18 escenarios |
| Gestión de usuarios SQL | PIN único concurrente, último administrador/global, sesiones, auditoría y claves: aprobado |
| HTTP por perfil | 112 combinaciones prohibidas + lecturas autorizadas y límites de empresa |
| Jornada en las dos empresas sintéticas | Sesiones reales Mesero/Cajero/Jefe; apertura, platos, despacho, por cobrar, cobro directo/dividido, reintento, auditoría, mesa libre, compra y cierre: aprobado |
| Chrome por perfil | Navegación, usuarios, revocación de clave, cambio de rol/empresa, caché y cuentas con autor ajeno: aprobado |
| Regresión offline | Reinicio completo tras apertura confirmada, resolución temporal sin duplicados, aislamiento por usuario/instalación y asunción administrativa: aprobado |
| Compilación y arranque | lint, build web, build servidor, smoke del backend compilado y git diff --check: aprobados |

Las suites de SQL usan bases aleatorias eliminadas al finalizar. Los errores de truncamiento de auditoría en sus logs se provocan deliberadamente para verificar rollback. Vite conserva su advertencia de tamaño de bundle; no bloquea la compilación. La ejecución inicial de tests HTTP dentro del sandbox falló por EPERM al abrir puertos; la ejecución con acceso a localhost pasó completa.

Se amplió `scripts/test-browser-roles.mjs` con una jornada HTTP con los perfiles reales en cada empresa de la fixture. Comprueba que caja suma una sola venta pese al reintento, que cada abono tiene auditoría del cajero y que los tickets por cuenta son distintos. Los casos de medios mixtos, corrección con PIN y pagos simultáneos siguen cubiertos por la suite SQL existente. No se presenta cada escenario SQL como una prueba visual.

## Actualización y respaldo

- Nueva prueba `npm run test:roles:migration --prefix server`: despliega hasta 0008 en una base temporal, crea usuarios/sesión, aplica 0009–0014 con migrate deploy, verifica preservación exacta de usuarios, hashes de PIN, empresas y sesiones; conserva Coordinador/Jefe de Cocina sin transformarlos. Repite deploy sin efectos adicionales.
- Esa prueba ejecuta también el informe compilado con `--check`: retorna código 2 ante los dos perfiles antiguos y no los reasigna.
- `npm run backup:verify --prefix server`: COPY_ONLY + CHECKSUM, VERIFYONLY, restauración real separada, CHECKDB antes/después y deploy sobre la copia. Compara por SHA-256 el contenido completo de las columnas previas de sus 31 tablas, sin imprimir los datos. Copia temporal eliminada; origen intacto.
- Respaldo SQL conservado en `/var/opt/mssql/data/tayta_backup_f3ddddb0e4924a73975cc1975d7da09c.bak`. Copia fuera del contenedor: `deploy/client/reports/roles-2026-11-02/respaldo-local.bak`, excluida de Git y con permisos locales restringidos. Su archivo `.sha256` permite comprobar integridad. Sigue estando en esta PC, no sustituye una copia externa para el cliente.
- Consulta de la base local: 14 migraciones, esquema actualizado; 1 administrador global activo, 0 perfiles por revisar, 0 conflictos de empresa y 0 empresas inexistentes. No se crearon cuentas de prueba en la base operativa.

## Preparación de entrega

- Informe de roles extendido con administrador global, empresas inexistentes y `readyForActivation`. `--check` da código 2 cuando requiere intervención; `--report=` escribe un archivo nuevo sin sobrescribir. No modifica usuarios y omite PIN/hashes/tokens.
- `actualizar-cliente.bat` ejecuta ese control antes de detener la aplicación. La CLI subyacente se probó compilada con SQL; el archivo Windows no se ejecutó en esta Mac.
- Procedimiento y guía por perfil en `deploy/client/ROLES.md`: sincronización de cada terminal, roles antiguos, respaldo, actualización, aceptación y recuperación sin perder ventas posteriores al respaldo.
- Se corrigió la referencia antigua a Coordinador en el manual; el permiso de crear mesas corresponde a administrador/jefe.

## Repetir la aceptación local

Desde la raíz, con SQL local disponible, dependencias y Chrome:

```sh
npm test
npm test --prefix server
npm run lint
npm run build
npm run build --prefix server
npm run test:orders:sql --prefix server -- --roles --browser-recovery
npm run test:users:sql --prefix server
npm run test:products:sql --prefix server
npm run test:insumos:sql --prefix server
npm run test:roles:migration --prefix server
npm run smoke:built --prefix server
npm run users:review-roles --prefix server -- --check
```

Para el respaldo, ejecutar desde `server` (dotenv debe leer su configuración): `npm run backup:verify`. El script de respaldo está limitado a SQL localhost y usa rutas del contenedor Linux; no debe usarse tal cual con SQL Windows del cliente. Para el ensayo de migraciones también usar `cd server` y `npm run test:roles:migration`, de modo que DATABASE_URL provenga de `server/.env`.

## Límites del cierre

Queda cerrado el desarrollo y la aceptación local de los cuatro pasos. Permanecen como aceptación de instalación, no como desarrollo pendiente: HTTPS confiable/WebCrypto en terminales reales, cola de cada navegador del cliente, usuarios/empresas reales del cliente, impresión física, red, ensayo Windows y actualización supervisada con respaldo propio reciente. Nada de esto se acredita usando solo esta PC. No se ha realizado despliegue ni facturación electrónica.
