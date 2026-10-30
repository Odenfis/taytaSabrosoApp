import { Order } from '../types';
import { isHistoricalAdditiveOrder } from './orderTotals';

// Generación gráfica del voucher (estilo rollo térmico de 80mm) sin dependencias.
// El ticket se dibuja en un <canvas> y se exporta como PNG para compartir
// por WhatsApp (ventana nativa Compartir o portapapeles + WhatsApp Desktop).

export interface VoucherHeader {
  name: string;
  ruc: string;
  slogan: string;
  address: string;
}

const TICKET_WIDTH = 320; // ~80mm a 96dpi
const PAD = 16;
const TXT = '11px "Courier New", monospace';
const TXT_BOLD = 'bold 11px "Courier New", monospace';

interface Line {
  text: string;
  lineGap: number;
  bold?: boolean;
  center?: boolean;
  size?: number;
}

function wrap(t: string, maxChars: number): string[] {
  const words = t.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) rows.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) rows.push(cur);
  return rows;
}

export function buildVoucherLines(order: Order, header: VoucherHeader, isPaid: boolean): Line[] {
  const lines: Line[] = [];
  const dash = '-'.repeat(34);

  lines.push({ text: header.name.toUpperCase(), lineGap: 0, bold: true, center: true, size: 15 });
  lines.push({ text: header.slogan, lineGap: 2, center: true, size: 10 });
  lines.push({ text: `RUC: ${header.ruc}`, lineGap: 2, center: true, size: 10 });
  for (const line of wrap(header.address, 38)) lines.push({ text: line, lineGap: 2, center: true, size: 10 });
  if (isPaid) {
    lines.push({ text: `TICKET INTERNO #${order.ticketNumber}`, lineGap: 6, bold: true, center: true, size: 12 });
  } else {
    lines.push({ text: 'COMANDA / CUENTA PRE-VENTA', lineGap: 6, bold: true, center: true, size: 12 });
  }
  lines.push({ text: dash, lineGap: 2, size: 10 });
  lines.push({ text: `Mesa: ${order.tableNumber} (${order.zone})`, lineGap: 2, size: 10 });
  lines.push({ text: `Hora: ${order.closedAt || order.createdAt}`, lineGap: 0, size: 10 });
  lines.push({ text: `Atendido por: ${order.waiter}`, lineGap: 2, size: 10 });
  if (isPaid) {
    lines.push({ text: `Pago: ${order.paymentMethod || 'Efectivo'}`, lineGap: 0, size: 10 });
  }
  lines.push({ text: dash, lineGap: 4, size: 10 });

  // Ítems: nombre a la izquierda, importe a la derecha, notas sangradas.
  const cols = Math.floor((TICKET_WIDTH - PAD * 2) / 6.6) - 12;
  for (const item of order.items) {
    const name = `${item.quantity}x ${item.name}`;
    const total = `S/ ${(item.price * item.quantity).toFixed(2)}`;
    const nameRows = wrap(name, cols);
    nameRows.forEach((row, i) => {
      if (i === 0) row = row.padEnd(cols + 2, ' ') + total;
      lines.push({ text: row, lineGap: i === 0 ? 2 : 0, bold: i === 0, size: 11 });
    });
    if (item.notes) {
      for (const nr of wrap(`* ${item.notes}`, cols)) lines.push({ text: `   ${nr}`, lineGap: 0, size: 9 });
    }
  }
  lines.push({ text: dash, lineGap: 4, size: 10 });

  // Totales
  lines.push({ text: `${isHistoricalAdditiveOrder(order) ? 'Subtotal' : 'Subtotal sin IGV'}:  S/ ${order.subtotal.toFixed(2)}`, lineGap: 2, size: 11 });
  lines.push({ text: `${isHistoricalAdditiveOrder(order) ? 'I.G.V. 18%' : 'IGV incluido 18%'}:  S/ ${order.igv.toFixed(2)}`, lineGap: 0, size: 11 });
  lines.push({ text: `TOTAL:  S/ ${order.total.toFixed(2)}`, lineGap: 6, bold: true, size: 13 });
  if (isPaid) {
    if (order.amountReceived && order.amountReceived > 0) {
      lines.push({ text: `Recibido:  S/ ${order.amountReceived.toFixed(2)}`, lineGap: 2, size: 10 });
    }
    if (order.change && order.change > 0) {
      lines.push({ text: `VUELTO:  S/ ${order.change.toFixed(2)}`, lineGap: 0, bold: true, size: 12 });
    }
  } else {
    lines.push({ text: '*** PENDIENTE DE PAGO ***', lineGap: 4, bold: true, center: true, size: 12 });
  }
  lines.push({ text: dash, lineGap: 6, size: 10 });
  lines.push({ text: '¡Gracias por su preferencia!', lineGap: 2, center: true, size: 10 });
  lines.push({
    text: 'Documento no válido como comprobante de pago',
    lineGap: 2, center: true, size: 8,
  });
  return lines;
}

export function buildVoucherCanvas(order: Order, header: VoucherHeader, isPaid: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const lines = buildVoucherLines(order, header, isPaid);

  // Altura dinámica (mide con el mismo font que dibujará)
  let h = PAD;
  for (const line of lines) {
    ctx.font = line.bold ? TXT_BOLD : TXT;
    h += line.lineGap + 16;
  }
  h += PAD;

  canvas.width = TICKET_WIDTH;
  canvas.height = h;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dibujo
  let y = PAD;
  ctx.fillStyle = '#000';
  for (const line of lines) {
    ctx.font = line.bold ? TXT_BOLD : TXT;
    y += line.lineGap + 12;
    const metrics = ctx.measureText(line.text);
    const x = line.center ? Math.max(PAD, (TICKET_WIDTH - metrics.width) / 2) : PAD;
    ctx.fillText(line.text, x, y);
  }
  return canvas;
}

// Lock de reentrancia: evita que el botón dispare dos shares simultáneos.
let shareInProgress = false;

function canvasToVoucherBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
}

/**
 * Comparte el PNG del voucher por WhatsApp con UN solo mecanismo por entorno:
 * 1. Táctil (móvil/tablet): navigator.share con archivo (ventana nativa del SO).
 *    Tras abrir la hoja nativa NUNCA se cae al portapapeles: si el archivo ya
 *    fue entregado a WhatsApp, el pegado posterior duplicaría el voucher.
 * 2. Desktop (mac/Windows): copia el PNG al portapapeles UNA sola vez y abre
 *    WhatsApp Desktop con borrador vacío (sin texto precargado): lo único que
 *    viaja es lo pegado → 1 Cmd+V = 1 voucher.
 * 3. Fallback final (solo si el portapapeles falla): descarga voucher.png y
 *    abre wa.me vacío para adjuntar manualmente.
 */
export async function shareVoucherImage(
  order: Order,
  header: VoucherHeader,
  isPaid: boolean,
  notify: (msg: string) => void,
): Promise<void> {
  if (shareInProgress) return; // un solo share a la vez
  shareInProgress = true;
  try {
    const canvas = buildVoucherCanvas(order, header, isPaid);
    const blob = await canvasToVoucherBlob(canvas);
    const file = new File([blob], `ticket-interno-${order.ticketNumber}.png`, { type: 'image/png' });

    // 1) Web Share API con archivo: SOLO táctil. En desktop la hoja nativa
    //    entregaba el archivo a WhatsApp y luego el portapapeles pegaba un
    //    segundo voucher en el mismo chat → duplicado.
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Ticket interno #${order.ticketNumber}` });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return; // usuario canceló
        // Error tras haber abierto la hoja: el archivo pudo haberse entregado.
        // No usar portapapeles (pegaría un 2° voucher); solo avisar.
        notify('Revisa WhatsApp: el voucher pudo haberse adjuntado. Si no llegó, intenta de nuevo.');
        return;
      }
    }

    // 2) Desktop: imagen al portapapeles (1 sola escritura) + WhatsApp Desktop
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        notify('Voucher copiado al portapapeles (1 vez). Pégalo en WhatsApp (Cmd+V / Ctrl+V).');
        openWhatsAppApp();
        return;
      }
    } catch {
      // permiso/navegador sin soporte → fallback descarga
    }

    // 3) Fallback: descarga manual (portapapeles no disponible)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    notify('No se pudo copiar. Se descargó el voucher: adjúntalo manualmente en WhatsApp.');
    openWhatsAppApp();
  } finally {
    shareInProgress = false;
  }
}

function openWhatsAppApp() {
  // Sin texto precargado: el voucher (imagen) es el único contenido del chat.
  window.open('https://wa.me/', '_blank', 'noopener,noreferrer');
}
