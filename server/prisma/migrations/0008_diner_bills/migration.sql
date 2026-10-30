BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[transacciones] ADD [aportante] NVARCHAR(100),
[cuenta_comensal_id] NVARCHAR(36),
[monto_recibido_abono] DECIMAL(12,2),
[vuelto_abono] DECIMAL(12,2);

-- CreateTable
CREATE TABLE [dbo].[cuentas_comensales] (
    [id] NVARCHAR(36) NOT NULL,
    [pedido_id] NVARCHAR(36) NOT NULL,
    [empresa_id] NVARCHAR(36) NOT NULL,
    [numero_ticket] NVARCHAR(30) NOT NULL,
    [comensal] NVARCHAR(100) NOT NULL,
    [tipo_documento_solicitado] NVARCHAR(20) NOT NULL,
    [receptor_nombre] NVARCHAR(200),
    [receptor_identificacion] NVARCHAR(20),
    [total] DECIMAL(12,2) NOT NULL,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [cuentas_comensales_estado_df] DEFAULT 'pendiente',
    [creado_utc] DATETIME2 NOT NULL CONSTRAINT [cuentas_comensales_creado_utc_df] DEFAULT CURRENT_TIMESTAMP,
    [cerrado_utc] DATETIME2,
    CONSTRAINT [cuentas_comensales_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [cuentas_comensales_empresa_id_numero_ticket_key] UNIQUE NONCLUSTERED ([empresa_id],[numero_ticket])
);

-- CreateTable
CREATE TABLE [dbo].[detalle_cuentas_comensales] (
    [id] NVARCHAR(36) NOT NULL,
    [cuenta_id] NVARCHAR(36) NOT NULL,
    [detalle_pedido_id] NVARCHAR(36) NOT NULL,
    [cantidad] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [detalle_cuentas_comensales_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [detalle_cuentas_comensales_cuenta_id_detalle_pedido_id_key] UNIQUE NONCLUSTERED ([cuenta_id],[detalle_pedido_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cuentas_comensales_pedido_id_idx] ON [dbo].[cuentas_comensales]([pedido_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [detalle_cuentas_comensales_detalle_pedido_id_idx] ON [dbo].[detalle_cuentas_comensales]([detalle_pedido_id]);

-- AddForeignKey
ALTER TABLE [dbo].[cuentas_comensales] ADD CONSTRAINT [cuentas_comensales_pedido_id_fkey] FOREIGN KEY ([pedido_id]) REFERENCES [dbo].[pedidos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cuentas_comensales] ADD CONSTRAINT [cuentas_comensales_empresa_id_fkey] FOREIGN KEY ([empresa_id]) REFERENCES [dbo].[empresas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[detalle_cuentas_comensales] ADD CONSTRAINT [detalle_cuentas_comensales_cuenta_id_fkey] FOREIGN KEY ([cuenta_id]) REFERENCES [dbo].[cuentas_comensales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[detalle_cuentas_comensales] ADD CONSTRAINT [detalle_cuentas_comensales_detalle_pedido_id_fkey] FOREIGN KEY ([detalle_pedido_id]) REFERENCES [dbo].[detalle_pedidos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transacciones] ADD CONSTRAINT [transacciones_cuenta_comensal_id_fkey] FOREIGN KEY ([cuenta_comensal_id]) REFERENCES [dbo].[cuentas_comensales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

