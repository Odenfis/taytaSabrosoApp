BEGIN TRY

BEGIN TRAN;

-- ============ 1. TABLAS ============
IF OBJECT_ID(N'dbo.companies', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.empresas', N'U') IS NULL
    EXEC sp_rename N'companies', N'empresas';
IF OBJECT_ID(N'dbo.devices', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.dispositivos', N'U') IS NULL
    EXEC sp_rename N'devices', N'dispositivos';
IF OBJECT_ID(N'dbo.numbering_sequences', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.secuencias_numeracion', N'U') IS NULL
    EXEC sp_rename N'numbering_sequences', N'secuencias_numeracion';
IF OBJECT_ID(N'dbo.users', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.usuarios', N'U') IS NULL
    EXEC sp_rename N'users', N'usuarios';
IF OBJECT_ID(N'dbo.sessions', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.sesiones', N'U') IS NULL
    EXEC sp_rename N'sessions', N'sesiones';
IF OBJECT_ID(N'dbo.tables', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.mesas', N'U') IS NULL
    EXEC sp_rename N'tables', N'mesas';
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.productos', N'U') IS NULL
    EXEC sp_rename N'products', N'productos';
IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.pedidos', N'U') IS NULL
    EXEC sp_rename N'orders', N'pedidos';
IF OBJECT_ID(N'dbo.order_items', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.detalle_pedidos', N'U') IS NULL
    EXEC sp_rename N'order_items', N'detalle_pedidos';
IF OBJECT_ID(N'dbo.transactions', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.transacciones', N'U') IS NULL
    EXEC sp_rename N'transactions', N'transacciones';
IF OBJECT_ID(N'dbo.bank_accounts', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.cuentas_bancarias', N'U') IS NULL
    EXEC sp_rename N'bank_accounts', N'cuentas_bancarias';
IF OBJECT_ID(N'dbo.payment_methods', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.metodos_pago', N'U') IS NULL
    EXEC sp_rename N'payment_methods', N'metodos_pago';
IF OBJECT_ID(N'dbo.shift_records', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.registros_turno', N'U') IS NULL
    EXEC sp_rename N'shift_records', N'registros_turno';
IF OBJECT_ID(N'dbo.company_shifts', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.turnos_empresa', N'U') IS NULL
    EXEC sp_rename N'company_shifts', N'turnos_empresa';
IF OBJECT_ID(N'dbo.recipes', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.recetas', N'U') IS NULL
    EXEC sp_rename N'recipes', N'recetas';
IF OBJECT_ID(N'dbo.recipe_ingredients', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.ingredientes_receta', N'U') IS NULL
    EXEC sp_rename N'recipe_ingredients', N'ingredientes_receta';
IF OBJECT_ID(N'dbo.purchases', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.compras', N'U') IS NULL
    EXEC sp_rename N'purchases', N'compras';
IF OBJECT_ID(N'dbo.purchase_items', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.detalle_compras', N'U') IS NULL
    EXEC sp_rename N'purchase_items', N'detalle_compras';
IF OBJECT_ID(N'dbo.kardex_movements', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.movimientos_kardex', N'U') IS NULL
    EXEC sp_rename N'kardex_movements', N'movimientos_kardex';
IF OBJECT_ID(N'dbo.printers', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.impresoras', N'U') IS NULL
    EXEC sp_rename N'printers', N'impresoras';
IF OBJECT_ID(N'dbo.printer_categories', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.categorias_impresora', N'U') IS NULL
    EXEC sp_rename N'printer_categories', N'categorias_impresora';
IF OBJECT_ID(N'dbo.client_ops', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.operaciones_cliente', N'U') IS NULL
    EXEC sp_rename N'client_ops', N'operaciones_cliente';

-- ============ 2. COLUMNAS ============
IF COL_LENGTH(N'dbo.empresas', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'nombre') IS NULL
    EXEC sp_rename N'empresas.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'tradeName') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'nombre_comercial') IS NULL
    EXEC sp_rename N'empresas.tradeName', N'nombre_comercial', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'specialty') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'especialidad') IS NULL
    EXEC sp_rename N'empresas.specialty', N'especialidad', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'themeColor') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'color_tema') IS NULL
    EXEC sp_rename N'empresas.themeColor', N'color_tema', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'accentColor') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'color_acento') IS NULL
    EXEC sp_rename N'empresas.accentColor', N'color_acento', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'badgeText') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'texto_insignia') IS NULL
    EXEC sp_rename N'empresas.badgeText', N'texto_insignia', N'COLUMN';
IF COL_LENGTH(N'dbo.empresas', N'address') IS NOT NULL AND COL_LENGTH(N'dbo.empresas', N'direccion') IS NULL
    EXEC sp_rename N'empresas.address', N'direccion', N'COLUMN';
IF COL_LENGTH(N'dbo.dispositivos', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.dispositivos', N'empresa_id') IS NULL
    EXEC sp_rename N'dispositivos.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.dispositivos', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.dispositivos', N'nombre') IS NULL
    EXEC sp_rename N'dispositivos.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.dispositivos', N'terminalCode') IS NOT NULL AND COL_LENGTH(N'dbo.dispositivos', N'codigo_terminal') IS NULL
    EXEC sp_rename N'dispositivos.terminalCode', N'codigo_terminal', N'COLUMN';
IF COL_LENGTH(N'dbo.dispositivos', N'lastSeenAt') IS NOT NULL AND COL_LENGTH(N'dbo.dispositivos', N'ultima_vista_en') IS NULL
    EXEC sp_rename N'dispositivos.lastSeenAt', N'ultima_vista_en', N'COLUMN';
IF COL_LENGTH(N'dbo.dispositivos', N'isActive') IS NOT NULL AND COL_LENGTH(N'dbo.dispositivos', N'esta_activo') IS NULL
    EXEC sp_rename N'dispositivos.isActive', N'esta_activo', N'COLUMN';
IF COL_LENGTH(N'dbo.secuencias_numeracion', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.secuencias_numeracion', N'empresa_id') IS NULL
    EXEC sp_rename N'secuencias_numeracion.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.secuencias_numeracion', N'entity') IS NOT NULL AND COL_LENGTH(N'dbo.secuencias_numeracion', N'entidad') IS NULL
    EXEC sp_rename N'secuencias_numeracion.entity', N'entidad', N'COLUMN';
IF COL_LENGTH(N'dbo.secuencias_numeracion', N'lastNumber') IS NOT NULL AND COL_LENGTH(N'dbo.secuencias_numeracion', N'ultimo_numero') IS NULL
    EXEC sp_rename N'secuencias_numeracion.lastNumber', N'ultimo_numero', N'COLUMN';
IF COL_LENGTH(N'dbo.secuencias_numeracion', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.secuencias_numeracion', N'actualizado_en') IS NULL
    EXEC sp_rename N'secuencias_numeracion.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'empresa_id') IS NULL
    EXEC sp_rename N'usuarios.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'nombre') IS NULL
    EXEC sp_rename N'usuarios.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'pinHash') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'hash_pin') IS NULL
    EXEC sp_rename N'usuarios.pinHash', N'hash_pin', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'passwordHash') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'hash_contrasena') IS NULL
    EXEC sp_rename N'usuarios.passwordHash', N'hash_contrasena', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'role') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'rol') IS NULL
    EXEC sp_rename N'usuarios.role', N'rol', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'avatarUrl') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'url_avatar') IS NULL
    EXEC sp_rename N'usuarios.avatarUrl', N'url_avatar', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'assignedCompanyId') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'empresa_asignada_id') IS NULL
    EXEC sp_rename N'usuarios.assignedCompanyId', N'empresa_asignada_id', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'isActive') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'esta_activo') IS NULL
    EXEC sp_rename N'usuarios.isActive', N'esta_activo', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'esta_eliminado') IS NULL
    EXEC sp_rename N'usuarios.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'creado_en') IS NULL
    EXEC sp_rename N'usuarios.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.usuarios', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.usuarios', N'actualizado_en') IS NULL
    EXEC sp_rename N'usuarios.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.sesiones', N'userId') IS NOT NULL AND COL_LENGTH(N'dbo.sesiones', N'usuario_id') IS NULL
    EXEC sp_rename N'sesiones.userId', N'usuario_id', N'COLUMN';
IF COL_LENGTH(N'dbo.sesiones', N'deviceId') IS NOT NULL AND COL_LENGTH(N'dbo.sesiones', N'dispositivo_id') IS NULL
    EXEC sp_rename N'sesiones.deviceId', N'dispositivo_id', N'COLUMN';
IF COL_LENGTH(N'dbo.sesiones', N'tokenHash') IS NOT NULL AND COL_LENGTH(N'dbo.sesiones', N'hash_token') IS NULL
    EXEC sp_rename N'sesiones.tokenHash', N'hash_token', N'COLUMN';
IF COL_LENGTH(N'dbo.sesiones', N'expiresAt') IS NOT NULL AND COL_LENGTH(N'dbo.sesiones', N'expira_en') IS NULL
    EXEC sp_rename N'sesiones.expiresAt', N'expira_en', N'COLUMN';
IF COL_LENGTH(N'dbo.sesiones', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.sesiones', N'creado_en') IS NULL
    EXEC sp_rename N'sesiones.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'empresa_id') IS NULL
    EXEC sp_rename N'mesas.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'number') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'numero') IS NULL
    EXEC sp_rename N'mesas.number', N'numero', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'capacity') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'capacidad') IS NULL
    EXEC sp_rename N'mesas.capacity', N'capacidad', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'zone') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'zona') IS NULL
    EXEC sp_rename N'mesas.zone', N'zona', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'estado') IS NULL
    EXEC sp_rename N'mesas.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'occupiedSince') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'ocupada_desde') IS NULL
    EXEC sp_rename N'mesas.occupiedSince', N'ocupada_desde', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'minutesElapsed') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'minutos_transcurridos') IS NULL
    EXEC sp_rename N'mesas.minutesElapsed', N'minutos_transcurridos', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'currentOrderId') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'pedido_actual_id') IS NULL
    EXEC sp_rename N'mesas.currentOrderId', N'pedido_actual_id', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'waiter') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'mesero') IS NULL
    EXEC sp_rename N'mesas.waiter', N'mesero', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'notas') IS NULL
    EXEC sp_rename N'mesas.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'esta_eliminado') IS NULL
    EXEC sp_rename N'mesas.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'creado_en') IS NULL
    EXEC sp_rename N'mesas.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.mesas', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.mesas', N'actualizado_en') IS NULL
    EXEC sp_rename N'mesas.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'empresa_id') IS NULL
    EXEC sp_rename N'productos.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'nombre') IS NULL
    EXEC sp_rename N'productos.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'description') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'descripcion') IS NULL
    EXEC sp_rename N'productos.description', N'descripcion', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'price') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'precio') IS NULL
    EXEC sp_rename N'productos.price', N'precio', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'categoria') IS NULL
    EXEC sp_rename N'productos.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'image') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'imagen') IS NULL
    EXEC sp_rename N'productos.image', N'imagen', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'available') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'disponible') IS NULL
    EXEC sp_rename N'productos.available', N'disponible', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'hasRecipe') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'tiene_receta') IS NULL
    EXEC sp_rename N'productos.hasRecipe', N'tiene_receta', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'esta_eliminado') IS NULL
    EXEC sp_rename N'productos.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'creado_en') IS NULL
    EXEC sp_rename N'productos.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.productos', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.productos', N'actualizado_en') IS NULL
    EXEC sp_rename N'productos.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'empresa_id') IS NULL
    EXEC sp_rename N'pedidos.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'ticketNumber') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'numero_ticket') IS NULL
    EXEC sp_rename N'pedidos.ticketNumber', N'numero_ticket', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'tableId') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'mesa_id') IS NULL
    EXEC sp_rename N'pedidos.tableId', N'mesa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'tableNumber') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'numero_mesa') IS NULL
    EXEC sp_rename N'pedidos.tableNumber', N'numero_mesa', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'zone') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'zona') IS NULL
    EXEC sp_rename N'pedidos.zone', N'zona', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'waiter') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'mesero') IS NULL
    EXEC sp_rename N'pedidos.waiter', N'mesero', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'creado_en') IS NULL
    EXEC sp_rename N'pedidos.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'createdUtc') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'creado_utc') IS NULL
    EXEC sp_rename N'pedidos.createdUtc', N'creado_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'estado') IS NULL
    EXEC sp_rename N'pedidos.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'paymentMethod') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'metodo_pago') IS NULL
    EXEC sp_rename N'pedidos.paymentMethod', N'metodo_pago', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'amountReceived') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'monto_recibido') IS NULL
    EXEC sp_rename N'pedidos.amountReceived', N'monto_recibido', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'change') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'vuelto') IS NULL
    EXEC sp_rename N'pedidos.change', N'vuelto', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'closedAt') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'cerrado_en') IS NULL
    EXEC sp_rename N'pedidos.closedAt', N'cerrado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'closedUtc') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'cerrado_utc') IS NULL
    EXEC sp_rename N'pedidos.closedUtc', N'cerrado_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'clientOpId') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'id_operacion_cliente') IS NULL
    EXEC sp_rename N'pedidos.clientOpId', N'id_operacion_cliente', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'esta_eliminado') IS NULL
    EXEC sp_rename N'pedidos.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.pedidos', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.pedidos', N'actualizado_en') IS NULL
    EXEC sp_rename N'pedidos.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'orderId') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'pedido_id') IS NULL
    EXEC sp_rename N'detalle_pedidos.orderId', N'pedido_id', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'productId') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'producto_id') IS NULL
    EXEC sp_rename N'detalle_pedidos.productId', N'producto_id', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'nombre') IS NULL
    EXEC sp_rename N'detalle_pedidos.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'price') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'precio') IS NULL
    EXEC sp_rename N'detalle_pedidos.price', N'precio', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'quantity') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'cantidad') IS NULL
    EXEC sp_rename N'detalle_pedidos.quantity', N'cantidad', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'notas') IS NULL
    EXEC sp_rename N'detalle_pedidos.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'estado') IS NULL
    EXEC sp_rename N'detalle_pedidos.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_pedidos', N'addedAt') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_pedidos', N'agregado_en') IS NULL
    EXEC sp_rename N'detalle_pedidos.addedAt', N'agregado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'empresa_id') IS NULL
    EXEC sp_rename N'transacciones.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'time') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'hora') IS NULL
    EXEC sp_rename N'transacciones.time', N'hora', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'date') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'fecha') IS NULL
    EXEC sp_rename N'transacciones.date', N'fecha', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'timestamp') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'marca_tiempo') IS NULL
    EXEC sp_rename N'transacciones.timestamp', N'marca_tiempo', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'type') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'tipo') IS NULL
    EXEC sp_rename N'transacciones.type', N'tipo', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'description') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'descripcion') IS NULL
    EXEC sp_rename N'transacciones.description', N'descripcion', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'amount') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'monto') IS NULL
    EXEC sp_rename N'transacciones.amount', N'monto', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'isIncome') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'es_ingreso') IS NULL
    EXEC sp_rename N'transacciones.isIncome', N'es_ingreso', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'paymentMethod') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'metodo_pago') IS NULL
    EXEC sp_rename N'transacciones.paymentMethod', N'metodo_pago', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'customPaymentMethodId') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'metodo_pago_personalizado_id') IS NULL
    EXEC sp_rename N'transacciones.customPaymentMethodId', N'metodo_pago_personalizado_id', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'bankAccountId') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'cuenta_bancaria_id') IS NULL
    EXEC sp_rename N'transacciones.bankAccountId', N'cuenta_bancaria_id', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'bankAccountAlias') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'alias_cuenta_bancaria') IS NULL
    EXEC sp_rename N'transacciones.bankAccountAlias', N'alias_cuenta_bancaria', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'shift') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'turno') IS NULL
    EXEC sp_rename N'transacciones.shift', N'turno', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'referenceNumber') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'numero_referencia') IS NULL
    EXEC sp_rename N'transacciones.referenceNumber', N'numero_referencia', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'tableNumber') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'numero_mesa') IS NULL
    EXEC sp_rename N'transacciones.tableNumber', N'numero_mesa', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'orderId') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'pedido_id') IS NULL
    EXEC sp_rename N'transacciones.orderId', N'pedido_id', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'ticketNumber') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'numero_ticket') IS NULL
    EXEC sp_rename N'transacciones.ticketNumber', N'numero_ticket', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'clientOpId') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'id_operacion_cliente') IS NULL
    EXEC sp_rename N'transacciones.clientOpId', N'id_operacion_cliente', N'COLUMN';
IF COL_LENGTH(N'dbo.transacciones', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.transacciones', N'esta_eliminado') IS NULL
    EXEC sp_rename N'transacciones.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'empresa_id') IS NULL
    EXEC sp_rename N'cuentas_bancarias.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'bankName') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'nombre_banco') IS NULL
    EXEC sp_rename N'cuentas_bancarias.bankName', N'nombre_banco', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'accountNumber') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'numero_cuenta') IS NULL
    EXEC sp_rename N'cuentas_bancarias.accountNumber', N'numero_cuenta', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'accountType') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'tipo_cuenta') IS NULL
    EXEC sp_rename N'cuentas_bancarias.accountType', N'tipo_cuenta', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'currency') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'moneda') IS NULL
    EXEC sp_rename N'cuentas_bancarias.currency', N'moneda', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'holderName') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'nombre_titular') IS NULL
    EXEC sp_rename N'cuentas_bancarias.holderName', N'nombre_titular', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'currentBalance') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'saldo_actual') IS NULL
    EXEC sp_rename N'cuentas_bancarias.currentBalance', N'saldo_actual', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'isActive') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'esta_activo') IS NULL
    EXEC sp_rename N'cuentas_bancarias.isActive', N'esta_activo', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'notas') IS NULL
    EXEC sp_rename N'cuentas_bancarias.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'esta_eliminado') IS NULL
    EXEC sp_rename N'cuentas_bancarias.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'creado_en') IS NULL
    EXEC sp_rename N'cuentas_bancarias.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.cuentas_bancarias', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.cuentas_bancarias', N'actualizado_en') IS NULL
    EXEC sp_rename N'cuentas_bancarias.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'empresa_id') IS NULL
    EXEC sp_rename N'metodos_pago.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'nombre') IS NULL
    EXEC sp_rename N'metodos_pago.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'categoria') IS NULL
    EXEC sp_rename N'metodos_pago.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'bankAccountId') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'cuenta_bancaria_id') IS NULL
    EXEC sp_rename N'metodos_pago.bankAccountId', N'cuenta_bancaria_id', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'bankAccountAlias') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'alias_cuenta_bancaria') IS NULL
    EXEC sp_rename N'metodos_pago.bankAccountAlias', N'alias_cuenta_bancaria', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'commissionPct') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'porcentaje_comision') IS NULL
    EXEC sp_rename N'metodos_pago.commissionPct', N'porcentaje_comision', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'requiresReferenceNumber') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'requiere_numero_referencia') IS NULL
    EXEC sp_rename N'metodos_pago.requiresReferenceNumber', N'requiere_numero_referencia', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'icon') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'icono') IS NULL
    EXEC sp_rename N'metodos_pago.icon', N'icono', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'isActive') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'esta_activo') IS NULL
    EXEC sp_rename N'metodos_pago.isActive', N'esta_activo', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'esta_eliminado') IS NULL
    EXEC sp_rename N'metodos_pago.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'creado_en') IS NULL
    EXEC sp_rename N'metodos_pago.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.metodos_pago', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.metodos_pago', N'actualizado_en') IS NULL
    EXEC sp_rename N'metodos_pago.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'empresa_id') IS NULL
    EXEC sp_rename N'registros_turno.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'shift') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'turno') IS NULL
    EXEC sp_rename N'registros_turno.shift', N'turno', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'openedAt') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'abierto_en') IS NULL
    EXEC sp_rename N'registros_turno.openedAt', N'abierto_en', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'openedUtc') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'abierto_utc') IS NULL
    EXEC sp_rename N'registros_turno.openedUtc', N'abierto_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'closedAt') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'cerrado_en') IS NULL
    EXEC sp_rename N'registros_turno.closedAt', N'cerrado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'closedUtc') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'cerrado_utc') IS NULL
    EXEC sp_rename N'registros_turno.closedUtc', N'cerrado_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'openedBy') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'abierto_por') IS NULL
    EXEC sp_rename N'registros_turno.openedBy', N'abierto_por', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'closedBy') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'cerrado_por') IS NULL
    EXEC sp_rename N'registros_turno.closedBy', N'cerrado_por', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'initialCash') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'caja_inicial') IS NULL
    EXEC sp_rename N'registros_turno.initialCash', N'caja_inicial', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'finalCashReported') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'caja_final_reportada') IS NULL
    EXEC sp_rename N'registros_turno.finalCashReported', N'caja_final_reportada', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'systemCashExpected') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'caja_esperada_sistema') IS NULL
    EXEC sp_rename N'registros_turno.systemCashExpected', N'caja_esperada_sistema', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'cashDifference') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'diferencia_caja') IS NULL
    EXEC sp_rename N'registros_turno.cashDifference', N'diferencia_caja', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'totalSales') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'total_ventas') IS NULL
    EXEC sp_rename N'registros_turno.totalSales', N'total_ventas', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'totalExpenses') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'total_gastos') IS NULL
    EXEC sp_rename N'registros_turno.totalExpenses', N'total_gastos', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'cardSales') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'ventas_tarjeta') IS NULL
    EXEC sp_rename N'registros_turno.cardSales', N'ventas_tarjeta', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'digitalWalletSales') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'ventas_billetera_digital') IS NULL
    EXEC sp_rename N'registros_turno.digitalWalletSales', N'ventas_billetera_digital', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'bankTransferSales') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'ventas_transferencia') IS NULL
    EXEC sp_rename N'registros_turno.bankTransferSales', N'ventas_transferencia', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'estado') IS NULL
    EXEC sp_rename N'registros_turno.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.registros_turno', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.registros_turno', N'notas') IS NULL
    EXEC sp_rename N'registros_turno.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'empresa_id') IS NULL
    EXEC sp_rename N'turnos_empresa.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'currentShift') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'turno_actual') IS NULL
    EXEC sp_rename N'turnos_empresa.currentShift', N'turno_actual', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'openedAt') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'abierto_en') IS NULL
    EXEC sp_rename N'turnos_empresa.openedAt', N'abierto_en', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'openedUtc') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'abierto_utc') IS NULL
    EXEC sp_rename N'turnos_empresa.openedUtc', N'abierto_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'openedBy') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'abierto_por') IS NULL
    EXEC sp_rename N'turnos_empresa.openedBy', N'abierto_por', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'initialCash') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'caja_inicial') IS NULL
    EXEC sp_rename N'turnos_empresa.initialCash', N'caja_inicial', N'COLUMN';
IF COL_LENGTH(N'dbo.turnos_empresa', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.turnos_empresa', N'actualizado_en') IS NULL
    EXEC sp_rename N'turnos_empresa.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'empresa_id') IS NULL
    EXEC sp_rename N'insumos.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'code') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'codigo') IS NULL
    EXEC sp_rename N'insumos.code', N'codigo', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'nombre') IS NULL
    EXEC sp_rename N'insumos.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'categoria') IS NULL
    EXEC sp_rename N'insumos.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'unit') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'unidad') IS NULL
    EXEC sp_rename N'insumos.unit', N'unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'currentStock') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'stock_actual') IS NULL
    EXEC sp_rename N'insumos.currentStock', N'stock_actual', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'minStock') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'stock_minimo') IS NULL
    EXEC sp_rename N'insumos.minStock', N'stock_minimo', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'costPerUnit') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'costo_por_unidad') IS NULL
    EXEC sp_rename N'insumos.costPerUnit', N'costo_por_unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'lastPurchaseDate') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'fecha_ultima_compra') IS NULL
    EXEC sp_rename N'insumos.lastPurchaseDate', N'fecha_ultima_compra', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'lastPurchaseUtc') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'ultima_compra_utc') IS NULL
    EXEC sp_rename N'insumos.lastPurchaseUtc', N'ultima_compra_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'esta_eliminado') IS NULL
    EXEC sp_rename N'insumos.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'creado_en') IS NULL
    EXEC sp_rename N'insumos.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.insumos', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.insumos', N'actualizado_en') IS NULL
    EXEC sp_rename N'insumos.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'empresa_id') IS NULL
    EXEC sp_rename N'recetas.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'productId') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'producto_id') IS NULL
    EXEC sp_rename N'recetas.productId', N'producto_id', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'productName') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'nombre_producto') IS NULL
    EXEC sp_rename N'recetas.productName', N'nombre_producto', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'categoria') IS NULL
    EXEC sp_rename N'recetas.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'portions') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'porciones') IS NULL
    EXEC sp_rename N'recetas.portions', N'porciones', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'salePrice') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'precio_venta') IS NULL
    EXEC sp_rename N'recetas.salePrice', N'precio_venta', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'totalCost') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'costo_total') IS NULL
    EXEC sp_rename N'recetas.totalCost', N'costo_total', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'theoreticalFoodCostPct') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'porcentaje_costo_teorico') IS NULL
    EXEC sp_rename N'recetas.theoreticalFoodCostPct', N'porcentaje_costo_teorico', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'preparationNotes') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'notas_preparacion') IS NULL
    EXEC sp_rename N'recetas.preparationNotes', N'notas_preparacion', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'esta_eliminado') IS NULL
    EXEC sp_rename N'recetas.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'creado_en') IS NULL
    EXEC sp_rename N'recetas.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.recetas', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.recetas', N'actualizado_en') IS NULL
    EXEC sp_rename N'recetas.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'recipeId') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'receta_id') IS NULL
    EXEC sp_rename N'ingredientes_receta.recipeId', N'receta_id', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'insumoId') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'insumo_id') IS NULL
    EXEC sp_rename N'ingredientes_receta.insumoId', N'insumo_id', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'insumoName') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'nombre_insumo') IS NULL
    EXEC sp_rename N'ingredientes_receta.insumoName', N'nombre_insumo', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'quantity') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'cantidad') IS NULL
    EXEC sp_rename N'ingredientes_receta.quantity', N'cantidad', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'unit') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'unidad') IS NULL
    EXEC sp_rename N'ingredientes_receta.unit', N'unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'costPerUnit') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'costo_por_unidad') IS NULL
    EXEC sp_rename N'ingredientes_receta.costPerUnit', N'costo_por_unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.ingredientes_receta', N'subtotalCost') IS NOT NULL AND COL_LENGTH(N'dbo.ingredientes_receta', N'costo_subtotal') IS NULL
    EXEC sp_rename N'ingredientes_receta.subtotalCost', N'costo_subtotal', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'empresa_id') IS NULL
    EXEC sp_rename N'compras.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'categoria') IS NULL
    EXEC sp_rename N'compras.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'documentStatus') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'estado_documento') IS NULL
    EXEC sp_rename N'compras.documentStatus', N'estado_documento', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'provisionalNoteNumber') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'numero_papeleta_provisional') IS NULL
    EXEC sp_rename N'compras.provisionalNoteNumber', N'numero_papeleta_provisional', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'invoiceNumber') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'numero_factura') IS NULL
    EXEC sp_rename N'compras.invoiceNumber', N'numero_factura', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'supplierName') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'nombre_proveedor') IS NULL
    EXEC sp_rename N'compras.supplierName', N'nombre_proveedor', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'supplierRuc') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'ruc_proveedor') IS NULL
    EXEC sp_rename N'compras.supplierRuc', N'ruc_proveedor', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'date') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'fecha') IS NULL
    EXEC sp_rename N'compras.date', N'fecha', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'time') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'hora') IS NULL
    EXEC sp_rename N'compras.time', N'hora', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'purchasedUtc') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'comprada_utc') IS NULL
    EXEC sp_rename N'compras.purchasedUtc', N'comprada_utc', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'shift') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'turno') IS NULL
    EXEC sp_rename N'compras.shift', N'turno', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'paymentStatus') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'estado_pago') IS NULL
    EXEC sp_rename N'compras.paymentStatus', N'estado_pago', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'paidFromCash') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'pagado_desde_caja') IS NULL
    EXEC sp_rename N'compras.paidFromCash', N'pagado_desde_caja', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'bankAccountId') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'cuenta_bancaria_id') IS NULL
    EXEC sp_rename N'compras.bankAccountId', N'cuenta_bancaria_id', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'bankAccountAlias') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'alias_cuenta_bancaria') IS NULL
    EXEC sp_rename N'compras.bankAccountAlias', N'alias_cuenta_bancaria', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'notas') IS NULL
    EXEC sp_rename N'compras.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'regularizedAt') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'regularizado_en') IS NULL
    EXEC sp_rename N'compras.regularizedAt', N'regularizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'regularizedBy') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'regularizado_por') IS NULL
    EXEC sp_rename N'compras.regularizedBy', N'regularizado_por', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'clientOpId') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'id_operacion_cliente') IS NULL
    EXEC sp_rename N'compras.clientOpId', N'id_operacion_cliente', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'esta_eliminado') IS NULL
    EXEC sp_rename N'compras.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'creado_en') IS NULL
    EXEC sp_rename N'compras.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.compras', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.compras', N'actualizado_en') IS NULL
    EXEC sp_rename N'compras.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'purchaseId') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'compra_id') IS NULL
    EXEC sp_rename N'detalle_compras.purchaseId', N'compra_id', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'insumoId') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'insumo_id') IS NULL
    EXEC sp_rename N'detalle_compras.insumoId', N'insumo_id', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'insumoName') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'nombre_insumo') IS NULL
    EXEC sp_rename N'detalle_compras.insumoName', N'nombre_insumo', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'quantity') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'cantidad') IS NULL
    EXEC sp_rename N'detalle_compras.quantity', N'cantidad', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'unit') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'unidad') IS NULL
    EXEC sp_rename N'detalle_compras.unit', N'unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'unitCost') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'costo_unitario') IS NULL
    EXEC sp_rename N'detalle_compras.unitCost', N'costo_unitario', N'COLUMN';
IF COL_LENGTH(N'dbo.detalle_compras', N'totalCost') IS NOT NULL AND COL_LENGTH(N'dbo.detalle_compras', N'costo_total') IS NULL
    EXEC sp_rename N'detalle_compras.totalCost', N'costo_total', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'empresa_id') IS NULL
    EXEC sp_rename N'movimientos_kardex.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'timestamp') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'marca_tiempo') IS NULL
    EXEC sp_rename N'movimientos_kardex.timestamp', N'marca_tiempo', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'date') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'fecha') IS NULL
    EXEC sp_rename N'movimientos_kardex.date', N'fecha', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'time') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'hora') IS NULL
    EXEC sp_rename N'movimientos_kardex.time', N'hora', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'insumoId') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'insumo_id') IS NULL
    EXEC sp_rename N'movimientos_kardex.insumoId', N'insumo_id', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'insumoName') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'nombre_insumo') IS NULL
    EXEC sp_rename N'movimientos_kardex.insumoName', N'nombre_insumo', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'type') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'tipo') IS NULL
    EXEC sp_rename N'movimientos_kardex.type', N'tipo', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'referenceDoc') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'documento_referencia') IS NULL
    EXEC sp_rename N'movimientos_kardex.referenceDoc', N'documento_referencia', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'quantity') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'cantidad') IS NULL
    EXEC sp_rename N'movimientos_kardex.quantity', N'cantidad', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'unit') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'unidad') IS NULL
    EXEC sp_rename N'movimientos_kardex.unit', N'unidad', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'unitCost') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'costo_unitario') IS NULL
    EXEC sp_rename N'movimientos_kardex.unitCost', N'costo_unitario', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'totalCost') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'costo_total') IS NULL
    EXEC sp_rename N'movimientos_kardex.totalCost', N'costo_total', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'stockBefore') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'stock_antes') IS NULL
    EXEC sp_rename N'movimientos_kardex.stockBefore', N'stock_antes', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'stockAfter') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'stock_despues') IS NULL
    EXEC sp_rename N'movimientos_kardex.stockAfter', N'stock_despues', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'notes') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'notas') IS NULL
    EXEC sp_rename N'movimientos_kardex.notes', N'notas', N'COLUMN';
IF COL_LENGTH(N'dbo.movimientos_kardex', N'clientOpId') IS NOT NULL AND COL_LENGTH(N'dbo.movimientos_kardex', N'id_operacion_cliente') IS NULL
    EXEC sp_rename N'movimientos_kardex.clientOpId', N'id_operacion_cliente', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'empresa_id') IS NULL
    EXEC sp_rename N'impresoras.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'name') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'nombre') IS NULL
    EXEC sp_rename N'impresoras.name', N'nombre', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'role') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'rol') IS NULL
    EXEC sp_rename N'impresoras.role', N'rol', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'connectionType') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'tipo_conexion') IS NULL
    EXEC sp_rename N'impresoras.connectionType', N'tipo_conexion', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'ipAddress') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'direccion_ip') IS NULL
    EXEC sp_rename N'impresoras.ipAddress', N'direccion_ip', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'port') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'puerto') IS NULL
    EXEC sp_rename N'impresoras.port', N'puerto', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'paperWidth') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'ancho_papel') IS NULL
    EXEC sp_rename N'impresoras.paperWidth', N'ancho_papel', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'autoCut') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'corte_automatico') IS NULL
    EXEC sp_rename N'impresoras.autoCut', N'corte_automatico', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'beepOnPrint') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'pitido_al_imprimir') IS NULL
    EXEC sp_rename N'impresoras.beepOnPrint', N'pitido_al_imprimir', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'estado') IS NULL
    EXEC sp_rename N'impresoras.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'isEnabled') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'esta_habilitado') IS NULL
    EXEC sp_rename N'impresoras.isEnabled', N'esta_habilitado', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'isDeleted') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'esta_eliminado') IS NULL
    EXEC sp_rename N'impresoras.isDeleted', N'esta_eliminado', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'creado_en') IS NULL
    EXEC sp_rename N'impresoras.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.impresoras', N'updatedAt') IS NOT NULL AND COL_LENGTH(N'dbo.impresoras', N'actualizado_en') IS NULL
    EXEC sp_rename N'impresoras.updatedAt', N'actualizado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.categorias_impresora', N'printerId') IS NOT NULL AND COL_LENGTH(N'dbo.categorias_impresora', N'impresora_id') IS NULL
    EXEC sp_rename N'categorias_impresora.printerId', N'impresora_id', N'COLUMN';
IF COL_LENGTH(N'dbo.categorias_impresora', N'category') IS NOT NULL AND COL_LENGTH(N'dbo.categorias_impresora', N'categoria') IS NULL
    EXEC sp_rename N'categorias_impresora.category', N'categoria', N'COLUMN';
IF COL_LENGTH(N'dbo.categorias_impresora', N'idx') IS NOT NULL AND COL_LENGTH(N'dbo.categorias_impresora', N'orden') IS NULL
    EXEC sp_rename N'categorias_impresora.idx', N'orden', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'deviceId') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'dispositivo_id') IS NULL
    EXEC sp_rename N'operaciones_cliente.deviceId', N'dispositivo_id', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'companyId') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'empresa_id') IS NULL
    EXEC sp_rename N'operaciones_cliente.companyId', N'empresa_id', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'entity') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'entidad') IS NULL
    EXEC sp_rename N'operaciones_cliente.entity', N'entidad', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'operation') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'operacion') IS NULL
    EXEC sp_rename N'operaciones_cliente.operation', N'operacion', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'payload') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'carga') IS NULL
    EXEC sp_rename N'operaciones_cliente.payload', N'carga', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'clientOpId') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'id_operacion_cliente') IS NULL
    EXEC sp_rename N'operaciones_cliente.clientOpId', N'id_operacion_cliente', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'status') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'estado') IS NULL
    EXEC sp_rename N'operaciones_cliente.status', N'estado', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'attemptCount') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'numero_intentos') IS NULL
    EXEC sp_rename N'operaciones_cliente.attemptCount', N'numero_intentos', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'lastError') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'ultimo_error') IS NULL
    EXEC sp_rename N'operaciones_cliente.lastError', N'ultimo_error', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'createdAt') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'creado_en') IS NULL
    EXEC sp_rename N'operaciones_cliente.createdAt', N'creado_en', N'COLUMN';
IF COL_LENGTH(N'dbo.operaciones_cliente', N'processedAt') IS NOT NULL AND COL_LENGTH(N'dbo.operaciones_cliente', N'procesado_en') IS NULL
    EXEC sp_rename N'operaciones_cliente.processedAt', N'procesado_en', N'COLUMN';

-- ============ 3. PK / UNIQUE ============
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'companies_pkey')
    EXEC sp_rename N'dbo.empresas.companies_pkey', N'pk_empresas', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'devices_pkey')
    EXEC sp_rename N'dbo.dispositivos.devices_pkey', N'pk_dispositivos', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'numbering_sequences_pkey')
    EXEC sp_rename N'dbo.secuencias_numeracion.numbering_sequences_pkey', N'pk_secuencias_numeracion', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'users_pkey')
    EXEC sp_rename N'dbo.usuarios.users_pkey', N'pk_usuarios', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'sessions_pkey')
    EXEC sp_rename N'dbo.sesiones.sessions_pkey', N'pk_sesiones', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'tables_pkey')
    EXEC sp_rename N'dbo.mesas.tables_pkey', N'pk_mesas', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'products_pkey')
    EXEC sp_rename N'dbo.productos.products_pkey', N'pk_productos', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_pkey')
    EXEC sp_rename N'dbo.pedidos.orders_pkey', N'pk_pedidos', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'order_items_pkey')
    EXEC sp_rename N'dbo.detalle_pedidos.order_items_pkey', N'pk_detalle_pedidos', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_pkey')
    EXEC sp_rename N'dbo.transacciones.transactions_pkey', N'pk_transacciones', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'bank_accounts_pkey')
    EXEC sp_rename N'dbo.cuentas_bancarias.bank_accounts_pkey', N'pk_cuentas_bancarias', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'payment_methods_pkey')
    EXEC sp_rename N'dbo.metodos_pago.payment_methods_pkey', N'pk_metodos_pago', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'shift_records_pkey')
    EXEC sp_rename N'dbo.registros_turno.shift_records_pkey', N'pk_registros_turno', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'company_shifts_pkey')
    EXEC sp_rename N'dbo.turnos_empresa.company_shifts_pkey', N'pk_turnos_empresa', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'insumos_pkey')
    EXEC sp_rename N'dbo.insumos.insumos_pkey', N'pk_insumos', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'recipes_pkey')
    EXEC sp_rename N'dbo.recetas.recipes_pkey', N'pk_recetas', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'recipe_ingredients_pkey')
    EXEC sp_rename N'dbo.ingredientes_receta.recipe_ingredients_pkey', N'pk_ingredientes_receta', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchases_pkey')
    EXEC sp_rename N'dbo.compras.purchases_pkey', N'pk_compras', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchase_items_pkey')
    EXEC sp_rename N'dbo.detalle_compras.purchase_items_pkey', N'pk_detalle_compras', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kardex_movements_pkey')
    EXEC sp_rename N'dbo.movimientos_kardex.kardex_movements_pkey', N'pk_movimientos_kardex', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'printers_pkey')
    EXEC sp_rename N'dbo.impresoras.printers_pkey', N'pk_impresoras', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'printer_categories_pkey')
    EXEC sp_rename N'dbo.categorias_impresora.printer_categories_pkey', N'pk_categorias_impresora', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'client_ops_pkey')
    EXEC sp_rename N'dbo.operaciones_cliente.client_ops_pkey', N'pk_operaciones_cliente', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'companies_ruc_key')
    EXEC sp_rename N'dbo.empresas.companies_ruc_key', N'uq_empresas_ruc', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'devices_terminalCode_key')
    EXEC sp_rename N'dbo.dispositivos.devices_terminalCode_key', N'uq_dispositivos_codigo_terminal', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'sessions_tokenHash_key')
    EXEC sp_rename N'dbo.sesiones.sessions_tokenHash_key', N'uq_sesiones_hash_token', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_clientOpId_key')
    EXEC sp_rename N'dbo.pedidos.orders_clientOpId_key', N'uq_pedidos_id_operacion_cliente', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_clientOpId_key')
    EXEC sp_rename N'dbo.transacciones.transactions_clientOpId_key', N'uq_transacciones_id_operacion_cliente', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'insumos_code_key')
    EXEC sp_rename N'dbo.insumos.insumos_code_key', N'uq_insumos_codigo', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchases_clientOpId_key')
    EXEC sp_rename N'dbo.compras.purchases_clientOpId_key', N'uq_compras_id_operacion_cliente', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kardex_movements_clientOpId_key')
    EXEC sp_rename N'dbo.movimientos_kardex.kardex_movements_clientOpId_key', N'uq_movimientos_kardex_id_operacion_cliente', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'printer_categories_printerId_category_key')
    EXEC sp_rename N'dbo.categorias_impresora.printer_categories_printerId_category_key', N'uq_categorias_impresora_impresora_id_categoria', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'client_ops_clientOpId_key')
    EXEC sp_rename N'dbo.operaciones_cliente.client_ops_clientOpId_key', N'uq_operaciones_cliente_id_operacion_cliente', N'INDEX';

-- ============ 4. INDICES ============
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'devices_companyId_idx')
    EXEC sp_rename N'dbo.dispositivos.devices_companyId_idx', N'ix_dispositivos_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'users_companyId_idx')
    EXEC sp_rename N'dbo.usuarios.users_companyId_idx', N'ix_usuarios_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'sessions_userId_idx')
    EXEC sp_rename N'dbo.sesiones.sessions_userId_idx', N'ix_sesiones_usuario_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'sessions_deviceId_idx')
    EXEC sp_rename N'dbo.sesiones.sessions_deviceId_idx', N'ix_sesiones_dispositivo_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'tables_companyId_status_idx')
    EXEC sp_rename N'dbo.mesas.tables_companyId_status_idx', N'ix_mesas_empresa_id_estado', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'tables_companyId_zone_idx')
    EXEC sp_rename N'dbo.mesas.tables_companyId_zone_idx', N'ix_mesas_empresa_id_zona', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'products_companyId_category_idx')
    EXEC sp_rename N'dbo.productos.products_companyId_category_idx', N'ix_productos_empresa_id_categoria', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'products_companyId_available_idx')
    EXEC sp_rename N'dbo.productos.products_companyId_available_idx', N'ix_productos_empresa_id_disponible', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_companyId_status_idx')
    EXEC sp_rename N'dbo.pedidos.orders_companyId_status_idx', N'ix_pedidos_empresa_id_estado', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_tableId_idx')
    EXEC sp_rename N'dbo.pedidos.orders_tableId_idx', N'ix_pedidos_mesa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_createdUtc_idx')
    EXEC sp_rename N'dbo.pedidos.orders_createdUtc_idx', N'ix_pedidos_creado_utc', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'orders_ticketNumber_idx')
    EXEC sp_rename N'dbo.pedidos.orders_ticketNumber_idx', N'ix_pedidos_numero_ticket', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'order_items_orderId_idx')
    EXEC sp_rename N'dbo.detalle_pedidos.order_items_orderId_idx', N'ix_detalle_pedidos_pedido_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_companyId_idx')
    EXEC sp_rename N'dbo.transacciones.transactions_companyId_idx', N'ix_transacciones_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_timestamp_idx')
    EXEC sp_rename N'dbo.transacciones.transactions_timestamp_idx', N'ix_transacciones_marca_tiempo', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_orderId_idx')
    EXEC sp_rename N'dbo.transacciones.transactions_orderId_idx', N'ix_transacciones_pedido_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'transactions_bankAccountId_idx')
    EXEC sp_rename N'dbo.transacciones.transactions_bankAccountId_idx', N'ix_transacciones_cuenta_bancaria_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'bank_accounts_companyId_idx')
    EXEC sp_rename N'dbo.cuentas_bancarias.bank_accounts_companyId_idx', N'ix_cuentas_bancarias_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'payment_methods_companyId_idx')
    EXEC sp_rename N'dbo.metodos_pago.payment_methods_companyId_idx', N'ix_metodos_pago_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'payment_methods_bankAccountId_idx')
    EXEC sp_rename N'dbo.metodos_pago.payment_methods_bankAccountId_idx', N'ix_metodos_pago_cuenta_bancaria_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'shift_records_companyId_shift_idx')
    EXEC sp_rename N'dbo.registros_turno.shift_records_companyId_shift_idx', N'ix_registros_turno_empresa_id_turno', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'shift_records_closedUtc_idx')
    EXEC sp_rename N'dbo.registros_turno.shift_records_closedUtc_idx', N'ix_registros_turno_cerrado_utc', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'insumos_companyId_idx')
    EXEC sp_rename N'dbo.insumos.insumos_companyId_idx', N'ix_insumos_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'insumos_category_idx')
    EXEC sp_rename N'dbo.insumos.insumos_category_idx', N'ix_insumos_categoria', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'recipes_companyId_idx')
    EXEC sp_rename N'dbo.recetas.recipes_companyId_idx', N'ix_recetas_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'recipes_productId_idx')
    EXEC sp_rename N'dbo.recetas.recipes_productId_idx', N'ix_recetas_producto_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'recipe_ingredients_recipeId_idx')
    EXEC sp_rename N'dbo.ingredientes_receta.recipe_ingredients_recipeId_idx', N'ix_ingredientes_receta_receta_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchases_companyId_idx')
    EXEC sp_rename N'dbo.compras.purchases_companyId_idx', N'ix_compras_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchases_bankAccountId_idx')
    EXEC sp_rename N'dbo.compras.purchases_bankAccountId_idx', N'ix_compras_cuenta_bancaria_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'purchase_items_purchaseId_idx')
    EXEC sp_rename N'dbo.detalle_compras.purchase_items_purchaseId_idx', N'ix_detalle_compras_compra_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kardex_movements_companyId_idx')
    EXEC sp_rename N'dbo.movimientos_kardex.kardex_movements_companyId_idx', N'ix_movimientos_kardex_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kardex_movements_insumoId_timestamp_idx')
    EXEC sp_rename N'dbo.movimientos_kardex.kardex_movements_insumoId_timestamp_idx', N'ix_movimientos_kardex_insumo_id_marca_tiempo', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'kardex_movements_type_idx')
    EXEC sp_rename N'dbo.movimientos_kardex.kardex_movements_type_idx', N'ix_movimientos_kardex_tipo', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'printers_companyId_idx')
    EXEC sp_rename N'dbo.impresoras.printers_companyId_idx', N'ix_impresoras_empresa_id', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'client_ops_deviceId_status_idx')
    EXEC sp_rename N'dbo.operaciones_cliente.client_ops_deviceId_status_idx', N'ix_operaciones_cliente_dispositivo_id_estado', N'INDEX';
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'client_ops_createdAt_idx')
    EXEC sp_rename N'dbo.operaciones_cliente.client_ops_createdAt_idx', N'ix_operaciones_cliente_creado_en', N'INDEX';

-- ============ 5. DEFAULTS ============
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'devices_lastSeenAt_df')
    EXEC sp_rename N'devices_lastSeenAt_df', N'df_dispositivos_ultima_vista_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'devices_isActive_df')
    EXEC sp_rename N'devices_isActive_df', N'df_dispositivos_esta_activo', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'numbering_sequences_lastNumber_df')
    EXEC sp_rename N'numbering_sequences_lastNumber_df', N'df_secuencias_numeracion_ultimo_numero', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'users_role_df')
    EXEC sp_rename N'users_role_df', N'df_usuarios_rol', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'users_isActive_df')
    EXEC sp_rename N'users_isActive_df', N'df_usuarios_esta_activo', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'users_isDeleted_df')
    EXEC sp_rename N'users_isDeleted_df', N'df_usuarios_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'users_version_df')
    EXEC sp_rename N'users_version_df', N'df_usuarios_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'users_createdAt_df')
    EXEC sp_rename N'users_createdAt_df', N'df_usuarios_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'sessions_createdAt_df')
    EXEC sp_rename N'sessions_createdAt_df', N'df_sesiones_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'tables_status_df')
    EXEC sp_rename N'tables_status_df', N'df_mesas_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'tables_isDeleted_df')
    EXEC sp_rename N'tables_isDeleted_df', N'df_mesas_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'tables_version_df')
    EXEC sp_rename N'tables_version_df', N'df_mesas_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'tables_createdAt_df')
    EXEC sp_rename N'tables_createdAt_df', N'df_mesas_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'products_available_df')
    EXEC sp_rename N'products_available_df', N'df_productos_disponible', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'products_hasRecipe_df')
    EXEC sp_rename N'products_hasRecipe_df', N'df_productos_tiene_receta', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'products_isDeleted_df')
    EXEC sp_rename N'products_isDeleted_df', N'df_productos_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'products_version_df')
    EXEC sp_rename N'products_version_df', N'df_productos_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'products_createdAt_df')
    EXEC sp_rename N'products_createdAt_df', N'df_productos_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'orders_createdUtc_df')
    EXEC sp_rename N'orders_createdUtc_df', N'df_pedidos_creado_utc', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'orders_status_df')
    EXEC sp_rename N'orders_status_df', N'df_pedidos_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'orders_isDeleted_df')
    EXEC sp_rename N'orders_isDeleted_df', N'df_pedidos_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'orders_version_df')
    EXEC sp_rename N'orders_version_df', N'df_pedidos_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'order_items_status_df')
    EXEC sp_rename N'order_items_status_df', N'df_detalle_pedidos_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'transactions_isIncome_df')
    EXEC sp_rename N'transactions_isIncome_df', N'df_transacciones_es_ingreso', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'transactions_isDeleted_df')
    EXEC sp_rename N'transactions_isDeleted_df', N'df_transacciones_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'bank_accounts_currency_df')
    EXEC sp_rename N'bank_accounts_currency_df', N'df_cuentas_bancarias_moneda', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'bank_accounts_isActive_df')
    EXEC sp_rename N'bank_accounts_isActive_df', N'df_cuentas_bancarias_esta_activo', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'bank_accounts_isDeleted_df')
    EXEC sp_rename N'bank_accounts_isDeleted_df', N'df_cuentas_bancarias_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'bank_accounts_version_df')
    EXEC sp_rename N'bank_accounts_version_df', N'df_cuentas_bancarias_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'bank_accounts_createdAt_df')
    EXEC sp_rename N'bank_accounts_createdAt_df', N'df_cuentas_bancarias_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'payment_methods_requiresReferenceNumber_df')
    EXEC sp_rename N'payment_methods_requiresReferenceNumber_df', N'df_metodos_pago_requiere_numero_referencia', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'payment_methods_isActive_df')
    EXEC sp_rename N'payment_methods_isActive_df', N'df_metodos_pago_esta_activo', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'payment_methods_isDeleted_df')
    EXEC sp_rename N'payment_methods_isDeleted_df', N'df_metodos_pago_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'payment_methods_version_df')
    EXEC sp_rename N'payment_methods_version_df', N'df_metodos_pago_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'payment_methods_createdAt_df')
    EXEC sp_rename N'payment_methods_createdAt_df', N'df_metodos_pago_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_openedUtc_df')
    EXEC sp_rename N'shift_records_openedUtc_df', N'df_registros_turno_abierto_utc', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_totalSales_df')
    EXEC sp_rename N'shift_records_totalSales_df', N'df_registros_turno_total_ventas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_totalExpenses_df')
    EXEC sp_rename N'shift_records_totalExpenses_df', N'df_registros_turno_total_gastos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_cardSales_df')
    EXEC sp_rename N'shift_records_cardSales_df', N'df_registros_turno_ventas_tarjeta', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_digitalWalletSales_df')
    EXEC sp_rename N'shift_records_digitalWalletSales_df', N'df_registros_turno_ventas_billetera_digital', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_bankTransferSales_df')
    EXEC sp_rename N'shift_records_bankTransferSales_df', N'df_registros_turno_ventas_transferencia', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'shift_records_status_df')
    EXEC sp_rename N'shift_records_status_df', N'df_registros_turno_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'company_shifts_currentShift_df')
    EXEC sp_rename N'company_shifts_currentShift_df', N'df_turnos_empresa_turno_actual', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'company_shifts_openedUtc_df')
    EXEC sp_rename N'company_shifts_openedUtc_df', N'df_turnos_empresa_abierto_utc', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'company_shifts_initialCash_df')
    EXEC sp_rename N'company_shifts_initialCash_df', N'df_turnos_empresa_caja_inicial', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'insumos_isDeleted_df')
    EXEC sp_rename N'insumos_isDeleted_df', N'df_insumos_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'insumos_version_df')
    EXEC sp_rename N'insumos_version_df', N'df_insumos_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'insumos_createdAt_df')
    EXEC sp_rename N'insumos_createdAt_df', N'df_insumos_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'recipes_portions_df')
    EXEC sp_rename N'recipes_portions_df', N'df_recetas_porciones', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'recipes_isDeleted_df')
    EXEC sp_rename N'recipes_isDeleted_df', N'df_recetas_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'recipes_version_df')
    EXEC sp_rename N'recipes_version_df', N'df_recetas_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'recipes_createdAt_df')
    EXEC sp_rename N'recipes_createdAt_df', N'df_recetas_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_documentStatus_df')
    EXEC sp_rename N'purchases_documentStatus_df', N'df_compras_estado_documento', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_purchasedUtc_df')
    EXEC sp_rename N'purchases_purchasedUtc_df', N'df_compras_comprada_utc', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_paidFromCash_df')
    EXEC sp_rename N'purchases_paidFromCash_df', N'df_compras_pagado_desde_caja', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_isDeleted_df')
    EXEC sp_rename N'purchases_isDeleted_df', N'df_compras_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_version_df')
    EXEC sp_rename N'purchases_version_df', N'df_compras_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'purchases_createdAt_df')
    EXEC sp_rename N'purchases_createdAt_df', N'df_compras_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_port_df')
    EXEC sp_rename N'printers_port_df', N'df_impresoras_puerto', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_paperWidth_df')
    EXEC sp_rename N'printers_paperWidth_df', N'df_impresoras_ancho_papel', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_autoCut_df')
    EXEC sp_rename N'printers_autoCut_df', N'df_impresoras_corte_automatico', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_beepOnPrint_df')
    EXEC sp_rename N'printers_beepOnPrint_df', N'df_impresoras_pitido_al_imprimir', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_status_df')
    EXEC sp_rename N'printers_status_df', N'df_impresoras_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_isEnabled_df')
    EXEC sp_rename N'printers_isEnabled_df', N'df_impresoras_esta_habilitado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_isDeleted_df')
    EXEC sp_rename N'printers_isDeleted_df', N'df_impresoras_esta_eliminado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_version_df')
    EXEC sp_rename N'printers_version_df', N'df_impresoras_version', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printers_createdAt_df')
    EXEC sp_rename N'printers_createdAt_df', N'df_impresoras_creado_en', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'printer_categories_idx_df')
    EXEC sp_rename N'printer_categories_idx_df', N'df_categorias_impresora_orden', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'client_ops_status_df')
    EXEC sp_rename N'client_ops_status_df', N'df_operaciones_cliente_estado', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'client_ops_attemptCount_df')
    EXEC sp_rename N'client_ops_attemptCount_df', N'df_operaciones_cliente_numero_intentos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'client_ops_createdAt_df')
    EXEC sp_rename N'client_ops_createdAt_df', N'df_operaciones_cliente_creado_en', N'OBJECT';

-- ============ 6. FOREIGN KEYS ============
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'devices_companyId_fkey')
    EXEC sp_rename N'devices_companyId_fkey', N'fk_dispositivos_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'numbering_sequences_companyId_fkey')
    EXEC sp_rename N'numbering_sequences_companyId_fkey', N'fk_secuencias_numeracion_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'users_companyId_fkey')
    EXEC sp_rename N'users_companyId_fkey', N'fk_usuarios_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'sessions_userId_fkey')
    EXEC sp_rename N'sessions_userId_fkey', N'fk_sesiones_usuarios', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'sessions_deviceId_fkey')
    EXEC sp_rename N'sessions_deviceId_fkey', N'fk_sesiones_dispositivos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'tables_companyId_fkey')
    EXEC sp_rename N'tables_companyId_fkey', N'fk_mesas_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'products_companyId_fkey')
    EXEC sp_rename N'products_companyId_fkey', N'fk_productos_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'orders_companyId_fkey')
    EXEC sp_rename N'orders_companyId_fkey', N'fk_pedidos_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'orders_tableId_fkey')
    EXEC sp_rename N'orders_tableId_fkey', N'fk_pedidos_mesas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'order_items_orderId_fkey')
    EXEC sp_rename N'order_items_orderId_fkey', N'fk_detalle_pedidos_pedidos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'order_items_productId_fkey')
    EXEC sp_rename N'order_items_productId_fkey', N'fk_detalle_pedidos_productos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'transactions_companyId_fkey')
    EXEC sp_rename N'transactions_companyId_fkey', N'fk_transacciones_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'transactions_orderId_fkey')
    EXEC sp_rename N'transactions_orderId_fkey', N'fk_transacciones_pedidos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'transactions_bankAccountId_fkey')
    EXEC sp_rename N'transactions_bankAccountId_fkey', N'fk_transacciones_cuentas_bancarias', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'transactions_customPaymentMethodId_fkey')
    EXEC sp_rename N'transactions_customPaymentMethodId_fkey', N'fk_transacciones_metodos_pago', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'bank_accounts_companyId_fkey')
    EXEC sp_rename N'bank_accounts_companyId_fkey', N'fk_cuentas_bancarias_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'payment_methods_companyId_fkey')
    EXEC sp_rename N'payment_methods_companyId_fkey', N'fk_metodos_pago_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'payment_methods_bankAccountId_fkey')
    EXEC sp_rename N'payment_methods_bankAccountId_fkey', N'fk_metodos_pago_cuentas_bancarias', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'shift_records_companyId_fkey')
    EXEC sp_rename N'shift_records_companyId_fkey', N'fk_registros_turno_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'company_shifts_companyId_fkey')
    EXEC sp_rename N'company_shifts_companyId_fkey', N'fk_turnos_empresa_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'insumos_companyId_fkey')
    EXEC sp_rename N'insumos_companyId_fkey', N'fk_insumos_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'recipes_companyId_fkey')
    EXEC sp_rename N'recipes_companyId_fkey', N'fk_recetas_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'recipes_productId_fkey')
    EXEC sp_rename N'recipes_productId_fkey', N'fk_recetas_productos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'recipe_ingredients_recipeId_fkey')
    EXEC sp_rename N'recipe_ingredients_recipeId_fkey', N'fk_ingredientes_receta_recetas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'recipe_ingredients_insumoId_fkey')
    EXEC sp_rename N'recipe_ingredients_insumoId_fkey', N'fk_ingredientes_receta_insumos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'purchases_companyId_fkey')
    EXEC sp_rename N'purchases_companyId_fkey', N'fk_compras_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'purchases_bankAccountId_fkey')
    EXEC sp_rename N'purchases_bankAccountId_fkey', N'fk_compras_cuentas_bancarias', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'purchase_items_purchaseId_fkey')
    EXEC sp_rename N'purchase_items_purchaseId_fkey', N'fk_detalle_compras_compras', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'purchase_items_insumoId_fkey')
    EXEC sp_rename N'purchase_items_insumoId_fkey', N'fk_detalle_compras_insumos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'kardex_movements_companyId_fkey')
    EXEC sp_rename N'kardex_movements_companyId_fkey', N'fk_movimientos_kardex_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'kardex_movements_insumoId_fkey')
    EXEC sp_rename N'kardex_movements_insumoId_fkey', N'fk_movimientos_kardex_insumos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'printers_companyId_fkey')
    EXEC sp_rename N'printers_companyId_fkey', N'fk_impresoras_empresas', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'printer_categories_printerId_fkey')
    EXEC sp_rename N'printer_categories_printerId_fkey', N'fk_categorias_impresora_impresoras', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'client_ops_deviceId_fkey')
    EXEC sp_rename N'client_ops_deviceId_fkey', N'fk_operaciones_cliente_dispositivos', N'OBJECT';
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'client_ops_companyId_fkey')
    EXEC sp_rename N'client_ops_companyId_fkey', N'fk_operaciones_cliente_empresas', N'OBJECT';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
