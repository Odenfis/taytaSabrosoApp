BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[companies] (
    [id] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [tradeName] NVARCHAR(120) NOT NULL,
    [ruc] NVARCHAR(20) NOT NULL,
    [specialty] NVARCHAR(200) NOT NULL,
    [themeColor] NVARCHAR(20) NOT NULL,
    [accentColor] NVARCHAR(20) NOT NULL,
    [badgeText] NVARCHAR(80) NOT NULL,
    [address] NVARCHAR(200) NOT NULL,
    CONSTRAINT [companies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [companies_ruc_key] UNIQUE NONCLUSTERED ([ruc])
);

-- CreateTable
CREATE TABLE [dbo].[devices] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [name] NVARCHAR(100) NOT NULL,
    [terminalCode] NVARCHAR(30) NOT NULL,
    [lastSeenAt] DATETIME2 NOT NULL CONSTRAINT [devices_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    [isActive] BIT NOT NULL CONSTRAINT [devices_isActive_df] DEFAULT 1,
    CONSTRAINT [devices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [devices_terminalCode_key] UNIQUE NONCLUSTERED ([terminalCode])
);

-- CreateTable
CREATE TABLE [dbo].[numbering_sequences] (
    [companyId] NVARCHAR(36) NOT NULL,
    [entity] NVARCHAR(50) NOT NULL,
    [lastNumber] INT NOT NULL CONSTRAINT [numbering_sequences_lastNumber_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [numbering_sequences_pkey] PRIMARY KEY CLUSTERED ([companyId],[entity])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [name] NVARCHAR(120) NOT NULL,
    [pinHash] NVARCHAR(200) NOT NULL,
    [passwordHash] NVARCHAR(200),
    [role] NVARCHAR(20) NOT NULL CONSTRAINT [users_role_df] DEFAULT 'Cajero',
    [terminal] NVARCHAR(100) NOT NULL,
    [avatarUrl] NVARCHAR(1000),
    [assignedCompanyId] NVARCHAR(36),
    [isActive] BIT NOT NULL CONSTRAINT [users_isActive_df] DEFAULT 1,
    [isDeleted] BIT NOT NULL CONSTRAINT [users_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [users_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[sessions] (
    [id] NVARCHAR(36) NOT NULL,
    [userId] NVARCHAR(36) NOT NULL,
    [deviceId] NVARCHAR(36) NOT NULL,
    [tokenHash] NVARCHAR(200) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [sessions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [sessions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sessions_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[tables] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [number] NVARCHAR(20) NOT NULL,
    [capacity] INT NOT NULL,
    [zone] NVARCHAR(30) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [tables_status_df] DEFAULT 'libre',
    [occupiedSince] NVARCHAR(30),
    [minutesElapsed] INT,
    [currentOrderId] NVARCHAR(36),
    [waiter] NVARCHAR(100),
    [notes] NVARCHAR(500),
    [isDeleted] BIT NOT NULL CONSTRAINT [tables_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [tables_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tables_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [tables_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[products] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [description] NVARCHAR(500) NOT NULL,
    [price] DECIMAL(12,2) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [image] NVARCHAR(1000) NOT NULL,
    [available] BIT NOT NULL CONSTRAINT [products_available_df] DEFAULT 1,
    [hasRecipe] BIT NOT NULL CONSTRAINT [products_hasRecipe_df] DEFAULT 0,
    [isDeleted] BIT NOT NULL CONSTRAINT [products_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [products_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [products_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [products_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[orders] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [ticketNumber] NVARCHAR(30) NOT NULL,
    [tableId] NVARCHAR(36),
    [tableNumber] NVARCHAR(20),
    [zone] NVARCHAR(30) NOT NULL,
    [waiter] NVARCHAR(100) NOT NULL,
    [createdAt] NVARCHAR(30) NOT NULL,
    [createdUtc] DATETIME2 NOT NULL CONSTRAINT [orders_createdUtc_df] DEFAULT CURRENT_TIMESTAMP,
    [subtotal] DECIMAL(12,2) NOT NULL,
    [igv] DECIMAL(12,2) NOT NULL,
    [total] DECIMAL(12,2) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [orders_status_df] DEFAULT 'abierto',
    [paymentMethod] NVARCHAR(100),
    [amountReceived] DECIMAL(12,2),
    [change] DECIMAL(12,2),
    [closedAt] NVARCHAR(30),
    [closedUtc] DATETIME2,
    [clientOpId] NVARCHAR(36) NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [orders_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [orders_version_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [orders_clientOpId_key] UNIQUE NONCLUSTERED ([clientOpId])
);

-- CreateTable
CREATE TABLE [dbo].[order_items] (
    [id] NVARCHAR(36) NOT NULL,
    [orderId] NVARCHAR(36) NOT NULL,
    [productId] NVARCHAR(36),
    [name] NVARCHAR(150) NOT NULL,
    [price] DECIMAL(12,2) NOT NULL,
    [quantity] DECIMAL(12,2) NOT NULL,
    [notes] NVARCHAR(500),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [order_items_status_df] DEFAULT 'agregado',
    [addedAt] NVARCHAR(30) NOT NULL,
    CONSTRAINT [order_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[transactions] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [time] NVARCHAR(30) NOT NULL,
    [date] NVARCHAR(30) NOT NULL,
    [timestamp] DATETIME2 NOT NULL,
    [type] NVARCHAR(50) NOT NULL,
    [description] NVARCHAR(300) NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [isIncome] BIT NOT NULL CONSTRAINT [transactions_isIncome_df] DEFAULT 1,
    [paymentMethod] NVARCHAR(100),
    [customPaymentMethodId] NVARCHAR(36),
    [bankAccountId] NVARCHAR(36),
    [bankAccountAlias] NVARCHAR(200),
    [shift] NVARCHAR(10),
    [referenceNumber] NVARCHAR(100),
    [tableNumber] NVARCHAR(20),
    [orderId] NVARCHAR(36),
    [ticketNumber] NVARCHAR(30),
    [clientOpId] NVARCHAR(36) NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [transactions_isDeleted_df] DEFAULT 0,
    CONSTRAINT [transactions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [transactions_clientOpId_key] UNIQUE NONCLUSTERED ([clientOpId])
);

-- CreateTable
CREATE TABLE [dbo].[bank_accounts] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [bankName] NVARCHAR(80) NOT NULL,
    [accountNumber] NVARCHAR(50) NOT NULL,
    [cci] NVARCHAR(60),
    [accountType] NVARCHAR(20) NOT NULL,
    [currency] NVARCHAR(5) NOT NULL CONSTRAINT [bank_accounts_currency_df] DEFAULT 'PEN',
    [holderName] NVARCHAR(150) NOT NULL,
    [alias] NVARCHAR(200) NOT NULL,
    [currentBalance] DECIMAL(12,2) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [bank_accounts_isActive_df] DEFAULT 1,
    [notes] NVARCHAR(500),
    [isDeleted] BIT NOT NULL CONSTRAINT [bank_accounts_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [bank_accounts_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [bank_accounts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [bank_accounts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[payment_methods] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [name] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(40) NOT NULL,
    [bankAccountId] NVARCHAR(36),
    [bankAccountAlias] NVARCHAR(200),
    [commissionPct] DECIMAL(5,2),
    [requiresReferenceNumber] BIT NOT NULL CONSTRAINT [payment_methods_requiresReferenceNumber_df] DEFAULT 0,
    [icon] NVARCHAR(50) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [payment_methods_isActive_df] DEFAULT 1,
    [isDeleted] BIT NOT NULL CONSTRAINT [payment_methods_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [payment_methods_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [payment_methods_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [payment_methods_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[shift_records] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [shift] NVARCHAR(10) NOT NULL,
    [openedAt] NVARCHAR(30) NOT NULL,
    [openedUtc] DATETIME2 NOT NULL CONSTRAINT [shift_records_openedUtc_df] DEFAULT CURRENT_TIMESTAMP,
    [closedAt] NVARCHAR(30),
    [closedUtc] DATETIME2,
    [openedBy] NVARCHAR(100) NOT NULL,
    [closedBy] NVARCHAR(100),
    [initialCash] DECIMAL(12,2) NOT NULL,
    [finalCashReported] DECIMAL(12,2),
    [systemCashExpected] DECIMAL(12,2),
    [cashDifference] DECIMAL(12,2),
    [totalSales] DECIMAL(12,2) NOT NULL CONSTRAINT [shift_records_totalSales_df] DEFAULT 0,
    [totalExpenses] DECIMAL(12,2) NOT NULL CONSTRAINT [shift_records_totalExpenses_df] DEFAULT 0,
    [cardSales] DECIMAL(12,2) NOT NULL CONSTRAINT [shift_records_cardSales_df] DEFAULT 0,
    [digitalWalletSales] DECIMAL(12,2) NOT NULL CONSTRAINT [shift_records_digitalWalletSales_df] DEFAULT 0,
    [bankTransferSales] DECIMAL(12,2) NOT NULL CONSTRAINT [shift_records_bankTransferSales_df] DEFAULT 0,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [shift_records_status_df] DEFAULT 'cerrado',
    [notes] NVARCHAR(500),
    CONSTRAINT [shift_records_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[company_shifts] (
    [companyId] NVARCHAR(36) NOT NULL,
    [currentShift] NVARCHAR(10) NOT NULL CONSTRAINT [company_shifts_currentShift_df] DEFAULT 'D├¡a',
    [openedAt] NVARCHAR(30) NOT NULL,
    [openedUtc] DATETIME2 NOT NULL CONSTRAINT [company_shifts_openedUtc_df] DEFAULT CURRENT_TIMESTAMP,
    [openedBy] NVARCHAR(100) NOT NULL,
    [initialCash] DECIMAL(12,2) NOT NULL CONSTRAINT [company_shifts_initialCash_df] DEFAULT 350,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [company_shifts_pkey] PRIMARY KEY CLUSTERED ([companyId])
);

-- CreateTable
CREATE TABLE [dbo].[insumos] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(80) NOT NULL,
    [unit] NVARCHAR(10) NOT NULL,
    [currentStock] DECIMAL(12,4) NOT NULL,
    [minStock] DECIMAL(12,4) NOT NULL,
    [costPerUnit] DECIMAL(12,4) NOT NULL,
    [lastPurchaseDate] NVARCHAR(30),
    [lastPurchaseUtc] DATETIME2,
    [isDeleted] BIT NOT NULL CONSTRAINT [insumos_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [insumos_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [insumos_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [insumos_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [insumos_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[recipes] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [productId] NVARCHAR(36),
    [productName] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [portions] INT NOT NULL CONSTRAINT [recipes_portions_df] DEFAULT 1,
    [salePrice] DECIMAL(12,2) NOT NULL,
    [totalCost] DECIMAL(12,2) NOT NULL,
    [theoreticalFoodCostPct] DECIMAL(5,2) NOT NULL,
    [preparationNotes] NVARCHAR(1000),
    [isDeleted] BIT NOT NULL CONSTRAINT [recipes_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [recipes_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [recipes_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [recipes_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[recipe_ingredients] (
    [id] NVARCHAR(36) NOT NULL,
    [recipeId] NVARCHAR(36) NOT NULL,
    [insumoId] NVARCHAR(36),
    [insumoName] NVARCHAR(150) NOT NULL,
    [quantity] DECIMAL(12,4) NOT NULL,
    [unit] NVARCHAR(10) NOT NULL,
    [costPerUnit] DECIMAL(12,4) NOT NULL,
    [subtotalCost] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [recipe_ingredients_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchases] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [category] NVARCHAR(40) NOT NULL,
    [documentStatus] NVARCHAR(20) NOT NULL CONSTRAINT [purchases_documentStatus_df] DEFAULT 'provisional',
    [provisionalNoteNumber] NVARCHAR(60),
    [invoiceNumber] NVARCHAR(60) NOT NULL,
    [supplierName] NVARCHAR(200) NOT NULL,
    [supplierRuc] NVARCHAR(20) NOT NULL,
    [date] NVARCHAR(30) NOT NULL,
    [time] NVARCHAR(30) NOT NULL,
    [purchasedUtc] DATETIME2 NOT NULL CONSTRAINT [purchases_purchasedUtc_df] DEFAULT CURRENT_TIMESTAMP,
    [shift] NVARCHAR(10) NOT NULL,
    [subtotal] DECIMAL(12,2) NOT NULL,
    [igv] DECIMAL(12,2) NOT NULL,
    [total] DECIMAL(12,2) NOT NULL,
    [paymentStatus] NVARCHAR(50) NOT NULL,
    [paidFromCash] BIT NOT NULL CONSTRAINT [purchases_paidFromCash_df] DEFAULT 0,
    [bankAccountId] NVARCHAR(36),
    [bankAccountAlias] NVARCHAR(200),
    [notes] NVARCHAR(500),
    [regularizedAt] NVARCHAR(30),
    [regularizedBy] NVARCHAR(100),
    [clientOpId] NVARCHAR(36) NOT NULL,
    [isDeleted] BIT NOT NULL CONSTRAINT [purchases_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [purchases_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchases_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [purchases_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [purchases_clientOpId_key] UNIQUE NONCLUSTERED ([clientOpId])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_items] (
    [id] NVARCHAR(36) NOT NULL,
    [purchaseId] NVARCHAR(36) NOT NULL,
    [insumoId] NVARCHAR(36),
    [insumoName] NVARCHAR(150) NOT NULL,
    [quantity] DECIMAL(12,4) NOT NULL,
    [unit] NVARCHAR(10) NOT NULL,
    [unitCost] DECIMAL(12,4) NOT NULL,
    [totalCost] DECIMAL(12,2) NOT NULL,
    CONSTRAINT [purchase_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[kardex_movements] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36) NOT NULL,
    [timestamp] DATETIME2 NOT NULL,
    [date] NVARCHAR(30) NOT NULL,
    [time] NVARCHAR(30) NOT NULL,
    [insumoId] NVARCHAR(36),
    [insumoName] NVARCHAR(150) NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [referenceDoc] NVARCHAR(200) NOT NULL,
    [quantity] DECIMAL(12,4) NOT NULL,
    [unit] NVARCHAR(10) NOT NULL,
    [unitCost] DECIMAL(12,4) NOT NULL,
    [totalCost] DECIMAL(12,2) NOT NULL,
    [stockBefore] DECIMAL(12,4) NOT NULL,
    [stockAfter] DECIMAL(12,4) NOT NULL,
    [notes] NVARCHAR(300),
    [clientOpId] NVARCHAR(36) NOT NULL,
    CONSTRAINT [kardex_movements_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [kardex_movements_clientOpId_key] UNIQUE NONCLUSTERED ([clientOpId])
);

-- CreateTable
CREATE TABLE [dbo].[printers] (
    [id] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [name] NVARCHAR(200) NOT NULL,
    [role] NVARCHAR(30) NOT NULL,
    [connectionType] NVARCHAR(30) NOT NULL,
    [ipAddress] NVARCHAR(50),
    [port] INT CONSTRAINT [printers_port_df] DEFAULT 9100,
    [paperWidth] NVARCHAR(10) NOT NULL CONSTRAINT [printers_paperWidth_df] DEFAULT '80mm',
    [autoCut] BIT NOT NULL CONSTRAINT [printers_autoCut_df] DEFAULT 1,
    [beepOnPrint] BIT NOT NULL CONSTRAINT [printers_beepOnPrint_df] DEFAULT 0,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [printers_status_df] DEFAULT 'online',
    [isEnabled] BIT NOT NULL CONSTRAINT [printers_isEnabled_df] DEFAULT 1,
    [isDeleted] BIT NOT NULL CONSTRAINT [printers_isDeleted_df] DEFAULT 0,
    [version] INT NOT NULL CONSTRAINT [printers_version_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [printers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [printers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[printer_categories] (
    [id] NVARCHAR(36) NOT NULL,
    [printerId] NVARCHAR(36) NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [idx] INT NOT NULL CONSTRAINT [printer_categories_idx_df] DEFAULT 0,
    CONSTRAINT [printer_categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [printer_categories_printerId_category_key] UNIQUE NONCLUSTERED ([printerId],[category])
);

-- CreateTable
CREATE TABLE [dbo].[client_ops] (
    [id] NVARCHAR(36) NOT NULL,
    [deviceId] NVARCHAR(36) NOT NULL,
    [companyId] NVARCHAR(36),
    [entity] NVARCHAR(50) NOT NULL,
    [operation] NVARCHAR(100) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [clientOpId] NVARCHAR(36) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [client_ops_status_df] DEFAULT 'PENDING',
    [attemptCount] INT NOT NULL CONSTRAINT [client_ops_attemptCount_df] DEFAULT 0,
    [lastError] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [client_ops_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [processedAt] DATETIME2,
    CONSTRAINT [client_ops_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [client_ops_clientOpId_key] UNIQUE NONCLUSTERED ([clientOpId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [devices_companyId_idx] ON [dbo].[devices]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_companyId_idx] ON [dbo].[users]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sessions_userId_idx] ON [dbo].[sessions]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sessions_deviceId_idx] ON [dbo].[sessions]([deviceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [tables_companyId_status_idx] ON [dbo].[tables]([companyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [tables_companyId_zone_idx] ON [dbo].[tables]([companyId], [zone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_companyId_category_idx] ON [dbo].[products]([companyId], [category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_companyId_available_idx] ON [dbo].[products]([companyId], [available]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_companyId_status_idx] ON [dbo].[orders]([companyId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_tableId_idx] ON [dbo].[orders]([tableId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_createdUtc_idx] ON [dbo].[orders]([createdUtc]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_ticketNumber_idx] ON [dbo].[orders]([ticketNumber]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [order_items_orderId_idx] ON [dbo].[order_items]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transactions_companyId_idx] ON [dbo].[transactions]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transactions_timestamp_idx] ON [dbo].[transactions]([timestamp]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transactions_orderId_idx] ON [dbo].[transactions]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transactions_bankAccountId_idx] ON [dbo].[transactions]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [bank_accounts_companyId_idx] ON [dbo].[bank_accounts]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [payment_methods_companyId_idx] ON [dbo].[payment_methods]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [payment_methods_bankAccountId_idx] ON [dbo].[payment_methods]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shift_records_companyId_shift_idx] ON [dbo].[shift_records]([companyId], [shift]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [shift_records_closedUtc_idx] ON [dbo].[shift_records]([closedUtc]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [insumos_companyId_idx] ON [dbo].[insumos]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [insumos_category_idx] ON [dbo].[insumos]([category]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [recipes_companyId_idx] ON [dbo].[recipes]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [recipes_productId_idx] ON [dbo].[recipes]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [recipe_ingredients_recipeId_idx] ON [dbo].[recipe_ingredients]([recipeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchases_companyId_idx] ON [dbo].[purchases]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchases_bankAccountId_idx] ON [dbo].[purchases]([bankAccountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [purchase_items_purchaseId_idx] ON [dbo].[purchase_items]([purchaseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [kardex_movements_companyId_idx] ON [dbo].[kardex_movements]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [kardex_movements_insumoId_timestamp_idx] ON [dbo].[kardex_movements]([insumoId], [timestamp]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [kardex_movements_type_idx] ON [dbo].[kardex_movements]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [printers_companyId_idx] ON [dbo].[printers]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [client_ops_deviceId_status_idx] ON [dbo].[client_ops]([deviceId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [client_ops_createdAt_idx] ON [dbo].[client_ops]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[devices] ADD CONSTRAINT [devices_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[numbering_sequences] ADD CONSTRAINT [numbering_sequences_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sessions] ADD CONSTRAINT [sessions_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sessions] ADD CONSTRAINT [sessions_deviceId_fkey] FOREIGN KEY ([deviceId]) REFERENCES [dbo].[devices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tables] ADD CONSTRAINT [tables_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_tableId_fkey] FOREIGN KEY ([tableId]) REFERENCES [dbo].[tables]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_items] ADD CONSTRAINT [order_items_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_items] ADD CONSTRAINT [order_items_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transactions] ADD CONSTRAINT [transactions_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transactions] ADD CONSTRAINT [transactions_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transactions] ADD CONSTRAINT [transactions_bankAccountId_fkey] FOREIGN KEY ([bankAccountId]) REFERENCES [dbo].[bank_accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transactions] ADD CONSTRAINT [transactions_customPaymentMethodId_fkey] FOREIGN KEY ([customPaymentMethodId]) REFERENCES [dbo].[payment_methods]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[bank_accounts] ADD CONSTRAINT [bank_accounts_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payment_methods] ADD CONSTRAINT [payment_methods_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payment_methods] ADD CONSTRAINT [payment_methods_bankAccountId_fkey] FOREIGN KEY ([bankAccountId]) REFERENCES [dbo].[bank_accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[shift_records] ADD CONSTRAINT [shift_records_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_shifts] ADD CONSTRAINT [company_shifts_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[insumos] ADD CONSTRAINT [insumos_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[recipes] ADD CONSTRAINT [recipes_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[recipes] ADD CONSTRAINT [recipes_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[recipe_ingredients] ADD CONSTRAINT [recipe_ingredients_recipeId_fkey] FOREIGN KEY ([recipeId]) REFERENCES [dbo].[recipes]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[recipe_ingredients] ADD CONSTRAINT [recipe_ingredients_insumoId_fkey] FOREIGN KEY ([insumoId]) REFERENCES [dbo].[insumos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchases] ADD CONSTRAINT [purchases_bankAccountId_fkey] FOREIGN KEY ([bankAccountId]) REFERENCES [dbo].[bank_accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseId_fkey] FOREIGN KEY ([purchaseId]) REFERENCES [dbo].[purchases]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_insumoId_fkey] FOREIGN KEY ([insumoId]) REFERENCES [dbo].[insumos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[kardex_movements] ADD CONSTRAINT [kardex_movements_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[kardex_movements] ADD CONSTRAINT [kardex_movements_insumoId_fkey] FOREIGN KEY ([insumoId]) REFERENCES [dbo].[insumos]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[printers] ADD CONSTRAINT [printers_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[printer_categories] ADD CONSTRAINT [printer_categories_printerId_fkey] FOREIGN KEY ([printerId]) REFERENCES [dbo].[printers]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[client_ops] ADD CONSTRAINT [client_ops_deviceId_fkey] FOREIGN KEY ([deviceId]) REFERENCES [dbo].[devices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[client_ops] ADD CONSTRAINT [client_ops_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

