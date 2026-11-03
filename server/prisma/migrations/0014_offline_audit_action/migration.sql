BEGIN TRY

BEGIN TRAN;

-- Acción lógica del contrato offline que la firma autorizó: queda atada a la
-- escritura auditada (una prueba de caja no habilita una apertura).
ALTER TABLE [dbo].[auditoria_operaciones] ADD [accion_offline] NVARCHAR(100) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
