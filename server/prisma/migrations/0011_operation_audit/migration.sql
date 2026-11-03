CREATE TABLE [dbo].[auditoria_operaciones] (
  [id] NVARCHAR(36) NOT NULL,
  [actor_usuario_id] NVARCHAR(36) NOT NULL,
  [dispositivo_id] NVARCHAR(36) NOT NULL,
  [empresa_id] NVARCHAR(36) NOT NULL,
  [accion] NVARCHAR(100) NOT NULL,
  [entidad_id] NVARCHAR(36) NOT NULL,
  [creado_en] DATETIME2 NOT NULL CONSTRAINT [auditoria_operaciones_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [auditoria_operaciones_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE INDEX [auditoria_operaciones_empresa_id_creado_en_idx] ON [dbo].[auditoria_operaciones]([empresa_id], [creado_en]);
CREATE INDEX [auditoria_operaciones_actor_usuario_id_creado_en_idx] ON [dbo].[auditoria_operaciones]([actor_usuario_id], [creado_en]);
