BEGIN TRANSACTION;
CREATE TABLE [dbo].[transformacion_fichas] (
 [id] NVARCHAR(36) NOT NULL PRIMARY KEY,
 [companyId] NVARCHAR(36) NOT NULL,
 [name] NVARCHAR(150) NOT NULL,
 [sourceId] NVARCHAR(36) NOT NULL,
 [definition] NVARCHAR(MAX) NOT NULL,
 [version] INT NOT NULL DEFAULT 1,
 [active] BIT NOT NULL DEFAULT 1,
 [updatedAt] DATETIME2 NOT NULL
);
CREATE INDEX [transformacion_fichas_companyId_idx] ON [dbo].[transformacion_fichas]([companyId]);
CREATE TABLE [dbo].[transformacion_ejecuciones] (
 [id] NVARCHAR(36) NOT NULL PRIMARY KEY,
 [companyId] NVARCHAR(36) NOT NULL,
 [templateId] NVARCHAR(36) NOT NULL,
 [requestHash] NVARCHAR(64) NOT NULL,
 [snapshot] NVARCHAR(MAX) NOT NULL,
 [actorUserId] NVARCHAR(36) NOT NULL,
 [deviceId] NVARCHAR(100) NOT NULL,
 [createdAt] DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX [transformacion_ejecuciones_companyId_createdAt_idx] ON [dbo].[transformacion_ejecuciones]([companyId], [createdAt]);
ALTER TABLE [dbo].[transformacion_fichas] ADD CONSTRAINT [transformacion_fichas_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[empresas]([id]);
ALTER TABLE [dbo].[transformacion_fichas] ADD CONSTRAINT [transformacion_fichas_sourceId_fkey] FOREIGN KEY ([sourceId]) REFERENCES [dbo].[insumos]([id]);
ALTER TABLE [dbo].[transformacion_ejecuciones] ADD CONSTRAINT [transformacion_ejecuciones_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[empresas]([id]);
ALTER TABLE [dbo].[transformacion_ejecuciones] ADD CONSTRAINT [transformacion_ejecuciones_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[transformacion_fichas]([id]);
ALTER TABLE [dbo].[movimientos_kardex] ADD [transformacion_id] NVARCHAR(36) NULL;
ALTER TABLE [dbo].[movimientos_kardex] ADD CONSTRAINT [movimientos_kardex_transformacion_id_fkey] FOREIGN KEY ([transformacion_id]) REFERENCES [dbo].[transformacion_ejecuciones]([id]);
COMMIT;
