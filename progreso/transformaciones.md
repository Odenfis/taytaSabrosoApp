# Transformaciones por porciones y registro de rendimiento

Actualizado el 14 de noviembre de 2026. Acceso: **Kardex & Stock → Transformaciones**, para administrador y jefe de restaurante, con una empresa seleccionada.

## Uso y conversión de fichas

1. Registrar la materia prima en kg/g o L/ml. Registrar cada resultado como un insumo con unidad **Porción**, inicialmente con stock cero cuando corresponda. No se convierte automáticamente la unidad de insumos existentes ni sus recetas.
2. En **Fichas**, indicar el consumo de referencia y, por resultado, número de porciones y equivalencia física por cada porción. Ejemplo: 10 kg → 40 porciones × 200 g = 8 kg útiles y 2 kg de merma prevista. Se admiten fracciones de porción. No se mezclan peso y volumen ni se consumen porciones como base.
3. Las fichas anteriores conservan sus datos e historial, pero deben convertirse explícitamente: indicar referencia, porciones y equivalencias y seleccionar nuevos insumos Porción cuando los anteriores usen otra unidad. No se infieren estos valores de porcentajes ni valores relativos. Las recetas antiguas mantienen sus referencias hasta editarlas.
4. En **Ejecutar**, indicar consumo. Se escalan las porciones propuestas, conservando la equivalencia de referencia. Se pueden corregir ambos valores. Cambiar consumo o ficha pide confirmación antes de reemplazar correcciones.
5. La merma automática se actualiza con los resultados. Si se edita, queda conservada y se muestra la diferencia de balance. **Restablecer merma calculada** vuelve al modo automático. No se confirma hasta que consumo = útiles equivalentes + merma; no se ajustan cantidades silenciosamente.
6. Revisar stock, rendimiento, costos y unidades antes de confirmar. La salida descuenta la base en su unidad y cada entrada incrementa Porción. Las recetas pueden consumir porciones fraccionarias; compras y ajustes mantienen coincidencia de unidades, sin conversión implícita a kg.
7. Consultar **Historial** para ver el detalle inmutable. Cada ejecución es un ingreso independiente, sin límite diario. Las ejecuciones confirmadas no tienen reversión ordinaria.

## Precisión y costos

Los valores admiten hasta cuatro decimales. Las propuestas de porciones se truncan a esa precisión. El total físico de cada resultado se convierte y redondea a cuatro decimales de la unidad base; el balance usa esos mismos totales mostrados. La aritmética fija compartida y Decimal en servidor evitan validaciones basadas en aproximaciones binarias. Un resultado positivo no puede equivaler a cero tras normalizar; debe existir al menos un resultado útil.

El costo consumido se distribuye por el peso/volumen útil equivalente, absorbiendo la merma. Se conserva el reparto determinista de céntimos y el costo total. El costo asignado dividido por las porciones reales determina el costo por porción; las existencias previas intervienen en el promedio ponderado. No se recalculan costos históricos.

## Persistencia y seguridad

- Contratos de ficha y ejecución versión 3. Las instantáneas antiguas permanecen intactas, sin inventar porciones ni equivalencias.
- Migración `0019_transformation_portions`: agrega `transformacion_rendimientos` y `transformacion_rendimiento_resultados`, vinculadas a la ejecución. Conserva empresa, ficha/versión/nombre, base y nombre, actor, fecha del servidor y fecha local de Lima, consumo, útiles, merma calculada/declarada, edición y rendimiento. Por resultado conserva nombre, porciones propuestas/reales, equivalencias de referencia/reales y costos.
- El historial muestra el nuevo detalle desde la instantánea. El cuadro consolidado y la exportación quedan para una entrega posterior; las tablas permiten agrupar por fecha de Lima, base y resultado.
- API `/api/transformations`: `inventory.read` para consultar, `inventory.manage` para modificar. Se conserva aislamiento por empresa, insumos activos, unidades, duplicados y versiones concurrentes.
- Stock, costos, Kardex, ejecución, rendimiento y auditoría se escriben en una transacción. Se conservan bloqueos por ficha y solicitud, y bloqueos ordenados de insumos.
- La huella de vista previa detecta cambios en ficha, unidades, stock o costos y exige recalcular. Desactivar o eliminar lógicamente una ficha invalida vistas previas sin borrar historial.
- Operación exclusivamente online. La solicitud pendiente conserva identidad, contenido y autor; reintentar o recuperar una respuesta perdida no duplica ingresos. Las solicitudes antiguas confirmadas son recuperables. Las incompatibles no confirmadas muestran conflicto y se resuelven mediante el flujo existente antes de preparar otra.

## Validación del 14 de noviembre

Aprobados lint/TypeScript y compilaciones frontend/servidor; 83 pruebas frontend, 90 servidor, 18 escenarios SQL/API/realtime de inventario y 33 de pedidos/cobros. La suite de Transformaciones en SQL temporal y Chrome comprueba:

- Lotes completos/fraccionarios, kg/g y L/ml, varias salidas, equivalencias corregidas, merma manual y balance inválido, stock insuficiente y redondeos.
- Costos por porción, conservación de céntimos, promedio previo, receta de 0,1255 porciones y consistencia con existencias/Kardex.
- Dos ingresos diarios independientes y persistencia de detalles; conversión de fichas antiguas sin alterar instantáneas; recuperación de solicitudes antiguas confirmadas.
- Permisos, aislamiento, eliminación lógica, concurrencia, idempotencia, respuesta perdida y rollback completo ante fallo de auditoría. Los errores `AUDIT TEST FAILURE` son deliberados.
- Flujo de creación, captura, cálculo, confirmación, recuperación e historial. Aviso antes de sustituir correcciones y restablecimiento de merma.
- Ambos temas en 1366 × 768, 1440 × 900, 1920 × 1080 y 390 × 844, sin desbordamiento horizontal de página. Capturas temporales `/tmp/portions-{light|dark}-{1366|1440|1920|390}.png`.

Para repetir: construir frontend y ejecutar desde `server`: `npm run test:transformations:sql -- --browser`. Requiere SQL Server y Chrome configurados. Las pruebas usan bases temporales que se eliminan al terminar.

## Migración y entrega

Antes de aplicar 0019 a desarrollo se creó un respaldo COPY_ONLY con CHECKSUM, se restauró en una base separada, se ejecutó CHECKDB, se ensayó la migración y se comparó el contenido de las 36 tablas existentes, sin diferencias. Respaldo retenido en SQL Server: `/var/opt/mssql/data/tayta_backup_2726156b876a430daddf8639a6957465.bak`.

0019 quedó aplicada a **desarrollo**; Prisma confirma las 19 migraciones al día. La instalación y base del cliente no se modificaron. Antes de actualizarla, identificar su versión y migraciones pendientes y seguir respaldo/restauración y aceptación supervisada. No usar `db push`, reiniciar datos ni copiar únicamente el frontend. La facturación permanece deshabilitada en la entrega de prueba.
