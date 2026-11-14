BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[transformacion_rendimientos] (
    [executionId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [templateId] NVARCHAR(36) NOT NULL,
    [templateVersion] INT NOT NULL,
    [templateName] NVARCHAR(150) NOT NULL,
    [sourceId] NVARCHAR(36) NOT NULL,
    [sourceName] NVARCHAR(150) NOT NULL,
    [sourceUnit] NVARCHAR(20) NOT NULL,
    [consumedQuantity] DECIMAL(20,4) NOT NULL,
    [usefulQuantity] DECIMAL(20,4) NOT NULL,
    [calculatedWaste] DECIMAL(20,4) NOT NULL,
    [wasteQuantity] DECIMAL(20,4) NOT NULL,
    [wasteEdited] BIT NOT NULL,
    [declaredWasteQuantity] DECIMAL(20,4),
    [declaredWasteUnit] NVARCHAR(20),
    [yieldPct] DECIMAL(12,4) NOT NULL,
    [totalCost] DECIMAL(12,2) NOT NULL,
    [actorUserId] NVARCHAR(36) NOT NULL,
    [createdAt] DATETIME2 NOT NULL,
    [localDate] NVARCHAR(10) NOT NULL,
    CONSTRAINT [transformacion_rendimientos_pkey] PRIMARY KEY CLUSTERED ([executionId])
);

-- CreateTable
CREATE TABLE [dbo].[transformacion_rendimiento_resultados] (
    [executionId] NVARCHAR(36) NOT NULL,
    [insumoId] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [proposedQuantity] DECIMAL(20,4) NOT NULL,
    [quantity] DECIMAL(20,4) NOT NULL,
    [referenceEquivalentQuantity] DECIMAL(20,4) NOT NULL,
    [referenceEquivalentUnit] NVARCHAR(20) NOT NULL,
    [equivalentQuantity] DECIMAL(20,4) NOT NULL,
    [equivalentUnit] NVARCHAR(20) NOT NULL,
    [equivalentTotal] DECIMAL(20,4) NOT NULL,
    [totalCost] DECIMAL(12,2) NOT NULL,
    [unitCost] DECIMAL(12,4) NOT NULL,
    [averageUnitCost] DECIMAL(12,4) NOT NULL,
    CONSTRAINT [transformacion_rendimiento_resultados_pkey] PRIMARY KEY CLUSTERED ([executionId],[insumoId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transformacion_rendimientos_companyId_localDate_sourceId_idx] ON [dbo].[transformacion_rendimientos]([companyId], [localDate], [sourceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transformacion_rendimiento_resultados_insumoId_idx] ON [dbo].[transformacion_rendimiento_resultados]([insumoId]);

-- AddForeignKey
ALTER TABLE [dbo].[transformacion_rendimientos] ADD CONSTRAINT [transformacion_rendimientos_executionId_fkey] FOREIGN KEY ([executionId]) REFERENCES [dbo].[transformacion_ejecuciones]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transformacion_rendimiento_resultados] ADD CONSTRAINT [transformacion_rendimiento_resultados_executionId_fkey] FOREIGN KEY ([executionId]) REFERENCES [dbo].[transformacion_rendimientos]([executionId]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

