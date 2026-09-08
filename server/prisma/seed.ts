import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const newUuid = () => randomUUID();

async function main() {
  console.log('Limpiando datos existentes...');

  await prisma.printerCategory.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.clientOp.deleteMany();
  await prisma.session.deleteMany();
  await prisma.device.deleteMany();
  await prisma.user.deleteMany();
  await prisma.numberingSequence.deleteMany();
  await prisma.companyShift.deleteMany();
  await prisma.shiftRecord.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.kardexMovement.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.insumo.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.table.deleteMany();
  await prisma.customPaymentMethod.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.company.deleteMany();

  // ================= COMPANIES =================
  console.log('Sembrando empresas...');
  await prisma.company.createMany({
    data: [
      {
        id: 'el-tayta',
        name: 'El Tayta - Restaurante & Tradición',
        tradeName: 'El Tayta',
        ruc: '20601234567',
        specialty: 'Comida Criolla, Pescados & Mariscos',
        themeColor: '#ffb597',
        accentColor: '#823b19',
        badgeText: 'Tradición Criolla',
        address: 'Av. La Marina 1840, San Miguel, Lima',
      },
      {
        id: 'el-sabroso',
        name: 'El Sabroso - Brasas & Grill Sazón',
        tradeName: 'El Sabroso',
        ruc: '20609876543',
        specialty: 'Pollos a la Brasa, Parrillas & Broaster',
        themeColor: '#ebc246',
        accentColor: '#6f4f00',
        badgeText: 'Brasas & Parrillas',
        address: 'Av. Primavera 620, Surco, Lima',
      },
    ],
  });

  // ================= BANK ACCOUNTS =================
  console.log('Sembrando cuentas bancarias...');
  await prisma.bankAccount.createMany({
    data: [
      {
        id: 'bank-tayta-bcp',
        companyId: 'el-tayta',
        bankName: 'BCP',
        accountNumber: '193-9482103-0-12',
        cci: '002-193-009482103012-14',
        accountType: 'Corriente',
        currency: 'PEN',
        holderName: 'El Tayta Gastronomía E.I.R.L.',
        alias: 'BCP Soles - El Tayta Operaciones',
        currentBalance: 8420.5,
        isActive: true,
        notes: 'Cuenta principal para transferencias a proveedores y recaudación POS Niubiz.',
      },
      {
        id: 'bank-tayta-bbva',
        companyId: 'el-tayta',
        bankName: 'BBVA',
        accountNumber: '0011-0342-0200889123',
        cci: '011-342-000200889123-55',
        accountType: 'Ahorros',
        currency: 'PEN',
        holderName: 'El Tayta Gastronomía E.I.R.L.',
        alias: 'BBVA Soles - El Tayta Plin & Caja',
        currentBalance: 3250.0,
        isActive: true,
        notes: 'Asociada al número de Plin del restaurante.',
      },
      {
        id: 'bank-sabroso-bcp',
        companyId: 'el-sabroso',
        bankName: 'BCP',
        accountNumber: '194-8831920-0-88',
        cci: '002-194-008831920088-29',
        accountType: 'Corriente',
        currency: 'PEN',
        holderName: 'El Sabroso Brasas S.A.C.',
        alias: 'BCP Soles - El Sabroso Principal',
        currentBalance: 6180.0,
        isActive: true,
        notes: 'Recaudación Yape y pagos avícolas.',
      },
      {
        id: 'bank-sabroso-interbank',
        companyId: 'el-sabroso',
        bankName: 'Interbank',
        accountNumber: '200-3001882910',
        cci: '003-200-003001882910-61',
        accountType: 'Corriente',
        currency: 'PEN',
        holderName: 'El Sabroso Brasas S.A.C.',
        alias: 'Interbank Soles - POS Izipay',
        currentBalance: 4420.0,
        isActive: true,
        notes: 'Cuenta de abono directo de liquidaciones Izipay.',
      },
    ],
  });

  // ================= PAYMENT METHODS =================
  console.log('Sembrando métodos de pago...');
  await prisma.customPaymentMethod.createMany({
    data: [
      { id: 'pm-tayta-cash', companyId: 'el-tayta', name: 'Efectivo en Caja', category: 'Efectivo', commissionPct: 0, requiresReferenceNumber: false, icon: 'payments', isActive: true },
      { id: 'pm-tayta-yape', companyId: 'el-tayta', name: 'Yape BCP El Tayta', category: 'Billetera Digital', bankAccountId: 'bank-tayta-bcp', bankAccountAlias: 'BCP Soles - El Tayta Operaciones', commissionPct: 0, requiresReferenceNumber: true, icon: 'qr_code_2', isActive: true },
      { id: 'pm-tayta-plin', companyId: 'el-tayta', name: 'Plin BBVA El Tayta', category: 'Billetera Digital', bankAccountId: 'bank-tayta-bbva', bankAccountAlias: 'BBVA Soles - El Tayta Plin & Caja', commissionPct: 0, requiresReferenceNumber: true, icon: 'smartphone', isActive: true },
      { id: 'pm-tayta-niubiz', companyId: 'el-tayta', name: 'POS Niubiz (Visa / Mastercard)', category: 'Tarjeta / POS', bankAccountId: 'bank-tayta-bcp', bankAccountAlias: 'BCP Soles - El Tayta Operaciones', commissionPct: 3.45, requiresReferenceNumber: true, icon: 'credit_card', isActive: true },
      { id: 'pm-tayta-transferencia', companyId: 'el-tayta', name: 'Transferencia Directa BCP', category: 'Transferencia Bancaria', bankAccountId: 'bank-tayta-bcp', bankAccountAlias: 'BCP Soles - El Tayta Operaciones', commissionPct: 0, requiresReferenceNumber: true, icon: 'account_balance', isActive: true },
      { id: 'pm-sabroso-cash', companyId: 'el-sabroso', name: 'Efectivo en Caja', category: 'Efectivo', commissionPct: 0, requiresReferenceNumber: false, icon: 'payments', isActive: true },
      { id: 'pm-sabroso-yape', companyId: 'el-sabroso', name: 'Yape BCP El Sabroso', category: 'Billetera Digital', bankAccountId: 'bank-sabroso-bcp', bankAccountAlias: 'BCP Soles - El Sabroso Principal', commissionPct: 0, requiresReferenceNumber: true, icon: 'qr_code_2', isActive: true },
      { id: 'pm-sabroso-izipay', companyId: 'el-sabroso', name: 'POS Izipay Inalámbrico', category: 'Tarjeta / POS', bankAccountId: 'bank-sabroso-interbank', bankAccountAlias: 'Interbank Soles - POS Izipay', commissionPct: 3.2, requiresReferenceNumber: true, icon: 'credit_card', isActive: true },
      { id: 'pm-sabroso-transferencia', companyId: 'el-sabroso', name: 'Transferencia Directa BCP / Interbank', category: 'Transferencia Bancaria', bankAccountId: 'bank-sabroso-bcp', bankAccountAlias: 'BCP Soles - El Sabroso Principal', commissionPct: 0, requiresReferenceNumber: true, icon: 'account_balance', isActive: true },
    ],
  });

  // ================= PRINTERS =================
  console.log('Sembrando impresoras...');
  await prisma.printer.createMany({
    data: [
      { id: 'prn-01', companyId: null, name: 'Ticketera Cocina 1 (Cevichería & Platos Fríos)', role: 'cocina_fria', connectionType: 'LAN_TCP', ipAddress: '192.168.1.200', port: 9100, paperWidth: '80mm', autoCut: true, beepOnPrint: true, status: 'online', isEnabled: true },
      { id: 'prn-02', companyId: null, name: 'Ticketera Cocina 2 (Horno Brasas & Parrillas)', role: 'cocina_caliente', connectionType: 'LAN_TCP', ipAddress: '192.168.1.201', port: 9100, paperWidth: '80mm', autoCut: true, beepOnPrint: true, status: 'online', isEnabled: true },
      { id: 'prn-03', companyId: null, name: 'Ticketera Barra (Bebidas, Licores & Postres)', role: 'barra', connectionType: 'LAN_TCP', ipAddress: '192.168.1.202', port: 9100, paperWidth: '80mm', autoCut: true, beepOnPrint: false, status: 'online', isEnabled: true },
      { id: 'prn-04', companyId: null, name: 'Ticketera Caja Principal (Pre-cuentas & Comprobantes)', role: 'caja', connectionType: 'LAN_TCP', ipAddress: '192.168.1.203', port: 9100, paperWidth: '80mm', autoCut: true, beepOnPrint: false, status: 'online', isEnabled: true },
    ],
  });

  await prisma.printerCategory.createMany({
    data: [
      { id: newUuid(), printerId: 'prn-01', category: 'entradas', idx: 0 },
      { id: newUuid(), printerId: 'prn-01', category: 'platos', idx: 1 },
      { id: newUuid(), printerId: 'prn-02', category: 'brasas', idx: 0 },
      { id: newUuid(), printerId: 'prn-02', category: 'platos', idx: 1 },
      { id: newUuid(), printerId: 'prn-03', category: 'bebidas', idx: 0 },
      { id: newUuid(), printerId: 'prn-03', category: 'postres', idx: 1 },
    ],
  });

  // ================= DEVICES & USERS =================
  console.log('Sembrando dispositivos y usuarios...');
  await prisma.device.create({
    data: {
      id: 'dev-01',
      companyId: null,
      name: 'Terminal Central 01',
      terminalCode: 'TERM-CENTRAL-01',
    },
  });

  await prisma.user.create({
    data: {
      id: 'user-01',
      companyId: null,
      name: 'Carlos M.',
      pinHash: await bcrypt.hash('1004', 10),
      role: 'Administrador',
      terminal: 'Terminal Central 01',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      assignedCompanyId: null,
    },
  });

  // ================= COMPANY SHIFTS & NUMBERING =================
  console.log('Sembrando turnos y numeración...');
  await prisma.companyShift.createMany({
    data: [
      { companyId: 'el-tayta', currentShift: 'Día', openedAt: 'Hoy 07:30 AM', openedBy: 'Carlos M.', initialCash: 350 },
      { companyId: 'el-sabroso', currentShift: 'Día', openedAt: 'Hoy 07:30 AM', openedBy: 'Carlos M.', initialCash: 350 },
    ],
  });

  await prisma.numberingSequence.createMany({
    data: [
      { companyId: 'el-tayta', entity: 'order', lastNumber: 84919 },
      { companyId: 'el-sabroso', entity: 'order', lastNumber: 77210 },
    ],
  });

  // ================= PRODUCTS =================
  console.log('Sembrando productos...');
  await prisma.product.createMany({
    data: [
      { id: 'prod-lomo', companyId: 'el-tayta', name: 'Lomo Saltado Clásico', description: 'Trozos de lomo fino salteados al wok con cebolla, tomate y ají amarillo con papas fritas y arroz.', price: 45.0, category: 'platos', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB_lPCJLocV0DDaLrowzijDWlZx-kEjugmyRf_jYL3yWqIhQbzlWuhvDnROPudgy4XgxEldzIjSVaeSLSSvD5jSVA-DL2MVHehDJ1kLYU9ZsHcwWQGJ9yX39iCqdFwCjQ8ls1DvPfT3icpGQK-nSxWaBCrsBGgMstVOGLd8UsoplJEGVsfu9O1Ee5qYC-8DVs1zCJ5IhIZVcNQtm__Ny8P7kC_OJ4GupaE3-nLutaXl_fRXZTcxSEbP', available: true, hasRecipe: true },
      { id: 'prod-ceviche', companyId: 'el-tayta', name: 'Ceviche Mixto Tradición', description: 'Pescado fresco y mariscos del día al limón con camote glaseado, choclo desgranado y canchita.', price: 42.0, category: 'platos', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBdOy3I31Wj4LW-8xg-TXftxYKjGG8eiHHqkpIvQ8Ok_wDqRXogKKD2LmqrSPHYeTiU_Ax4VcrJ6nO9nCl-guGRyEBtP7JB5rli_CTaS3tXIg9OrD4xKkbuzYLIhaBoT3FKj6U_c7eDYcRZxl7N_7-WNhoJyHm0e_77vAeKW6NdqFeqk53apwb-nq9Z-V0r9FJXULJiyzvWsGaZJPo4l1R4jhRtOFUBaMAcXrA_i1a7smumQOL0SnrK', available: true, hasRecipe: true },
      { id: 'prod-aji', companyId: 'el-tayta', name: 'Ají de Gallina', description: 'Pechuga deshilachada en crema de ají amarillo, nueces y queso con huevo duro y aceituna.', price: 38.0, category: 'platos', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDvDJd7dbh7Abc1leQIBshk9YoMzH19PWNN0a2xbrrYYMRb3faM_HocSJ28kMn4B--SzhUkXgU-FjL8LsMpXkdeZufMPExZbApylu4VD0k9UwV_45g9nBqulaGt6F6qQNdwQFq-NtF1qI-drEeWNMq449e8LSzrS3DuFRY_jfULJI3dFNGYy6xseEsGXrCX6LtK2zdT22pPFjd2Vf2goEt2z8vVRz4N0UJF5S-k1Zf3bkoal9W8HfRI', available: true, hasRecipe: true },
      { id: 'prod-arroz-mariscos', companyId: 'el-tayta', name: 'Arroz con Mariscos', description: 'Arroz criollo sazonado con ají panca y cerveza negra, colmado de langostinos, calamares y conchas.', price: 48.0, category: 'platos', image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-causa', companyId: 'el-tayta', name: 'Causa Limeña de Pollo', description: 'Masa suave de papa amarilla prensada con ají amarillo y limón, rellena de pechuga y palta fuerte.', price: 24.0, category: 'entradas', image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-pisco-sour', companyId: 'el-tayta', name: 'Pisco Sour Clásico', description: 'Pisco Quebranta 100% peruano, zumo de limón recién exprimido, jarabe de goma y amargo de angostura.', price: 25.0, category: 'bebidas', image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-chicha', companyId: 'el-tayta', name: 'Jarra de Chicha Morada (1L)', description: 'Elaborada artesanalmente con maíz morado, piña madura, manzana, canela y clavo de olor.', price: 18.0, category: 'bebidas', image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=500&auto=format&fit=crop&q=80', available: true },
      { id: 'prod-suspiro', companyId: 'el-tayta', name: 'Suspiro a la Limeña', description: 'Dulce tradicional de manjarblanco de yemas coronado con suave merengue al oporto.', price: 18.0, category: 'postres', image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=500&auto=format&fit=crop&q=80', available: true },
      { id: 'prod-sab-cuarto', companyId: 'el-sabroso', name: '1/4 Pollo a la Brasa con Papas', description: 'Pierna o pechuga macerada con especias secretas, horneada a leña con papas fritas crocantes y ensalada.', price: 24.5, category: 'brasas', image: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-medio', companyId: 'el-sabroso', name: '1/2 Pollo a la Brasa Sabroso', description: 'Medio pollo dorado al carbón con porción generosa de papas nativas fritas y cremas.', price: 44.0, category: 'brasas', image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-entero', companyId: 'el-sabroso', name: '1 Pollo a la Brasa Familiar', description: 'Pollo entero marinado a fuego de leña con papas crocantes, ensalada familiar y salsas artesanales.', price: 78.0, category: 'brasas', image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-parrilla', companyId: 'el-sabroso', name: 'Parrilla Mixta El Sabroso', description: 'Bife angus, pechuga parrillera, chuleta de cerdo, anticuchos y chorizo artesanal con papas doradas.', price: 65.0, category: 'brasas', image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-anticucho', companyId: 'el-sabroso', name: 'Anticuchos de Corazón (3 Palos)', description: 'Cortes tiernos macerados en ají panca y vinagre, con papas doradas y choclo tierno.', price: 28.0, category: 'entradas', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-broaster', companyId: 'el-sabroso', name: 'Pollo Broaster Clásico (2 presas)', description: 'Presas crujientes con empanizado especial americano, papas fritas y cremas.', price: 22.0, category: 'brasas', image: 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=500&auto=format&fit=crop&q=80', available: true, hasRecipe: true },
      { id: 'prod-sab-inca', companyId: 'el-sabroso', name: 'Inca Kola 1.5L Helada', description: 'Gaseosa de sabor nacional en presentación retornable de 1.5 litros.', price: 13.0, category: 'bebidas', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80', available: true },
      { id: 'prod-sab-chicha', companyId: 'el-sabroso', name: 'Jarra de Chicha Sabrosa (1L)', description: 'Chicha morada casera bien helada con toque de canela y limón.', price: 15.0, category: 'bebidas', image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=500&auto=format&fit=crop&q=80', available: true },
    ],
  });

  // ================= INSUMOS =================
  console.log('Sembrando insumos (inventario)...');
  await prisma.insumo.createMany({
    data: [
      { id: 'ins-lomo', companyId: 'el-tayta', code: 'INS-001', name: 'Lomo Fino de Res Premium', category: 'Carnes & Aves', unit: 'kg', currentStock: 18.5, minStock: 8.0, costPerUnit: 38.0, lastPurchaseDate: 'Hoy 09:15 AM' },
      { id: 'ins-pollo-entero', companyId: 'el-sabroso', code: 'INS-002', name: 'Pollo Eviscerado Brasa (2.2kg)', category: 'Carnes & Aves', unit: 'un', currentStock: 42, minStock: 20, costPerUnit: 14.5, lastPurchaseDate: 'Hoy 08:30 AM' },
      { id: 'ins-pechuga-pollo', companyId: null, code: 'INS-003', name: 'Pechuga de Pollo Fresca', category: 'Carnes & Aves', unit: 'kg', currentStock: 26.0, minStock: 10.0, costPerUnit: 16.5, lastPurchaseDate: 'Ayer' },
      { id: 'ins-pescado', companyId: 'el-tayta', code: 'INS-004', name: 'Filete de Corvina / Perico Fresco', category: 'Pescados & Mariscos', unit: 'kg', currentStock: 12.0, minStock: 5.0, costPerUnit: 32.0, lastPurchaseDate: 'Hoy 06:00 AM' },
      { id: 'ins-mariscos', companyId: 'el-tayta', code: 'INS-005', name: 'Mixtura de Mariscos (Langostino/Calamar)', category: 'Pescados & Mariscos', unit: 'kg', currentStock: 14.2, minStock: 6.0, costPerUnit: 34.0, lastPurchaseDate: 'Ayer' },
      { id: 'ins-papa-amarilla', companyId: null, code: 'INS-006', name: 'Papa Amarilla / Canchán para Freír', category: 'Verduras & Frutas', unit: 'kg', currentStock: 85.0, minStock: 30.0, costPerUnit: 3.2, lastPurchaseDate: 'Hoy 11:45 AM' },
      { id: 'ins-cebolla-roja', companyId: null, code: 'INS-007', name: 'Cebolla Roja Seleccionada', category: 'Verduras & Frutas', unit: 'kg', currentStock: 38.0, minStock: 15.0, costPerUnit: 2.8, lastPurchaseDate: 'Hoy 11:45 AM' },
      { id: 'ins-limon-sutil', companyId: null, code: 'INS-008', name: 'Limón Sutil Piurano Extra', category: 'Verduras & Frutas', unit: 'kg', currentStock: 22.5, minStock: 10.0, costPerUnit: 4.5, lastPurchaseDate: 'Hoy 11:45 AM' },
      { id: 'ins-aji-amarillo', companyId: null, code: 'INS-009', name: 'Ají Amarillo Fresco Despepitado', category: 'Verduras & Frutas', unit: 'kg', currentStock: 16.0, minStock: 5.0, costPerUnit: 5.0, lastPurchaseDate: 'Hoy 11:45 AM' },
      { id: 'ins-carbon-leña', companyId: 'el-sabroso', code: 'INS-010', name: 'Carbón Vegetal de Algarrobo (Saco 30kg)', category: 'Abarrotes & Especias', unit: 'un', currentStock: 15, minStock: 5, costPerUnit: 48.0, lastPurchaseDate: 'Ayer' },
      { id: 'ins-aceite-vegetal', companyId: null, code: 'INS-011', name: 'Aceite Vegetal Bidón 18L', category: 'Abarrotes & Especias', unit: 'L', currentStock: 72, minStock: 30, costPerUnit: 6.8, lastPurchaseDate: 'Ayer' },
      { id: 'ins-arroz-superior', companyId: null, code: 'INS-012', name: 'Arroz Añejo Superior Grano Largo', category: 'Abarrotes & Especias', unit: 'kg', currentStock: 110.0, minStock: 40.0, costPerUnit: 3.9, lastPurchaseDate: 'Hace 3 días' },
      { id: 'ins-pisco-quebranta', companyId: 'el-tayta', code: 'INS-013', name: 'Pisco Puro Quebranta 750ml', category: 'Bebidas & Licores', unit: 'bot', currentStock: 18, minStock: 6, costPerUnit: 36.0, lastPurchaseDate: 'Hace 2 días' },
    ],
  });

  // ================= RECIPES =================
  console.log('Sembrando recetas (fichas técnicas)...');
  const recipes: {
    id: string; companyId: string; productId: string | null; productName: string; category: string;
    portions: number; salePrice: number; totalCost: number; theoreticalFoodCostPct: number; preparationNotes?: string;
    ingredients: { insumoId: string | null; insumoName: string; quantity: number; unit: string; costPerUnit: number; subtotalCost: number }[];
  }[] = [
    {
      id: 'rec-lomo', companyId: 'el-tayta', productId: 'prod-lomo', productName: 'Lomo Saltado Clásico', category: 'platos', portions: 1, salePrice: 45.0, totalCost: 10.74, theoreticalFoodCostPct: 23.87,
      preparationNotes: 'Salteado a fuego vivo en wok tradicional. Papas crocantes servidas al momento.',
      ingredients: [
        { insumoId: 'ins-lomo', insumoName: 'Lomo Fino de Res Premium', quantity: 0.22, unit: 'kg', costPerUnit: 38.0, subtotalCost: 8.36 },
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papa Amarilla / Canchán', quantity: 0.25, unit: 'kg', costPerUnit: 3.2, subtotalCost: 0.8 },
        { insumoId: 'ins-cebolla-roja', insumoName: 'Cebolla Roja', quantity: 0.12, unit: 'kg', costPerUnit: 2.8, subtotalCost: 0.34 },
        { insumoId: 'ins-aji-amarillo', insumoName: 'Ají Amarillo Fresco', quantity: 0.04, unit: 'kg', costPerUnit: 5.0, subtotalCost: 0.2 },
        { insumoId: 'ins-aceite-vegetal', insumoName: 'Aceite Vegetal', quantity: 0.05, unit: 'L', costPerUnit: 6.8, subtotalCost: 0.34 },
        { insumoId: 'ins-arroz-superior', insumoName: 'Arroz Añejo Superior', quantity: 0.18, unit: 'kg', costPerUnit: 3.9, subtotalCost: 0.7 },
      ],
    },
    {
      id: 'rec-ceviche', companyId: 'el-tayta', productId: 'prod-ceviche', productName: 'Ceviche Mixto Tradición', category: 'platos', portions: 1, salePrice: 42.0, totalCost: 10.12, theoreticalFoodCostPct: 24.1,
      preparationNotes: 'Pesca del día cortada en cubos de 2x2cm. Emplatar con camote glaseado y choclo.',
      ingredients: [
        { insumoId: 'ins-pescado', insumoName: 'Filete de Corvina Fresco', quantity: 0.2, unit: 'kg', costPerUnit: 32.0, subtotalCost: 6.4 },
        { insumoId: 'ins-mariscos', insumoName: 'Mixtura de Mariscos', quantity: 0.08, unit: 'kg', costPerUnit: 34.0, subtotalCost: 2.72 },
        { insumoId: 'ins-limon-sutil', insumoName: 'Limón Sutil Piurano', quantity: 0.15, unit: 'kg', costPerUnit: 4.5, subtotalCost: 0.68 },
        { insumoId: 'ins-cebolla-roja', insumoName: 'Cebolla Roja en pluma', quantity: 0.06, unit: 'kg', costPerUnit: 2.8, subtotalCost: 0.17 },
        { insumoId: 'ins-aji-amarillo', insumoName: 'Ají Amarillo picado', quantity: 0.03, unit: 'kg', costPerUnit: 5.0, subtotalCost: 0.15 },
      ],
    },
    {
      id: 'rec-aji', companyId: 'el-tayta', productId: 'prod-aji', productName: 'Ají de Gallina', category: 'platos', portions: 1, salePrice: 38.0, totalCost: 5.31, theoreticalFoodCostPct: 13.97,
      preparationNotes: 'Pollo sancochado y deshilachado a mano. Espesar con pan remojado y leche.',
      ingredients: [
        { insumoId: 'ins-pechuga-pollo', insumoName: 'Pechuga de Pollo Fresca', quantity: 0.22, unit: 'kg', costPerUnit: 16.5, subtotalCost: 3.63 },
        { insumoId: 'ins-aji-amarillo', insumoName: 'Crema de Ají Amarillo', quantity: 0.1, unit: 'kg', costPerUnit: 5.0, subtotalCost: 0.5 },
        { insumoId: 'ins-arroz-superior', insumoName: 'Arroz Añejo Superior', quantity: 0.18, unit: 'kg', costPerUnit: 3.9, subtotalCost: 0.7 },
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papa Amarilla Cocida', quantity: 0.15, unit: 'kg', costPerUnit: 3.2, subtotalCost: 0.48 },
      ],
    },
    {
      id: 'rec-pisco', companyId: 'el-tayta', productId: 'prod-pisco-sour', productName: 'Pisco Sour Clásico', category: 'bebidas', portions: 1, salePrice: 25.0, totalCost: 3.51, theoreticalFoodCostPct: 14.04,
      preparationNotes: 'Fórmula 3-1-1 (Pisco, zumo de limón, jarabe). Agitar en coctelera con clara de huevo.',
      ingredients: [
        { insumoId: 'ins-pisco-quebranta', insumoName: 'Pisco Puro Quebranta', quantity: 0.09, unit: 'bot', costPerUnit: 36.0, subtotalCost: 3.24 },
        { insumoId: 'ins-limon-sutil', insumoName: 'Limón Sutil Piurano', quantity: 0.06, unit: 'kg', costPerUnit: 4.5, subtotalCost: 0.27 },
      ],
    },
    {
      id: 'rec-pollo-cuarto', companyId: 'el-sabroso', productId: 'prod-sab-cuarto', productName: '1/4 Pollo a la Brasa con Papas', category: 'brasas', portions: 1, salePrice: 24.5, totalCost: 6.57, theoreticalFoodCostPct: 26.82,
      preparationNotes: 'Maceración de 12 horas con cerveza negra, romero y sillao. Horneado a 200°C con leña.',
      ingredients: [
        { insumoId: 'ins-pollo-entero', insumoName: 'Pollo Eviscerado Brasa', quantity: 0.25, unit: 'un', costPerUnit: 14.5, subtotalCost: 3.63 },
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papa para Freír Crocante', quantity: 0.3, unit: 'kg', costPerUnit: 3.2, subtotalCost: 0.96 },
        { insumoId: 'ins-carbon-leña', insumoName: 'Carbón Vegetal (Proporción)', quantity: 0.03, unit: 'un', costPerUnit: 48.0, subtotalCost: 1.44 },
        { insumoId: 'ins-aceite-vegetal', insumoName: 'Aceite Freidora', quantity: 0.08, unit: 'L', costPerUnit: 6.8, subtotalCost: 0.54 },
      ],
    },
    {
      id: 'rec-pollo-entero', companyId: 'el-sabroso', productId: 'prod-sab-entero', productName: '1 Pollo a la Brasa Familiar', category: 'brasas', portions: 4, salePrice: 78.0, totalCost: 24.52, theoreticalFoodCostPct: 31.44,
      preparationNotes: 'Servido con ensalada clásica vinagreta y cremas artesanales ají pollero.',
      ingredients: [
        { insumoId: 'ins-pollo-entero', insumoName: 'Pollo Eviscerado Brasa', quantity: 1.0, unit: 'un', costPerUnit: 14.5, subtotalCost: 14.5 },
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papas Fritas Ración Familiar', quantity: 1.1, unit: 'kg', costPerUnit: 3.2, subtotalCost: 3.52 },
        { insumoId: 'ins-carbon-leña', insumoName: 'Carbón Vegetal de Leña', quantity: 0.1, unit: 'un', costPerUnit: 48.0, subtotalCost: 4.8 },
        { insumoId: 'ins-aceite-vegetal', insumoName: 'Aceite Freidora', quantity: 0.25, unit: 'L', costPerUnit: 6.8, subtotalCost: 1.7 },
      ],
    },
    {
      id: 'rec-parrilla-mixta', companyId: 'el-sabroso', productId: 'prod-sab-parrilla', productName: 'Parrilla Mixta El Sabroso', category: 'brasas', portions: 2, salePrice: 65.0, totalCost: 19.82, theoreticalFoodCostPct: 30.49,
      preparationNotes: 'Acompañado de chimichurri de la casa y ensalada parrillera.',
      ingredients: [
        { insumoId: 'ins-lomo', insumoName: 'Cortes de Lomo y Cuadril', quantity: 0.3, unit: 'kg', costPerUnit: 38.0, subtotalCost: 11.4 },
        { insumoId: 'ins-pechuga-pollo', insumoName: 'Pechuga a la Parrilla', quantity: 0.2, unit: 'kg', costPerUnit: 16.5, subtotalCost: 3.3 },
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papas Doradas', quantity: 0.4, unit: 'kg', costPerUnit: 3.2, subtotalCost: 1.28 },
        { insumoId: 'ins-carbon-leña', insumoName: 'Carbón Parrillero', quantity: 0.08, unit: 'un', costPerUnit: 48.0, subtotalCost: 3.84 },
      ],
    },
  ];

  for (const rec of recipes) {
    const { ingredients, ...recipeData } = rec;
    await prisma.recipe.create({
      data: {
        ...recipeData,
        ingredients: {
          create: ingredients.map((ing) => ({ id: newUuid(), ...ing })),
        },
      },
    });
  }

  // ================= TABLES =================
  console.log('Sembrando mesas...');
  await prisma.table.createMany({
    data: [
      { id: 't-01', companyId: 'el-tayta', number: '01', capacity: 4, zone: 'Salón Principal', status: 'libre' },
      { id: 't-02', companyId: 'el-tayta', number: '02', capacity: 2, zone: 'Salón Principal', status: 'ocupada', occupiedSince: '12:00 PM', minutesElapsed: 45, currentOrderId: 'order-mesa-02', waiter: 'Carlos M.' },
      { id: 't-03', companyId: 'el-tayta', number: '03', capacity: 6, zone: 'Salón Principal', status: 'por_cobrar', occupiedSince: '11:35 AM', minutesElapsed: 70, currentOrderId: 'order-mesa-03', waiter: 'Carlos M.' },
      { id: 't-04', companyId: 'el-tayta', number: '04', capacity: 4, zone: 'Salón Principal', status: 'libre' },
      { id: 't-05', companyId: 'el-tayta', number: '05', capacity: 8, zone: 'Salón Principal', status: 'libre' },
      { id: 't-t1', companyId: 'el-tayta', number: 'T1', capacity: 4, zone: 'Terraza', status: 'libre' },
      { id: 't-t2', companyId: 'el-tayta', number: 'T2', capacity: 2, zone: 'Terraza', status: 'ocupada', occupiedSince: '12:20 PM', minutesElapsed: 25, waiter: 'Carlos M.' },
      { id: 't-b1', companyId: 'el-tayta', number: 'B1', capacity: 1, zone: 'Barra', status: 'libre' },
      { id: 't-s1', companyId: 'el-sabroso', number: 'S-01', capacity: 4, zone: 'Zona Brasas', status: 'ocupada', occupiedSince: '12:15 PM', minutesElapsed: 30, currentOrderId: 'order-mesa-s1', waiter: 'Carlos M.' },
      { id: 't-s2', companyId: 'el-sabroso', number: 'S-02', capacity: 6, zone: 'Zona Brasas', status: 'libre' },
      { id: 't-s3', companyId: 'el-sabroso', number: 'S-03', capacity: 4, zone: 'Zona Brasas', status: 'libre' },
      { id: 't-s4', companyId: 'el-sabroso', number: 'S-04', capacity: 8, zone: 'Zona Brasas', status: 'por_cobrar', occupiedSince: '11:40 AM', minutesElapsed: 65, waiter: 'Carlos M.' },
      { id: 't-sb1', companyId: 'el-sabroso', number: 'SB-1', capacity: 2, zone: 'Barra', status: 'libre' },
    ],
  });

  // ================= ORDERS =================
  console.log('Sembrando pedidos...');
  await prisma.order.createMany({
    data: [
      { id: 'order-mesa-02', companyId: 'el-tayta', ticketNumber: '84918', tableId: 't-02', tableNumber: '02', zone: 'Salón Principal', waiter: 'Carlos M.', createdAt: '12:00 PM', createdUtc: new Date(), subtotal: 78.0, igv: 14.04, total: 92.04, status: 'en_cocina', clientOpId: newUuid() },
      { id: 'order-mesa-03', companyId: 'el-tayta', ticketNumber: '84919', tableId: 't-03', tableNumber: '03', zone: 'Salón Principal', waiter: 'Carlos M.', createdAt: '11:35 AM', createdUtc: new Date(), subtotal: 133.0, igv: 9.5, total: 142.5, status: 'por_cobrar', clientOpId: newUuid() },
      { id: 'order-mesa-s1', companyId: 'el-sabroso', ticketNumber: '77210', tableId: 't-s1', tableNumber: 'S-01', zone: 'Zona Brasas', waiter: 'Carlos M.', createdAt: '12:15 PM', createdUtc: new Date(), subtotal: 91.0, igv: 16.38, total: 107.38, status: 'en_cocina', clientOpId: newUuid() },
    ],
  });

  await prisma.orderItem.createMany({
    data: [
      { id: 'item-02-1', orderId: 'order-mesa-02', productId: 'prod-aji', name: 'Ají de Gallina', price: 38.0, quantity: 1, notes: 'Poco picante', status: 'en_cocina', addedAt: '12:02 PM' },
      { id: 'item-02-2', orderId: 'order-mesa-02', productId: 'prod-causa', name: 'Causa Limeña de Pollo', price: 24.0, quantity: 1, status: 'servido', addedAt: '12:01 PM' },
      { id: 'item-02-3', orderId: 'order-mesa-02', productId: 'prod-chicha', name: 'Jarra de Chicha Morada (1L)', price: 18.0, quantity: 1, notes: 'Con hielo aparte', status: 'servido', addedAt: '12:01 PM' },
      { id: 'item-03-1', orderId: 'order-mesa-03', productId: 'prod-lomo', name: 'Lomo Saltado Clásico', price: 45.0, quantity: 1, notes: 'Término medio', status: 'servido', addedAt: '11:38 AM' },
      { id: 'item-03-2', orderId: 'order-mesa-03', productId: 'prod-ceviche', name: 'Ceviche Mixto Tradición', price: 42.0, quantity: 2, notes: 'Picante moderado', status: 'servido', addedAt: '11:38 AM' },
      { id: 'item-s1-1', orderId: 'order-mesa-s1', productId: 'prod-sab-entero', name: '1 Pollo a la Brasa Familiar', price: 78.0, quantity: 1, notes: 'Bien dorado, papas crocantes', status: 'en_cocina', addedAt: '12:18 PM' },
      { id: 'item-s1-2', orderId: 'order-mesa-s1', productId: 'prod-sab-inca', name: 'Inca Kola 1.5L Helada', price: 13.0, quantity: 1, status: 'servido', addedAt: '12:16 PM' },
    ],
  });

  // ================= PURCHASES =================
  console.log('Sembrando compras...');
  const purchases: {
    id: string; companyId: string; category: string; documentStatus: string; provisionalNoteNumber?: string;
    invoiceNumber: string; supplierName: string; supplierRuc: string; date: string; time: string; shift: string;
    subtotal: number; igv: number; total: number; paymentStatus: string; paidFromCash: boolean; bankAccountId?: string;
    bankAccountAlias?: string; notes?: string; regularizedAt?: string; regularizedBy?: string;
    items: { insumoId: string | null; insumoName: string; quantity: number; unit: string; unitCost: number; totalCost: number }[];
  }[] = [
    {
      id: 'pur-01', companyId: 'el-tayta', category: 'insumos', documentStatus: 'regularizado', invoiceNumber: 'F01-4421',
      supplierName: 'Distribuidora Carnes del Sur S.A.C.', supplierRuc: '20554891234', date: 'Hoy', time: '09:15 AM', shift: 'Día',
      subtotal: 596.19, igv: 107.31, total: 703.5, paymentStatus: 'Pagado (Caja)', paidFromCash: true,
      notes: 'Lote de carnes de primera calidad para turno mediodía.',
      regularizedAt: 'Hoy 09:30 AM', regularizedBy: 'Carlos M.',
      items: [
        { insumoId: 'ins-lomo', insumoName: 'Lomo Fino de Res Premium', quantity: 12.0, unit: 'kg', unitCost: 38.0, totalCost: 456.0 },
        { insumoId: 'ins-pechuga-pollo', insumoName: 'Pechuga de Pollo Fresca', quantity: 15.0, unit: 'kg', unitCost: 16.5, totalCost: 247.5 },
      ],
    },
    {
      id: 'pur-02', companyId: 'el-sabroso', category: 'insumos', documentStatus: 'regularizado', invoiceNumber: 'F02-8812',
      supplierName: 'Avícola San Fernando S.A.', supplierRuc: '20100154321', date: 'Hoy', time: '08:30 AM', shift: 'Día',
      subtotal: 694.07, igv: 124.93, total: 819.0, paymentStatus: 'Transferencia Bancaria',
      bankAccountId: 'bank-sabroso-bcp', bankAccountAlias: 'BCP Soles - El Sabroso Principal', paidFromCash: false,
      notes: 'Abastecimiento de pollos para horno de brasas del día.',
      regularizedAt: 'Hoy 08:45 AM', regularizedBy: 'Carlos M.',
      items: [
        { insumoId: 'ins-pollo-entero', insumoName: 'Pollo Eviscerado Brasa (2.2kg)', quantity: 30, unit: 'un', unitCost: 14.5, totalCost: 435.0 },
        { insumoId: 'ins-carbon-leña', insumoName: 'Carbón Vegetal de Algarrobo (30kg)', quantity: 8, unit: 'un', unitCost: 48.0, totalCost: 384.0 },
      ],
    },
    {
      id: 'pur-03', companyId: 'el-tayta', category: 'insumos', documentStatus: 'regularizado', invoiceNumber: 'B03-0882',
      supplierName: 'Huerto Central Mayorista', supplierRuc: '10442398511', date: 'Hoy', time: '11:45 AM', shift: 'Día',
      subtotal: 101.69, igv: 18.31, total: 120.0, paymentStatus: 'Pagado (Caja)', paidFromCash: true,
      notes: 'Verduras frescas para ensaladas y guarniciones.',
      regularizedAt: 'Hoy 12:00 PM', regularizedBy: 'Carlos M.',
      items: [
        { insumoId: 'ins-papa-amarilla', insumoName: 'Papa Amarilla para Freír', quantity: 20.0, unit: 'kg', unitCost: 3.2, totalCost: 64.0 },
        { insumoId: 'ins-limon-sutil', insumoName: 'Limón Sutil Piurano Extra', quantity: 8.0, unit: 'kg', unitCost: 4.5, totalCost: 36.0 },
        { insumoId: 'ins-cebolla-roja', insumoName: 'Cebolla Roja Seleccionada', quantity: 7.14, unit: 'kg', unitCost: 2.8, totalCost: 20.0 },
      ],
    },
    {
      id: 'pur-04', companyId: 'el-tayta', category: 'gastos_operativos', documentStatus: 'provisional', provisionalNoteNumber: 'VALE-042',
      invoiceNumber: 'PENDIENTE-DOC', supplierName: 'Distribuidora Gas & Energía del Pacífico', supplierRuc: 'PENDIENTE',
      date: 'Hoy', time: '11:15 AM', shift: 'Día', subtotal: 165.25, igv: 29.75, total: 195.0,
      paymentStatus: 'Pagado (Caja)', paidFromCash: true,
      notes: 'Compra de emergencia en salón. El repartidor dejó recibo provisional. Factura electrónica llegará por correo a las 4pm.',
      items: [
        { insumoId: null, insumoName: 'Balón de Gas Industrial 45kg Cocina', quantity: 1, unit: 'un', unitCost: 195.0, totalCost: 195.0 },
      ],
    },
    {
      id: 'pur-05', companyId: 'el-sabroso', category: 'productos_reventa', documentStatus: 'provisional', provisionalNoteNumber: 'VALE-043',
      invoiceNumber: 'PENDIENTE-DOC', supplierName: 'Distribuidora Bebidas & Cervezas Lima Sur', supplierRuc: 'PENDIENTE',
      date: 'Hoy', time: '10:40 AM', shift: 'Día', subtotal: 220.34, igv: 39.66, total: 260.0,
      paymentStatus: 'Transferencia Bancaria', bankAccountId: 'bank-sabroso-interbank', bankAccountAlias: 'Interbank Soles - POS Izipay', paidFromCash: false,
      notes: 'Mercadería descargada en almacén de bebidas. Proveedor enviará boleta electrónica en el cambio de turno.',
      items: [
        { insumoId: null, insumoName: 'Cajas Gaseosas 1.5L + Cerveza Cusqueña (Consignación)', quantity: 4, unit: 'un', unitCost: 65.0, totalCost: 260.0 },
      ],
    },
  ];

  for (const pur of purchases) {
    const { items, ...purchaseData } = pur;
    await prisma.purchase.create({
      data: {
        ...purchaseData,
        clientOpId: newUuid(),
        items: { create: items.map((it) => ({ id: newUuid(), ...it })) },
      },
    });
  }

  // ================= KARDEX =================
  console.log('Sembrando movimientos kardex...');
  const now = Date.now();
  await prisma.kardexMovement.createMany({
    data: [
      { id: 'kdx-01', companyId: 'el-tayta', timestamp: new Date(now - 300 * 60 * 1000), date: 'Hoy', time: '07:30 AM', insumoId: 'ins-lomo', insumoName: 'Lomo Fino de Res Premium', type: 'INVENTARIO_INICIAL', referenceDoc: 'Apertura de Turno', quantity: 8.5, unit: 'kg', unitCost: 38.0, totalCost: 323.0, stockBefore: 0, stockAfter: 8.5, clientOpId: newUuid() },
      { id: 'kdx-02', companyId: 'el-tayta', timestamp: new Date(now - 210 * 60 * 1000), date: 'Hoy', time: '09:15 AM', insumoId: 'ins-lomo', insumoName: 'Lomo Fino de Res Premium', type: 'ENTRADA_COMPRA', referenceDoc: 'Compra Factura #F01-4421', quantity: 12.0, unit: 'kg', unitCost: 38.0, totalCost: 456.0, stockBefore: 8.5, stockAfter: 20.5, clientOpId: newUuid() },
      { id: 'kdx-03', companyId: 'el-tayta', timestamp: new Date(now - 60 * 60 * 1000), date: 'Hoy', time: '11:40 AM', insumoId: 'ins-lomo', insumoName: 'Lomo Fino de Res Premium', type: 'SALIDA_VENTA_POS', referenceDoc: 'Venta POS Comanda #84916 (Mesa 12)', quantity: -0.44, unit: 'kg', unitCost: 38.0, totalCost: 16.72, stockBefore: 20.5, stockAfter: 20.06, notes: '2 porciones Lomo Saltado', clientOpId: newUuid() },
      { id: 'kdx-04', companyId: 'el-sabroso', timestamp: new Date(now - 240 * 60 * 1000), date: 'Hoy', time: '08:30 AM', insumoId: 'ins-pollo-entero', insumoName: 'Pollo Eviscerado Brasa (2.2kg)', type: 'ENTRADA_COMPRA', referenceDoc: 'Compra Factura #F02-8812', quantity: 30, unit: 'un', unitCost: 14.5, totalCost: 435.0, stockBefore: 16, stockAfter: 46, clientOpId: newUuid() },
      { id: 'kdx-05', companyId: 'el-sabroso', timestamp: new Date(now - 50 * 60 * 1000), date: 'Hoy', time: '12:10 PM', insumoId: 'ins-pollo-entero', insumoName: 'Pollo Eviscerado Brasa (2.2kg)', type: 'SALIDA_VENTA_POS', referenceDoc: 'Venta POS Comanda #77210 (Mesa B1)', quantity: -4.0, unit: 'un', unitCost: 14.5, totalCost: 58.0, stockBefore: 46, stockAfter: 42, notes: '4 pollos horneados y despachados', clientOpId: newUuid() },
    ],
  });

  // ================= TRANSACTIONS =================
  console.log('Sembrando libro de caja...');
  await prisma.transaction.createMany({
    data: [
      { id: 'tx-01', companyId: 'el-tayta', time: '12:30 PM', date: 'Hoy', timestamp: new Date(now - 15 * 60 * 1000), type: 'Venta (Mesa)', description: 'Pago en efectivo - Orden #402 (Mesa 03 El Tayta)', amount: 145.0, isIncome: true, paymentMethod: 'Efectivo', tableNumber: '03', ticketNumber: '84916', clientOpId: newUuid() },
      { id: 'tx-02', companyId: 'el-sabroso', time: '12:15 PM', date: 'Hoy', timestamp: new Date(now - 30 * 60 * 1000), type: 'Venta (Mesa)', description: 'Pago con tarjeta - Orden #401 (Mesa S-02 El Sabroso)', amount: 280.5, isIncome: true, paymentMethod: 'Tarjeta', tableNumber: 'S-02', ticketNumber: '84915', clientOpId: newUuid() },
      { id: 'tx-03', companyId: 'el-tayta', time: '11:45 AM', date: 'Hoy', timestamp: new Date(now - 60 * 60 * 1000), type: 'Pago Proveedor', description: 'Compra insumos (Verduras Huerto Central) - Boleta #B03-0882', amount: 120.0, isIncome: false, clientOpId: newUuid() },
      { id: 'tx-04', companyId: 'el-sabroso', time: '11:20 AM', date: 'Hoy', timestamp: new Date(now - 85 * 60 * 1000), type: 'Venta (Barra)', description: 'Pago Yape - Orden #400 (Barra El Sabroso)', amount: 72.0, isIncome: true, paymentMethod: 'Yape / Plin', tableNumber: 'SB-1', ticketNumber: '84914', clientOpId: newUuid() },
      { id: 'tx-05', companyId: 'el-tayta', time: '10:00 AM', date: 'Hoy', timestamp: new Date(now - 165 * 60 * 1000), type: 'Caja Chica', description: 'Movilidad compras de emergencia salón', amount: 25.0, isIncome: false, clientOpId: newUuid() },
      { id: 'tx-06', companyId: 'el-tayta', time: '09:40 AM', date: 'Hoy', timestamp: new Date(now - 185 * 60 * 1000), type: 'Venta (Mesa)', description: 'Almuerzo corporativo - Orden #399 (El Tayta)', amount: 1480.0, isIncome: true, paymentMethod: 'Tarjeta', tableNumber: '05', clientOpId: newUuid() },
      { id: 'tx-07', companyId: 'el-tayta', time: '09:15 AM', date: 'Hoy', timestamp: new Date(now - 210 * 60 * 1000), type: 'Pago Proveedor', description: 'Distribuidora Carnes del Sur - Factura #F01-4421', amount: 703.5, isIncome: false, clientOpId: newUuid() },
      { id: 'tx-08', companyId: 'el-sabroso', time: '08:45 AM', date: 'Hoy', timestamp: new Date(now - 240 * 60 * 1000), type: 'Venta (Mesa)', description: 'Ventas apertura y despacho anticipado (El Sabroso)', amount: 2272.5, isIncome: true, paymentMethod: 'Efectivo', tableNumber: 'S-01', clientOpId: newUuid() },
    ],
  });

  // ================= SHIFT RECORDS =================
  console.log('Sembrando historial de turnos...');
  await prisma.shiftRecord.create({
    data: {
      id: 'shift-rec-01',
      companyId: 'el-tayta',
      shift: 'Día',
      openedAt: 'Hoy 07:30 AM',
      openedUtc: new Date(),
      closedAt: 'Hoy 03:00 PM',
      closedUtc: new Date(),
      openedBy: 'Carlos M.',
      closedBy: 'Carlos M.',
      initialCash: 350.0,
      systemCashExpected: 1420.0,
      finalCashReported: 1420.0,
      cashDifference: 0,
      totalSales: 2890.0,
      cardSales: 1220.0,
      digitalWalletSales: 600.0,
      bankTransferSales: 0,
      totalExpenses: 0,
      status: 'cerrado',
      notes: 'Turno día cerrado conforme sin diferencias.',
    },
  });

  console.log('✅ Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });