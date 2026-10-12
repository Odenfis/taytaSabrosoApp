import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env') });

const WINDOW_H = 3;
const since = new Date(Date.now() - WINDOW_H * 3600 * 1000);

const dec = (v: unknown) => (v == null ? v : Number(v));
const iso = (d: Date | null | undefined) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : '');

async function main() {
  const [orders, txs, purchases, kardex, shifts, banks, insumos] = await Promise.all([
    prisma.order.findMany({ where: { createdUtc: { gte: since } }, orderBy: { createdUtc: 'asc' } }),
    prisma.transaction.findMany({ where: { timestamp: { gte: since } }, orderBy: { timestamp: 'asc' } }),
    prisma.purchase.findMany({ where: { purchasedUtc: { gte: since } }, orderBy: { purchasedUtc: 'asc' } }),
    prisma.kardexMovement.findMany({ where: { timestamp: { gte: since } }, orderBy: { timestamp: 'asc' } }),
    prisma.shiftRecord.findMany({ where: { closedUtc: { gte: since } }, orderBy: { closedUtc: 'asc' } }),
    prisma.bankAccount.findMany({ where: { isDeleted: false } }),
    prisma.insumo.findMany({ where: { isDeleted: false }, take: 8 }),
  ]);

  console.log(`\n=== VENTANA: ultimas ${WINDOW_H}h (desde ${iso(since)}) ===`);
  console.log(`\n-- ORDENES (${orders.length}) --`);
  for (const o of orders) {
    console.log(`  ${iso(o.createdUtc)} ticket=${o.ticketNumber} mesa=${o.tableNumber ?? '-'} estado=${o.status} total=${dec(o.total)} clientOp=${o.clientOpId}`);
  }
  console.log(`\n-- TRANSACCIONES (${txs.length}) --`);
  for (const t of txs) {
    console.log(`  ${iso(t.timestamp)} ${t.type} | ${t.description.slice(0, 40)} | ${t.isIncome ? 'ING' : 'EGR'} ${dec(t.amount)} pago=${t.paymentMethod ?? '-'} banco=${t.bankAccountAlias ?? '-'} pedido=${t.orderId?.slice(0, 8) ?? '-'} clientOp=${t.clientOpId}`);
  }
  console.log(`\n-- COMPRAS (${purchases.length}) --`);
  for (const p of purchases) {
    console.log(`  ${iso(p.purchasedUtc)} doc=${p.documentStatus} factura=${p.invoiceNumber} total=${dec(p.total)} pago=${p.paymentStatus} caja=${p.paidFromCash} prov=${p.supplierName.slice(0, 25)} clientOp=${p.clientOpId}`);
  }
  console.log(`\n-- KARDEX (${kardex.length}) --`);
  for (const k of kardex) {
    console.log(`  ${iso(k.timestamp)} ${k.type} | ${k.insumoName.slice(0, 25)} x${dec(k.quantity)} stock ${dec(k.stockBefore)}->${dec(k.stockAfter)} ref=${k.referenceDoc.slice(0, 40)} clientOp=${k.clientOpId.slice(0, 8)}`);
  }
  console.log(`\n-- TURNOS CERRADOS (${shifts.length}) --`);
  for (const s of shifts) {
    console.log(`  ${iso(s.closedUtc)} emp=${s.companyId} turno=${s.shift} ventas=${dec(s.totalSales)} gastos=${dec(s.totalExpenses)} cajaFinal=${dec(s.finalCashReported)} dif=${dec(s.cashDifference)}`);
  }
  console.log(`\n-- CUENTAS BANCARIAS --`);
  for (const b of banks) {
    console.log(`  ${b.alias} = ${dec(b.currentBalance)}`);
  }
  console.log(`\n-- PRIMEROS INSUMOS (stock) --`);
  for (const i of insumos) {
    console.log(`  ${i.name.slice(0, 30)} stock=${dec(i.currentStock)} ${i.unit}`);
  }
  console.log('\n-- CHECK DUPLICADOS clientOpId --');
  const duplicated = (rows: { clientOpId: string }[]) => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const r of rows) {
      if (seen.has(r.clientOpId)) dups.push(r.clientOpId);
      seen.add(r.clientOpId);
    }
    return dups;
  };
  console.log('  orders:', JSON.stringify(duplicated(orders)));
  console.log('  transactions:', JSON.stringify(duplicated(txs)));
  console.log('  purchases:', JSON.stringify(duplicated(purchases)));
  console.log('  kardex:', JSON.stringify(duplicated(kardex)));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());