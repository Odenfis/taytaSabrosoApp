# Facturación de prueba: implementación y verificación

Actualizado el 2026-11-04. **No habilitado para producción.** El sistema anterior debe continuar emitiendo los comprobantes reales.

## Implementado

- Perfil versionado por empresa: emisor, establecimiento, series de prueba, tasa y vigencia. Cálculo entero por línea y ejemplos anonimizados al 10,5 %. La tasa definitiva debe confirmarse con el contador.
- Migraciones `0015` y `0016`: documentos inmutables y datos fiscales previos al cobro. Numeración separada de tickets, bloqueo SQL por empresa, exclusión por origen y petición, auditoría transaccional.
- Cobro directo: guardar en línea tipo/receptor antes del cobro; preparar después de que el servidor confirme el pago. El guardado fiscal tiene botón explícito y no sustituye el botón de cobrar. No se cambia el contrato firmado de pagos offline.
- Tickets de cuentas saldadas y Libro de Caja: preparación, estado y descargas PDF/XML/CDR. Cada cuenta mantiene su documento independiente de la cantidad de abonos. El servidor comprueba el origen saldado; una confirmación optimista/offline no basta.
- Configuración → Preparación fiscal (prueba): perfil, preparación posterior al cobro, firma/validación, envío aislado, estados y conciliación manual auditada. El laboratorio lista los últimos 100 orígenes de cada clase y 200 documentos; la consulta por origen desde caja no depende de ese límite.
- XML UBL 2.1, firma RSA-SHA256 con clave/certificado coincidentes y vigentes, comprobación criptográfica local y XSD con esquemas OASIS originales incluidos. `xmllint --nonet` impide descargar dependencias durante la validación. Esto no implementa todas las reglas tributarias de SUNAT.
- Transporte SOAP/ZIP con endpoint beta fijo, credenciales públicas MODDATOS, tiempo y tamaño limitados, sin redirecciones. La CDR debe corresponder al número y RUC; se rechazan entidades XML, estructuras ambiguas y archivos inesperados. Se admite la carpeta vacía que entrega beta.
- El envío se reserva antes de contactar a SUNAT. Concurrencia/reintentos no duplican el envío. Timeout, respuesta no interpretable o reinicio dejan resultado incierto; no hay reenvío automático. Un envío de más de un minuto puede recuperarse a ese estado.
- Conciliación: un administrador puede importar la respuesta SOAP beta recuperada. Se conserva la CDR y se identifica el resultado como **conciliación manual de prueba** en respuesta y auditoría. No constituye validación de firma de una CDR de producción. No se pueden reemplazar resultados definitivos por respuestas diferentes.
- Notas de prueba: crédito 07 causal 01 (anulación total) y débito 08 causal 02 (aumento), vinculadas a un documento beta aceptado; numeración independiente, firma/XSD, auditoría y reintentos. Solo una nota por documento original en esta etapa. No modifican la venta ni caja. Se validan códigos e importes del subconjunto soportado, sin afirmar cobertura tributaria completa.
- Solicitud administrativa de revisión de baja: conserva motivo y responsable con auditoría e idempotencia. Es una solicitud interna pendiente de reglas; no genera ni envía una baja a SUNAT.
- PDF fiscal: descarga, visor para impresión y compartir con alternativa de descarga desde el documento de venta o cuenta.
- XML firmado y CDR se almacenan en SQL; PDF se regenera desde el snapshot. Las anulaciones fiscales siguen bloqueadas: ninguna ruta de este módulo borra una venta ni declara anulado un comprobante.

## Activación y aislamiento

Por defecto `FISCAL_TEST_ENABLED` está deshabilitado. Habilitarlo solo tras aplicar las migraciones en la instalación destinada a pruebas. Esta entrega no aplica migraciones a la base operativa ni al cliente.

Certificados exclusivos de prueba fuera del repositorio: `FISCAL_TEST_KEYS_DIR`, archivos `<companyId>.key.pem` y `<companyId>.cert.pem`. Nunca configurar certificados reales para estas pruebas.

El envío desde API exige además `FISCAL_BETA_SEND_ENABLED=true` y una base temporal con nombre `tayta_users_test_<32 caracteres hex>` o `tayta_fiscal_test_<32 caracteres hex>`. El emisor y receptor del snapshot deben estar identificados como PRUEBA. No existe opción de endpoint productivo.

Para el ensayo externo independiente, `server/scripts/test-fiscal-beta.ts` requiere `FISCAL_BETA_LIVE=true` y dos RUC separados por coma en `FISCAL_BETA_TEST_RUCS`. Genera cuatro documentos completamente ficticios; no lee ventas ni la base. Conserva XML/respuestas en una carpeta temporal y elimina la clave privada al terminar. No usar para carga ni repetición automática.

## Verificaciones realizadas

- Servidor: 83 pruebas unitarias/HTTP aprobadas. Frontend: 81 pruebas aprobadas; TypeScript y compilaciones aprobadas.
- `npm run test:fiscal:sql --prefix server`: migraciones desde cero en base efímera, empresa/versiones, datos previos al cobro, rollback de auditoría, snapshots, firma/XSD, cuentas saldadas, numeración concurrente, envío concurrente/reintento, respuesta perdida, recuperación de envío interrumpido y conciliación idempotente.
- `npm run test:fiscal:sql --prefix server -- --browser`: Chrome contra SQL temporal, laboratorio, temas claro/oscuro y ancho estrecho; cobro directo con datos conservados tras error de conexión, un solo pago en SQL y mesa liberada, preparación posterior, visor PDF, compartir con descarga alternativa y recuperación de documento de cuenta desde Libro de Caja. Se corrigió una carrera: el ticket consulta periódicamente la confirmación del cobro antes de habilitar la preparación fiscal; dispone también de actualización manual. No se ha probado una impresora física ni compartir nativo en teléfonos.
- Suite existente `test:orders:sql -- --roles`: 31 escenarios SQL/API/realtime y 151 rechazos por permisos; jornada en dos empresas, pagos directos/divididos, caja, usuarios, archivo, cambios de rol y protección de caché aprobados.
- `npm run backup:verify --prefix server`: respaldo local restaurado en base temporal, migraciones 0015/0016 sobre la copia, DBCC CHECKDB y contenido de 31 tablas conservado. **Base original sin migrar.** Respaldo en SQL Server: `/var/opt/mssql/data/tayta_backup_d460eef29493466db050f56043f75895.bak`.
- Imagen `tayta-sabroso:fiscal-test` construida con esquemas y `libxml2-utils`, sin reemplazar contenedores del cliente. Contenedor efímero sin red verificó un XML firmado con los XSD empaquetados.

## Resultado externo SUNAT beta — 3 de noviembre de 2026

Con productos, receptores, dirección y certificado ficticios, en las ejecuciones posteriores del 3 de noviembre se observaron estos resultados:

| RUC | Factura FT99-1 | Boleta BT99-1 | Crédito FC99-1 | Débito FD99-1 |
| --- | --- | --- | --- | --- |
| 20613333755 | Código 0 | Código 0 | Código 0 | Código 0 |
| 20606766972 | Código 0 | Código 0 | Código 0 | Código 0 |

El HTTP 401 de las boletas en la primera ejecución no se reprodujo; no se ha determinado su causa. La aceptación posterior sustituye el pendiente de obtener una CDR de boleta. No se enviaron ventas reales ni certificados del cliente. Estos números no reservan series productivas.

Las respuestas beta contienen marcadores de certificado/clave no disponibles. Se verificaron correspondencia de documento/RUC y código, **no una firma CDR válida de producción**. Los archivos se generaron en carpetas temporales (`tayta-beta-kG3kAX` y `tayta-beta-NquxJK`), que pueden desaparecer al reiniciar; no son un archivo fiscal duradero ni se incorporaron documentos personales al repositorio. Los resultados se observaron durante las ejecuciones, no se recrearon constancias.

Para ensayar notas con el script independiente se añade `FISCAL_BETA_NOTES=true`; la ejecución ordinaria genera facturas y boletas. No repetir envíos como prueba de carga.

## Pendientes y límites reales

1. Resúmenes de boletas y comunicaciones de baja: generación y envío aún no implementados. La descarga oficial de esquemas SUNAT devuelve HTTP 403 (verificado nuevamente el 4 de noviembre); los XSD OASIS validan los documentos UBL soportados pero no sustituyen los esquemas SUNAT específicos. El WSDL beta distingue `sendSummary` y consulta por ticket `getStatus`; no debe confundirse con el envío individual ya probado.
2. Confirmar con el contador las reglas aplicables y ampliar los casos de notas, descuentos, crédito y tributos cuando correspondan. Actualmente solo se soportan operaciones gravadas, cantidades enteras, PEN, unidades NIU y las dos causales de nota indicadas. La solicitud de revisión de baja no anula una venta ni un comprobante.
3. Validación de la representación con el contador y pruebas de impresora física/compartir nativo en las terminales reales. El visor PDF y la descarga alternativa sí se comprobaron en Chrome.
4. Antes de activar producción: SEE/OSE por RUC, tasa/vigencia/redondeo, descuentos/crédito, establecimiento, series/correlativos reales, certificado y usuario SOL secundario, reglas de contingencia y primera emisión supervisada. La aceptación beta no sustituye estos requisitos. Producción continúa bloqueada.

## Fuentes técnicas

- SUNAT, pautas beta: https://orientacion.sunat.gob.pe/12-pautas-servicio-beta
- SUNAT, guías/esquemas/reglas: https://cpe.sunat.gob.pe/guias-y-manuales
- OASIS UBL 2.1: https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip

La descarga de XSD desde SUNAT respondió HTTP 403; se incorporaron los esquemas oficiales de OASIS. Su fuente y SHA-256 del archivo original constan en `server/resources/ubl21/README.md`.
