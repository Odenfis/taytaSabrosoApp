-- Agrega vínculo Compras -> Movimientos Kardex / Transacciones (para regularizar vale con folio formal)
ALTER TABLE [dbo].[movimientos_kardex] ADD [compra_id] NVarChar(36) NULL;
ALTER TABLE [dbo].[transacciones] ADD [compra_id] NVarChar(36) NULL;

CREATE NONCLUSTERED INDEX [ix_movimientos_kardex_compra_id] ON [dbo].[movimientos_kardex]([compra_id]);
CREATE NONCLUSTERED INDEX [ix_transacciones_compra_id] ON [dbo].[transacciones]([compra_id]);

ALTER TABLE [dbo].[movimientos_kardex] ADD CONSTRAINT [fk_movimientos_kardex_compras] FOREIGN KEY ([compra_id]) REFERENCES [dbo].[compras]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[transacciones] ADD CONSTRAINT [fk_transacciones_compras] FOREIGN KEY ([compra_id]) REFERENCES [dbo].[compras]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;