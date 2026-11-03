CREATE TABLE [dbo].[claves_firma_offline] (
  [id] NVARCHAR(36) NOT NULL,
  [usuario_id] NVARCHAR(36) NOT NULL,
  [dispositivo_id] NVARCHAR(36) NOT NULL,
  [huella] VARCHAR(64) NOT NULL,
  [clave_publica] NVARCHAR(1000) NOT NULL,
  [creado_en] DATETIME2 NOT NULL CONSTRAINT [claves_firma_offline_creado_en_df] DEFAULT CURRENT_TIMESTAMP,
  [revocado_en] DATETIME2 NULL,
  [revocado_por] NVARCHAR(36) NULL,
  CONSTRAINT [claves_firma_offline_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE INDEX [claves_firma_offline_huella_key] ON [dbo].[claves_firma_offline]([huella]);
CREATE INDEX [claves_firma_offline_usuario_id_dispositivo_id_idx] ON [dbo].[claves_firma_offline]([usuario_id], [dispositivo_id]);
