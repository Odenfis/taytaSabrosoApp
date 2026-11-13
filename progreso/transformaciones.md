# Transformación y despiece de insumos

Implementado el 10 de noviembre de 2026. Acceso: **Kardex & Stock → Transformaciones**, para administrador y jefe de restaurante. Se debe seleccionar una empresa.

## Uso

1. Registrar el insumo comprado y los cortes o preparaciones como insumos normales, con su unidad correcta. Si un corte todavía no existe físicamente, crearlo con stock cero.
2. En **Fichas**, crear una ficha con un insumo base y resultados distintos. Definir el porcentaje esperado de cada resultado. La suma no puede superar el 100 %; la diferencia representa la merma prevista. Las fichas antiguas deben convertirse indicando porcentajes antes de ejecutarse. Las unidades admitidas son kg/g o L/ml, sin mezclar dimensiones.
3. En **Ejecutar**, seleccionar la ficha e indicar la cantidad consumida. Los resultados se proponen automáticamente y pueden corregirse según las cantidades reales. Un resultado puede tener cantidad cero si existe otro aprovechable.
4. Revisar merma, rendimiento, costo asignado, costo unitario obtenido y costo promedio final. Confirmar solo después de revisar: se descuentan las existencias del insumo base y se incorporan los resultados.
5. Consultar **Historial** para recuperar el detalle inmutable. Las recetas existentes pueden usar los insumos resultantes; su despacho consume el corte, no nuevamente la materia prima.

La merma absorbe costo dentro de los resultados útiles. El reparto usa la cantidad obtenida en unidades equivalentes, distribuye céntimos restantes de manera determinista y conserva el costo total consumido. El promedio ponderado considera las existencias previas. No cambia las compras ni recalcula retrospectivamente las recetas o las ejecuciones anteriores.

## Persistencia y seguridad

- Migraciones `0017_transformations` y `0018_transformation_template_delete`: fichas versionadas y eliminación lógica, ejecuciones con instantánea inmutable y vínculo opcional `transformacion_id` en kardex. Conserva todos los registros anteriores.
- API `/api/transformations`: lectura con `inventory.read`; fichas, vista previa y ejecución con `inventory.manage`. Empresa validada en servidor, incluidos insumos compartidos según las reglas actuales del inventario.
- Bloqueos transaccionales por ficha/solicitud y bloqueos ordenados de insumos. Stock, costos, movimientos y auditoría se confirman juntos. El actor y la terminal provienen de la sesión autenticada.
- La vista previa incluye una huella del estado. Si cambian ficha, unidades, existencias o costos, la confirmación exige recalcular.
- UUID de ejecución y huella del contenido permiten recuperar/reintentar sin duplicar. Un mismo identificador no puede reutilizarse con otro contenido o autor. Los movimientos de kardex tienen relación SQL con la ejecución.
- Solo online. No se añade una acción a la cola offline ni se acepta su replay. El navegador conserva la solicitud pendiente, separada por origen, usuario, terminal y empresa, antes de enviarla. Tras pérdida de respuesta se consulta el resultado; un recálculo conserva la identidad hasta confirmar.
- Las fichas pueden actualizarse, desactivarse o eliminarse lógicamente con auditoría, conservando su historial. Las ejecuciones no tienen rutas de modificación, borrado o reversión; una reversión futura necesita su propio proceso auditado.

## Validación realizada

`npm run test:transformations:sql --prefix server -- --browser` utiliza una base SQL desechable. Ejecutarlo desde `server` con `npm run test:transformations:sql -- --browser` asegura que dotenv cargue la configuración local. Requiere SQL Server accesible y Chrome en la ruta configurada por el proyecto. Construir primero el frontend (`npm run build`) para no probar un dist anterior.

Pruebas aprobadas:

- Migraciones completas, incluidas `0017` y `0018`, sobre SQL temporal.
- 4 kg, merma de 0,5 kg, costos 80/40, promedio con stock previo; kg/g y L/ml; resultado con cantidad cero e insumos compartidos.
- Stock insuficiente, rendimiento excesivo, resultados duplicados, insumo base repetido, dimensiones incompatibles, insumos eliminados y referencias de otra empresa.
- Fichas versionadas, conservación de instantáneas, reintento simultáneo de la misma solicitud, competencia entre dos solicitudes y conflicto de contenido/autor.
- Fallo SQL provocado al registrar auditoría: revierte ejecución, stock, kardex y cambios de ficha. Los errores `AUDIT TEST FAILURE` del log son deliberados.
- Receta con corte resultante: descuenta el corte sin volver a consumir la materia prima.
- HTTP: administrador/jefe autorizados; cajero/mozo rechazados en las seis rutas; aislamiento de empresa y rechazo del replay offline.
- Chrome: creación de ficha, cálculo, confirmación con respuesta perdida, recarga y recuperación sin duplicación, historial y detalle. Inspección de escritorio y capturas móviles de claro/oscuro sin desbordamiento horizontal. Ajustado el desplazamiento móvil para que el encabezado no reduzca el formulario a una franja.
- Regresión: 86 pruebas del servidor, 82 del frontend, TypeScript, ambas compilaciones y 33 escenarios existentes SQL/API/realtime de pedidos/cobros/inventario.

Logs y capturas locales temporales: `/tmp/tayta-transformations-sql.log`, `/tmp/tayta-transformations-regression.log`, `/tmp/tayta-transformations-unit.log`, `/tmp/tayta-transformations-web-unit.log`, `/tmp/tayta-transformations-desktop.png`, `/tmp/tayta-transformations-mobile-light.png`, `/tmp/tayta-transformations-mobile-dark.png`.

## Instalación

La migración está probada, **no aplicada a la base operativa ni a la instalación del cliente**. Para habilitar el módulo en una instalación hay que respaldar su base, desplegar las migraciones pendientes con el procedimiento habitual y regenerar/compilar el cliente Prisma y la aplicación. No basta copiar solo el frontend. No usar `db push` ni reiniciar datos. La comprobación final en las terminales del cliente corresponde al despliegue supervisado.
