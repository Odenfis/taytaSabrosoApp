BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[FiscalProfile] (
    [companyId] NVARCHAR(36) NOT NULL,
    [version] INT NOT NULL CONSTRAINT [FiscalProfile_version_df] DEFAULT 1,
    [configuration] NVARCHAR(max) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FiscalProfile_pkey] PRIMARY KEY CLUSTERED ([companyId])
);

-- CreateTable
CREATE TABLE [dbo].[FiscalTestDocument] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [orderId] NVARCHAR(36) NOT NULL,
    [billId] NVARCHAR(36),
    [sourceKey] NVARCHAR(100) NOT NULL,
    [requestKey] NVARCHAR(36) NOT NULL,
    [requestHash] NVARCHAR(64) NOT NULL,
    [number] NVARCHAR(30) NOT NULL,
    [documentType] NVARCHAR(10) NOT NULL,
    [state] NVARCHAR(30) NOT NULL CONSTRAINT [FiscalTestDocument_state_df] DEFAULT 'prepared',
    [snapshot] NVARCHAR(max) NOT NULL,
    [signedXml] NVARCHAR(max),
    [cdr] VARBINARY(max),
    [responseCode] NVARCHAR(30),
    [responseMessage] NVARCHAR(1000),
    [sendingAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FiscalTestDocument_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FiscalTestDocument_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FiscalTestDocument_sourceKey_key] UNIQUE NONCLUSTERED ([sourceKey]),
    CONSTRAINT [FiscalTestDocument_requestKey_key] UNIQUE NONCLUSTERED ([requestKey]),
    CONSTRAINT [FiscalTestDocument_companyId_number_key] UNIQUE NONCLUSTERED ([companyId],[number])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FiscalTestDocument_companyId_createdAt_idx] ON [dbo].[FiscalTestDocument]([companyId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[FiscalProfile] ADD CONSTRAINT [FiscalProfile_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[empresas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FiscalTestDocument] ADD CONSTRAINT [FiscalTestDocument_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[empresas]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FiscalTestDocument] ADD CONSTRAINT [FiscalTestDocument_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[pedidos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FiscalTestDocument] ADD CONSTRAINT [FiscalTestDocument_billId_fkey] FOREIGN KEY ([billId]) REFERENCES [dbo].[cuentas_comensales]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

