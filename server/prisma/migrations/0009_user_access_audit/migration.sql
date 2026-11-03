BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[auditoria_acceso_usuarios] (
    [id] NVARCHAR(36) NOT NULL,
    [actor_usuario_id] NVARCHAR(36) NOT NULL,
    [usuario_afectado_id] NVARCHAR(36) NOT NULL,
    [dispositivo_id] NVARCHAR(36) NOT NULL,
    [accion] NVARCHAR(40) NOT NULL,
    [rol_anterior] NVARCHAR(20),
    [rol_nuevo] NVARCHAR(20),
    [empresa_anterior_id] NVARCHAR(36),
    [empresa_nueva_id] NVARCHAR(36),
    [activo_anterior] BIT,
    [activo_nuevo] BIT NOT NULL,
    [pin_restablecido] BIT NOT NULL CONSTRAINT [auditoria_acceso_usuarios_pin_restablecido_df] DEFAULT 0,
    [creado_en] DATETIME2 NOT NULL CONSTRAINT [auditoria_acceso_usuarios_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [auditoria_acceso_usuarios_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [auditoria_acceso_usuarios_usuario_afectado_id_creado_en_idx] ON [dbo].[auditoria_acceso_usuarios]([usuario_afectado_id], [creado_en]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

