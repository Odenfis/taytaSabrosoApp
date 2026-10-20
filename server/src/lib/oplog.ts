import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { AppError } from './utils';

const CARGA_MAX_CHARS = 20000;

// Entidades del ledger (snake_case español, igual que las columnas de la BD).
// Los catálogos llevan entidad concreta (mesa, producto, ...) en vez de un genérico.
export type OpEntity =
  | 'pedido'
  | 'linea_pedido'
  | 'transaccion'
  | 'compra'
  | 'movimiento_kardex'
  | 'turno'
  | 'mesa'
  | 'producto'
  | 'insumo'
  | 'receta'
  | 'cuenta_bancaria'
  | 'metodo_pago'
  | 'impresora';

export type OpStatus = 'APLICADO' | 'FALLO_TERMINAL' | 'FALLO_REINTENTABLE';

interface RecordOpts {
  entity: OpEntity;
  operation: string;
  clientOpId?: string;
}

function safeStringify(value: unknown, max: number): string {
  try {
    const json = JSON.stringify(value);
    if (!json) return '';
    return json.length > max ? json.slice(0, max) : json;
  } catch {
    return '';
  }
}

// Enriquecimiento de empresa: solo se consulta la BD cuando ni el body ni el
// resultado traen companyId (happy path sin costo extra).
// ruta → id: pedido (abrir/recuperar_resultado), linea_pedido y enviar_cocina
// (params.id = orderId), cobrar/marcar (mesa), catálogos concretos (params.id).
const CATALOGO_MODELO: Record<string, 'table' | 'product' | 'insumo' | 'recipe' | 'bankAccount' | 'customPaymentMethod' | 'printer'> = {
  mesa: 'table',
  producto: 'product',
  insumo: 'insumo',
  receta: 'recipe',
  cuenta_bancaria: 'bankAccount',
  metodo_pago: 'customPaymentMethod',
  impresora: 'printer',
};

async function lookupCompanyId(req: Request, entity: OpEntity): Promise<string | null> {
  const params = req.params as Record<string, string | undefined>;

  if (entity === 'linea_pedido' && params.id) {
    const order = await prisma.order.findUnique({ where: { id: params.id }, select: { companyId: true } });
    if (order) return order.companyId;
  }

  if (entity === 'pedido' && params.id) {
    // enviar_cocina: params.id es orderId; cobrar_mesa/marcar_por_cobrar: mesa
    const order = await prisma.order.findUnique({ where: { id: params.id }, select: { companyId: true } });
    if (order) return order.companyId;
    const table = await prisma.table.findUnique({ where: { id: params.id }, select: { companyId: true } });
    if (table) return table.companyId;
  }

  const modelo = CATALOGO_MODELO[entity];
  if (modelo && params.id) {
    const row = await (prisma as unknown as Record<string, { findUnique: Function }>)[modelo].findUnique({
      where: { id: params.id },
      select: { companyId: true },
    });
    if (row) return row.companyId;
  }

  return null;
}

function extractCompanyId(req: Request, result: unknown): string | null {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (body && typeof body.companyId === 'string' && body.companyId) return body.companyId;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.companyId === 'string' && r.companyId) return r.companyId;
    if (r.order && typeof r.order === 'object') {
      const o = r.order as Record<string, unknown>;
      if (typeof o.companyId === 'string' && o.companyId) return o.companyId;
    }
  }
  return null;
}

export function statusForError(err: unknown): OpStatus {
  if (err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500) {
    return 'FALLO_TERMINAL';
  }
  return 'FALLO_REINTENTABLE';
}

function messageForError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 490) : String(err ?? 'Unknown error').slice(0, 490);
}

// Upsert idempotente por clientOpId (UNIQUE): un reenvío del mismo op incrementa
// numero_intentos y re-fija procesado_en en vez de duplicar la fila.
async function upsertClientOp(data: Prisma.ClientOpUncheckedCreateInput): Promise<void> {
  try {
    await prisma.clientOp.upsert({
      where: { clientOpId: data.clientOpId },
      create: data,
      update: {
        status: data.status,
        attemptCount: { increment: 1 },
        lastError: data.lastError ?? null,
        processedAt: new Date(),
        payload: data.payload,
      },
    });
  } catch (err) {
    // La auditoría NUNCA rompe la respuesta del API.
    console.warn('[oplog] no se pudo registrar la operación en operaciones_cliente:', messageForError(err));
  }
}

// Ledger pasivo de Fase C: fila base para el motor completo de sync (progreso/§7).
// Llamado desde las rutas DESPUÉS del servicio (APLICADO) o en su fallo (FALLO_*).
export async function recordClientOp(
  req: Request,
  opts: RecordOpts,
  outcome: { status: OpStatus; result?: unknown; error?: unknown }
): Promise<void> {
  try {
    const deviceId = req.auth?.deviceId;
    if (!deviceId) return; // sin terminal autenticado no hay quién lo firmó

    const body = (req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}) as Record<string, unknown>;
    const clientOpId =
      opts.clientOpId ??
      (typeof body.clientOpId === 'string' && body.clientOpId ? body.clientOpId : randomUUID());

    const payload = safeStringify(
      { parametros: req.params, consulta: req.query, cuerpo: req.body },
      CARGA_MAX_CHARS
    );

    let companyId = extractCompanyId(req, outcome.result ?? null);
    if (!companyId) {
      try {
        companyId = await lookupCompanyId(req, opts.entity);
      } catch (err) {
        console.warn('[oplog] no se pudo resolver la empresa:', messageForError(err));
      }
    }

    await upsertClientOp({
      id: randomUUID(),
      deviceId,
      companyId,
      entity: opts.entity,
      operation: opts.operation,
      payload,
      clientOpId,
      status: outcome.status,
      attemptCount: 1,
      processedAt: new Date(),
      lastError: outcome.error ? messageForError(outcome.error) : null,
    });
  } catch (err) {
    console.warn('[oplog] error preparando el registro:', messageForError(err));
  }
}
