# Roles: actualización y aceptación

La fase local está validada; este procedimiento se ejecuta en una ventana supervisada cuando se autorice actualizar al cliente. Nunca ejecutar seed, db push ni migrate reset en una instalación con ventas.

## Antes de actualizar

1. Registrar versión/commit e ID de imagen actualmente operativa; conservar/exportar esa imagen antes de construir otra con la misma etiqueta. Conservar configuración y volúmenes de Caddy. La imagen anterior y el respaldo deben corresponder al mismo momento operativo.
2. En cada navegador, con su URL habitual, revisar y sincronizar la cola. Registrar terminal, autor, pendientes y resolución. Los pendientes sin firma verificable requieren conciliación; no borrarlos, inventar autor ni reinicializar el almacenamiento. Una consulta al servidor no acredita que todos los navegadores estén sincronizados.
3. Generar informe de usuarios con `npm run users:review-roles --prefix server -- --check`. En la imagen compilada: `node dist/scripts/report-user-roles.js --check`. `--report=/ruta/nueva.json` guarda el informe sin sobrescribir archivos. Código 0: usuarios aptos; 2: requieren revisión; 1: fallo de ejecución. Este informe comprueba perfiles y empresas, no disponibilidad de toda la instalación.
4. Exigir administrador global activo. Acordar expresamente equivalencias para Coordinador/Jefe de Cocina y empresas de cada persona; no asignar automáticamente privilegios. Resolver estos casos en una intervención supervisada antes de continuar; si la versión anterior no permite hacerlo, preparar la asignación con el administrador en un entorno de mantenimiento. No abrir el POS a ventas hasta que el informe pase.
5. Detener escrituras para obtener el respaldo final SQL con CHECKSUM. Restaurarlo en otra base, ejecutar CHECKDB y ensayar las migraciones sobre esa copia. Conservar además una copia del .bak fuera de la PC del servidor; VERIFYONLY por sí solo no acredita recuperación completa. Proteger el respaldo porque contiene datos y credenciales cifradas/hash.

## Actualización

El archivo `actualizar-cliente.bat` incorpora una comprobación de roles antes de detener app/web. No transforma usuarios. La conciliación de stock y la configuración de mesas son operaciones separadas y no se ejecutan durante esta actualización.

Con app/web detenidos, aplicar exclusivamente `prisma migrate deploy` y verificar `prisma migrate status`. Nunca ejecutar el inicializador de instalación nueva. Registrar commit, imagen, migraciones e informes. Iniciar y verificar `/health`, login y lectura SQL. Recargar cada terminal con la misma URL y revisar su cola antes de operar.

## Aceptación en el cliente (pendiente de visita)

- HTTPS válido y confiable en cada terminal; `window.isSecureContext` verdadero y WebCrypto disponible. Mantener URL, perfil y almacenamiento del navegador. No distribuir la clave privada de Caddy.
- En ambas empresas: mozo abre/edita cualquier mesa autorizada, despacha y marca por cobrar; cajera consulta sin editar, cobra directo/dividido, efectivo y medio bancario, registra caja y cierra turno; jefe administra catálogo, recetas, compras e inventario; administrador gestiona usuarios y autoriza corrección con PIN.
- Confirmar impresión física térmica y cocina, referencias/vuelto/tickets; mesa libre en dos terminales tras el último abono, sin liberarla por pagos parciales.
- Verificar prohibiciones, cambio de usuario sin datos anteriores, revocación de sesión y alcance por empresa.
- Corte de red y recuperación: conservar autor, revisar/asumir con administrador cuando proceda, reiniciar navegador tras apertura confirmada, sin duplicar orden ni pagos. No eliminar pendientes para aprobar la prueba.
- Registrar responsable, terminal, empresa, fecha y resultado por recorrido. Si hay un fallo de cobro, permisos o sincronización, detener el piloto y conservar evidencias.

## Recuperación

Si falla una migración o validación, mantener detenidas las ventas. Conservar logs, respaldo y colas; no aplicar scripts SQL inversos improvisados. Restaurar primero a otra base y verificar integridad. Para volver a la versión anterior, usar imagen/configuración y base compatibles del respaldo, y validar login/ventas antes de habilitar usuarios. Si ya hubo ventas después del respaldo, primero respaldar el estado actual y conciliar esas ventas y pendientes: restaurar el respaldo anterior directamente perdería operaciones. La restauración productiva requiere intervención supervisada; este procedimiento no la automatiza.

## Guía breve por perfil

| Perfil | Trabajo habitual | Límites |
|---|---|---|
| Administrador | Todo; usuarios y claves en Configuración → Seguridad | Gestión global requiere administrador sin restricción de empresa |
| Jefe de restaurante | Pedidos, cobros, caja, productos, recetas, compras, stock y mesas físicas | Sin bancos, rentabilidad global ni usuarios |
| Cajero (cajera) | Consultar pedido, cobrar, movimientos de caja y cierre | Sin editar pedido/catálogo/stock; corrección exige PIN administrativo |
| Mesero (mozo) | Cualquier mesa de su empresa, pedidos, cocina y marcar por cobrar | Sin cobros, caja ni cifras financieras; ve precios y total del pedido |

Cambios de perfil, empresa, PIN o estado cierran las sesiones afectadas. Las operaciones offline preservan su autor: un cambio de usuario no autoriza su envío. Los tickets continúan siendo internos; esta fase no incorpora facturación electrónica.

## Archivo de usuarios

En Configuración → Usuarios, el administrador global puede seleccionar una cuenta y elegir **Archivar usuario**. Tras confirmar se cierra su acceso; las ventas, auditorías y operaciones offline permanecen. La vista **Archivados** permite buscar y restaurar. Para restaurar se requiere un PIN nuevo y único; la cuenta vuelve inactiva hasta revisar perfil y empresa y activarla explícitamente. La suspensión temporal continúa disponible mediante «Usuario activo».

Antes de archivar, revise las colas en las terminales conocidas. Si quedan operaciones firmadas, un administrador global puede revisarlas y asumirlas expresamente; las que no tengan autor verificable requieren conciliación. Archivar no elimina ni anonimiza datos históricos.
