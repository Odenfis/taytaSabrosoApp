CREATE TABLE [dbo].[correcciones_pago] (
  [id] NVARCHAR(36) NOT NULL,
  [empresa_id] NVARCHAR(36) NOT NULL,
  [transaccion_id] NVARCHAR(36) NOT NULL,
  [operador_id] NVARCHAR(36) NOT NULL,
  [autorizador_id] NVARCHAR(36) NOT NULL,
  [metodo_anterior_id] NVARCHAR(36) NULL,
  [metodo_anterior] NVARCHAR(150) NULL,
  [cuenta_anterior_id] NVARCHAR(36) NULL,
  [alias_cuenta_anterior] NVARCHAR(200) NULL,
  [referencia_anterior] NVARCHAR(100) NULL,
  [recibido_anterior] DECIMAL(12,2) NULL,
  [vuelto_anterior] DECIMAL(12,2) NULL,
  [metodo_nuevo_id] NVARCHAR(36) NOT NULL,
  [metodo_nuevo] NVARCHAR(150) NOT NULL,
  [cuenta_nueva_id] NVARCHAR(36) NULL,
  [alias_cuenta_nueva] NVARCHAR(200) NULL,
  [referencia_nueva] NVARCHAR(100) NULL,
  [motivo] NVARCHAR(500) NOT NULL,
  [monto] DECIMAL(12,2) NOT NULL,
  [turno_cerrado] BIT NOT NULL,
  [ajuste_transaccion_id] NVARCHAR(36) NULL,
  [creado_utc] DATETIME2 NOT NULL CONSTRAINT [correcciones_pago_creado_utc_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [correcciones_pago_pkey] PRIMARY KEY ([id])
);
CREATE NONCLUSTERED INDEX [ix_correcciones_pago_transaccion] ON [dbo].[correcciones_pago]([transaccion_id], [creado_utc]);
CREATE NONCLUSTERED INDEX [ix_correcciones_pago_empresa] ON [dbo].[correcciones_pago]([empresa_id], [creado_utc]);
ALTER TABLE [dbo].[correcciones_pago] ADD CONSTRAINT [fk_correcciones_pago_empresa] FOREIGN KEY ([empresa_id]) REFERENCES [dbo].[empresas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[correcciones_pago] ADD CONSTRAINT [fk_correcciones_pago_transaccion] FOREIGN KEY ([transaccion_id]) REFERENCES [dbo].[transacciones]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[correcciones_pago] ADD CONSTRAINT [fk_correcciones_pago_operador] FOREIGN KEY ([operador_id]) REFERENCES [dbo].[usuarios]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[correcciones_pago] ADD CONSTRAINT [fk_correcciones_pago_autorizador] FOREIGN KEY ([autorizador_id]) REFERENCES [dbo].[usuarios]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[correcciones_pago] ADD CONSTRAINT [fk_correcciones_pago_ajuste] FOREIGN KEY ([ajuste_transaccion_id]) REFERENCES [dbo].[transacciones]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
