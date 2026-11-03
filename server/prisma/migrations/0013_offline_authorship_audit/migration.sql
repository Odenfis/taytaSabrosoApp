BEGIN TRY

BEGIN TRAN;

-- Prueba de autoría conservada con la escritura auditada.
ALTER TABLE [dbo].[auditoria_operaciones] ADD [client_op_id] NVARCHAR(36) NULL;
ALTER TABLE [dbo].[auditoria_operaciones] ADD [prueba_documento] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[auditoria_operaciones] ADD [prueba_firma] NVARCHAR(512) NULL;

CREATE NONCLUSTERED INDEX [auditoria_operaciones_client_op_id_idx] ON [dbo].[auditoria_operaciones]([client_op_id]);

-- Asunción explícita de una operación firmada por otro usuario.
CREATE TABLE [dbo].[auditoria_asuncion_offline] (
    [id] NVARCHAR(36) NOT NULL,
    [client_op_id] NVARCHAR(36) NOT NULL,
    [autor_usuario_id] NVARCHAR(36) NOT NULL,
    [asumido_por_usuario_id] NVARCHAR(36) NOT NULL,
    [dispositivo_id] NVARCHAR(36) NOT NULL,
    [empresa_id] NVARCHAR(36) NOT NULL,
    [huella_documento] VARCHAR(64) NOT NULL,
    [creado_en] DATETIME2 NOT NULL CONSTRAINT [auditoria_asuncion_offline_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [auditoria_asuncion_offline_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [auditoria_asuncion_offline_client_op_id_key] ON [dbo].[auditoria_asuncion_offline]([client_op_id]);
CREATE NONCLUSTERED INDEX [auditoria_asuncion_offline_autor_usuario_id_creado_en_idx] ON [dbo].[auditoria_asuncion_offline]([autor_usuario_id], [creado_en]);
CREATE NONCLUSTERED INDEX [auditoria_asuncion_offline_asumido_por_usuario_id_creado_en_idx] ON [dbo].[auditoria_asuncion_offline]([asumido_por_usuario_id], [creado_en]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
