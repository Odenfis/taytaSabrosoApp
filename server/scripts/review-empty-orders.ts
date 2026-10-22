// Vista previa por defecto. --apply exige una lista explícita --ids=id1,id2.
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { cleanupEmptyDraft } from '../src/services/order.service.js';
const args = process.argv.slice(2);
const idsArg = args.find((arg) => arg.startsWith('--ids='));
const ids = idsArg?.slice(6).split(',').filter(Boolean);
const apply = args.includes('--apply');
if (apply && !ids?.length) throw new Error('--apply requiere --ids con los UUID revisados.');
try {
  const orders = await prisma.order.findMany({ where: { items: { none: {} }, ...(ids?.length ? { id: { in: ids } } : {}) },
    include: { transactions: { select: { id: true } } }, orderBy: { createdUtc: 'asc' } });
  const rows = orders.map((order) => ({ id: order.id, companyId: order.companyId, tableId: order.tableId, ticketNumber: order.ticketNumber,
    status: order.status, isDeleted: order.isDeleted, firstDispatchedUtc: order.firstDispatchedUtc,
    dispatchHistoryKnown: order.dispatchHistoryKnown, payments: order.transactions.length,
    eligible: !order.isDeleted && order.dispatchHistoryKnown && !order.firstDispatchedUtc && order.status === 'abierto' && !order.transactions.length }));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', orders: rows }, null, 2));
  if (apply) for (const row of rows.filter((row) => row.eligible)) {
    const result = await cleanupEmptyDraft(row.id);
    console.log(JSON.stringify({ id: row.id, removed: 'isDeleted' in result && result.isDeleted === true, skipped: 'skipped' in result && result.skipped === true }));
  }
} finally { await prisma.$disconnect(); }
