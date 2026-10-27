ALTER TABLE [dbo].[detalle_compras]
ADD [descuento] DECIMAL(12,2) NOT NULL CONSTRAINT [detalle_compras_descuento_df] DEFAULT 0;
