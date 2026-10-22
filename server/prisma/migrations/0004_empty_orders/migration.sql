-- Los pedidos anteriores tienen historial incierto: nunca borrarlos automáticamente.
ALTER TABLE [dbo].[pedidos] ADD [primer_despacho_utc] DATETIME2 NULL;
ALTER TABLE [dbo].[pedidos] ADD [historial_despacho_conocido] BIT NOT NULL CONSTRAINT [pedidos_historial_legacy_df] DEFAULT 0 WITH VALUES;
ALTER TABLE [dbo].[pedidos] DROP CONSTRAINT [pedidos_historial_legacy_df];
ALTER TABLE [dbo].[pedidos] ADD CONSTRAINT [pedidos_historial_despacho_conocido_df] DEFAULT 1 FOR [historial_despacho_conocido];
CREATE TABLE [dbo].[resultados_pedidos] (
  [id] NVARCHAR(100) NOT NULL,
  [pedido_id] NVARCHAR(36) NULL,
  [resultado] NVARCHAR(MAX) NOT NULL,
  [creado_utc] DATETIME2 NOT NULL CONSTRAINT [resultados_pedidos_creado_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [resultados_pedidos_pkey] PRIMARY KEY ([id])
);
CREATE NONCLUSTERED INDEX [resultados_pedidos_pedido_id_idx] ON [dbo].[resultados_pedidos]([pedido_id]);
