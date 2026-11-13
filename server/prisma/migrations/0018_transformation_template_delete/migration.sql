ALTER TABLE [dbo].[transformacion_fichas] ADD [is_deleted] BIT NOT NULL CONSTRAINT [transformacion_fichas_is_deleted_df] DEFAULT 0;
