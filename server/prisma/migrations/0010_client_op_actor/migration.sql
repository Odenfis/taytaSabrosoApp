-- Las operaciones antiguas carecen de identidad verificable; no se atribuyen.
ALTER TABLE [dbo].[operaciones_cliente] ADD [actor_usuario_id] NVARCHAR(36) NULL;
CREATE INDEX [operaciones_cliente_actor_usuario_id_creado_en_idx]
  ON [dbo].[operaciones_cliente]([actor_usuario_id], [creado_en]);
