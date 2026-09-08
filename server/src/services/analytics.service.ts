import { AppError, plain, round1, round2, toNum } from '../lib/utils';
import { prisma } from '../lib/prisma';

// Análisis financiero: réplica exacta del motor getCompanyAnalysis de la demo (ratios Food Cost).
export async function getCompanyAnalysis(cid: string /* 'el-tayta' | 'el-sabroso' | 'all' */) {
  const txs = await prisma.transaction.findMany({
    where: { isDeleted: false, ...(cid === 'all' ? {} : { companyId: cid }) },
  });
  const purs = await prisma.purchase.findMany({
    where: { isDeleted: false, ...(cid === 'all' ? {} : { companyId: cid }) },
  });
  const ords = await prisma.order.findMany({
    where: { isDeleted: false, ...(cid === 'all' ? {} : { companyId: cid }) },
    include: { items: true },
  });
  const recipes = await prisma.recipe.findMany({
    where: { isDeleted: false },
    include: { ingredients: true },
  });

  const totalSales = txs.filter((t) => t.isIncome).reduce((s, t) => s + toNum(t.amount), 0);
  const totalPurchases = purs.reduce((s, p) => s + toNum(p.total), 0);
  const operatingExpenses = txs
    .filter((t) => !t.isIncome && t.type !== 'Pago Proveedor')
    .reduce((s, t) => s + toNum(t.amount), 0);

  let totalTheoreticalCost = 0;
  for (const o of ords.filter((o) => o.status === 'cobrado' || o.status === 'en_cocina')) {
    for (const item of o.items) {
      const rec = recipes.find((r) => r.productId === item.productId || r.productName === item.name);
      if (rec) totalTheoreticalCost += toNum(rec.totalCost) * toNum(item.quantity);
    }
  }

  if (totalTheoreticalCost === 0 && totalSales > 0) {
    totalTheoreticalCost = totalSales * 0.28; // ~28% estándar industrial
  }

  const safeSales = totalSales > 0 ? totalSales : 1;
  const foodCostPctReal = round1((totalPurchases / safeSales) * 100);
  const foodCostPctTheoretical = round1((totalTheoreticalCost / safeSales) * 100);
  const operatingExpenseRatio = round1(((totalPurchases + operatingExpenses) / safeSales) * 100);
  const variancePct = round1(foodCostPctReal - foodCostPctTheoretical);

  let status: 'optimo' | 'alerta' | 'critico' = 'optimo';
  let message = '';
  const recommendations: string[] = [];

  if (foodCostPctReal > 38.0 || operatingExpenseRatio > 45.0) {
    status = 'critico';
    message =
      '¡Alerta Crítica de Gastos! Los costos de insumos y compras superan el 38% de las ventas. Se están generando sobrecostos importantes.';
    recommendations.push(
      'Revisar las compras recientes de proteínas de alto valor (lomo, cortes o mariscos).'
    );
    recommendations.push(
      'Auditar porciones en cocina: la merma o porcionado excede la Ficha Técnica oficial.'
    );
    recommendations.push('Negociar precios o volumen con proveedores principales de insumos críticos.');
  } else if (foodCostPctReal >= 32.5 || operatingExpenseRatio >= 38.0) {
    status = 'alerta';
    message =
      'Atención: El ratio de gastos en insumos se encuentra en zona de precaución (33% - 38%). Margen bajo supervisión.';
    recommendations.push(
      'Verificar el stock físico en Kardex frente a compras para detectar posibles fugas.'
    );
    recommendations.push(
      'Priorizar en el POS la venta de platos con menor Food Cost Teórico (Ají de Gallina, Chicha, etc.).'
    );
  } else {
    status = 'optimo';
    message =
      'Excelente desempeño financiero: El ratio de gastos se mantiene dentro de los márgenes saludables de rentabilidad (< 32%).';
    recommendations.push('Mantener el control estricto de recetas y registrar las entradas puntuales en compras.');
    recommendations.push('Las compras están equilibradas con el ritmo actual de comandas y facturación del turno.');
  }

  return {
    companyId: cid,
    totalSales: round2(totalSales),
    totalPurchases: round2(totalPurchases),
    totalTheoreticalCost: round2(totalTheoreticalCost),
    operatingExpenses: round2(operatingExpenses),
    foodCostPctReal,
    foodCostPctTheoretical,
    operatingExpenseRatio,
    variancePct,
    status,
    message,
    recommendations,
  };
}

// Resumen KPI para la pantalla de Reportes.
export async function getReportSummary(companyId: string) {
  if (!companyId) throw new AppError('Falta companyId.', 400, 'VALIDATION');

  const txs = await prisma.transaction.findMany({
    where: { isDeleted: false, ...(companyId === 'all' ? {} : { OR: [{ companyId }, { companyId: null }] }) },
    orderBy: { timestamp: 'desc' },
    take: 5000,
  });
  const orders = await prisma.order.findMany({
    where: { isDeleted: false, ...(companyId === 'all' ? {} : { companyId }) },
    include: { items: true },
  });
  const tables = await prisma.table.findMany({
    where: { isDeleted: false, ...(companyId === 'all' ? {} : { companyId }) },
  });
  const shiftRecords = await prisma.shiftRecord.findMany({
    where: { ...(companyId === 'all' ? {} : { companyId }) },
    orderBy: { closedUtc: 'desc' },
  });

  const totalIngresos = round2(txs.filter((t) => t.isIncome).reduce((s, t) => s + toNum(t.amount), 0));
  const totalEgresos = round2(txs.filter((t) => !t.isIncome).reduce((s, t) => s + toNum(t.amount), 0));

  const income = txs.filter((t) => t.isIncome);
  const byMethod: Record<string, { count: number; total: number }> = {};
  for (const t of income) {
    const key = t.paymentMethod || 'Efectivo';
    byMethod[key] = byMethod[key] || { count: 0, total: 0 };
    byMethod[key].count += 1;
    byMethod[key].total = round2(toNum(byMethod[key].total) + toNum(t.amount));
  }

  const dishMap: Record<string, { qty: number; revenue: number }> = {};
  for (const o of orders.filter((o) => o.status === 'cobrado')) {
    for (const item of o.items) {
      dishMap[item.name] = dishMap[item.name] || { qty: 0, revenue: 0 };
      dishMap[item.name].qty += toNum(item.quantity);
      dishMap[item.name].revenue = round2(toNum(dishMap[item.name].revenue) + toNum(item.quantity) * toNum(item.price));
    }
  }
  const topDishes = Object.entries(dishMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const todayOrders = orders.filter((o) => o.status === 'cobrado').length;
  const openOrders = orders.filter((o) => ['abierto', 'en_cocina', 'por_cobrar'].includes(o.status));
  const occupiedTables = tables.filter((t) => t.status !== 'libre').length;

  return {
    companyId,
    totalIngresos,
    totalEgresos,
    saldoActual: round2(totalIngresos - totalEgresos),
    paymentMethods: Object.entries(byMethod).map(([method, v]) => ({ method, ...v })),
    topDishes,
    todayOrders,
    openOrdersCount: openOrders.length,
    occupiedTables,
    tablesCount: tables.length,
    lastShift: plain(shiftRecords[0] ?? null),
  };
}