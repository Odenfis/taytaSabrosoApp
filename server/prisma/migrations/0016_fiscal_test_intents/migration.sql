BEGIN TRY
BEGIN TRAN;
CREATE TABLE [dbo].[FiscalTestIntent] (
 [sourceKey] NVARCHAR(100) NOT NULL,
 [companyId] NVARCHAR(36) NOT NULL,
 [orderId] NVARCHAR(36) NOT NULL,
 [billId] NVARCHAR(36),
 [version] INT NOT NULL CONSTRAINT [FiscalTestIntent_version_df] DEFAULT 1,
 [data] NVARCHAR(MAX) NOT NULL,
 [updatedAt] DATETIME2 NOT NULL,
 CONSTRAINT [FiscalTestIntent_pkey] PRIMARY KEY ([sourceKey]),
 CONSTRAINT [FiscalTestIntent_company_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[empresas]([id]),
 CONSTRAINT [FiscalTestIntent_order_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[pedidos]([id]),
 CONSTRAINT [FiscalTestIntent_bill_fkey] FOREIGN KEY ([billId]) REFERENCES [dbo].[cuentas_comensales]([id])
);
CREATE INDEX [FiscalTestIntent_companyId_orderId_idx] ON [dbo].[FiscalTestIntent]([companyId],[orderId]);
COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH;
