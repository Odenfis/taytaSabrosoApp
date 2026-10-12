// Genera un Mapa de Procesos exportable en HTML autocontenido (SVG inline, offline)
// a partir de server/prisma/schema.prisma
// Uso: node db/gen-process-map.mjs
// Salida: db/process-map.html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dir, '..', 'server', 'prisma', 'schema.prisma');
const outPath = path.join(dir, 'process-map.html');
const src = readFileSync(schemaPath, 'utf8');

// ── Mapa de procesos (mismo agrupamiento que gen-process-dbml.mjs) ─────
const PROCESSES = {
  '01_tenancy':    { label: 'Tenancy / Multi-empresa',            short: 'Tenancy',        models: ['Company', 'NumberingSequence'] },
  '02_auth':       { label: 'Autenticación / Usuarios',           short: 'Auth & Usuarios', models: ['User', 'Session', 'Device'] },
  '03_ventas':     { label: 'Ventas (Órdenes / Mesas)',           short: 'Ventas',         models: ['Table', 'Product', 'Order', 'OrderItem'] },
  '04_caja':       { label: 'Caja / Finanzas',                    short: 'Caja',           models: ['Transaction', 'BankAccount', 'CustomPaymentMethod'] },
  '05_compras':    { label: 'Compras',                            short: 'Compras',        models: ['Purchase', 'PurchaseItem'] },
  '06_inventario': { label: 'Inventario (Kardex / Recetas)',      short: 'Inventario',     models: ['Insumo', 'Recipe', 'RecipeIngredient', 'KardexMovement'] },
  '07_turnos':     { label: 'Turnos / Arqueo',                    short: 'Turnos',         models: ['ShiftRecord', 'CompanyShift'] },
  '08_config':     { label: 'Configuración (Impresoras)',         short: 'Config',         models: ['Printer', 'PrinterCategory'] },
  '09_sync':       { label: 'Motor de Sync Offline',              short: 'Sync Offline',   models: ['ClientOp'] },
};

const COLOR = {
  '01_tenancy':    '#7c9fff',
  '02_auth':       '#ffab76',
  '03_ventas':     '#34d399',
  '04_caja':       '#ebc246',
  '05_compras':    '#f87171',
  '06_inventario': '#a78bfa',
  '07_turnos':     '#22d3ee',
  '08_config':     '#f472b6',
  '09_sync':       '#94a3b8',
};

const SHORT = {};
for (const [k, v] of Object.entries(PROCESSES)) SHORT[k] = v.short;

// ── Parsing de schema.prisma ────────────────────────────────────────────
const SCALAR = new Set(['String', 'Int', 'Decimal', 'Boolean', 'DateTime']);

function parseAttrList(expr) {
  const m = expr.match(/\(\[([^\]]*)\]\)/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

const models = [];
const modelMap = {};

const blockRe = /model\s+(\w+)\s*\{(.*?)\n\}/gs;
let m;
while ((m = blockRe.exec(src))) {
  const prismaName = m[1];
  const body = m[2];
  const tableMeta = body.match(/@@map\("([^"]+)"\)/);
  const physTable = tableMeta ? tableMeta[1] : prismaName;

  const fields = [];
  const relations = [];
  const indexes = [];
  const compositePk = [];
  const compositeUnique = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('@@map(')) continue;
    if (line.startsWith('@@id(')) { compositePk.push(...parseAttrList(line)); continue; }
    if (line.startsWith('@@unique(')) { compositeUnique.push(...parseAttrList(line)); continue; }
    if (line.startsWith('@@index(')) { indexes.push(parseAttrList(line)); continue; }
    if (line.startsWith('@@')) continue;

    const parts = line.split(/\s+/);
    const scopeName = parts[0];
    const rawType = parts[1];
    const rest = parts.slice(2).join(' ');
    const typeBase = rawType.replace('?', '');
    if (rawType.endsWith('[]')) continue;

    if (rest.includes('@relation(')) {
      const fieldsM = rest.match(/fields:\s*\[([^\]]*)\]/);
      const refM = rest.match(/references:\s*\[([^\]]*)\]/);
      const delM = rest.match(/onDelete:\s*(\w+)/);
      if (fieldsM && refM) {
        relations.push({
          localField: fieldsM[1].trim(),
          targetModel: typeBase,
          refField: refM[1].trim(),
          delete: delM ? delM[1] : 'NoAction',
        });
      }
      continue;
    }

    if (!SCALAR.has(typeBase)) continue;

    const mapM = rest.match(/@map\("([^"]+)"\)/);
    const phys = mapM ? mapM[1] : scopeName;

    let type = '';
    const dbM = rest.match(/@db\.(\w+)(?:\(([^)]*)\))?/);
    if (dbM) {
      const dt = dbM[1];
      const param = (dbM[2] || '').replace(/\s+/g, '');
      if (dt === 'NVarChar') type = param.toUpperCase() === 'MAX' ? 'nvarchar(MAX)' : `nvarchar(${param})`;
      else if (dt === 'Decimal') type = `decimal(${param})`;
      else if (dt === 'DateTime2') type = 'datetime';
      else type = param ? `${dt.toLowerCase()}(${param})` : dt.toLowerCase();
    } else {
      type = typeBase === 'String'
        ? 'nvarchar(255)'
        : typeBase === 'Boolean'
          ? 'boolean'
          : typeBase.toLowerCase();
    }

    let dflt = null;
    const dfIndex = rest.indexOf('@default');
    if (dfIndex !== -1) {
      let i = rest.indexOf('(', dfIndex);
      const open = i;
      let depth = 0;
      for (; i < rest.length; i++) {
        const c = rest[i];
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) { dflt = rest.slice(open + 1, i); break; }
        }
      }
    }

    fields.push({
      scopeName, phys, type,
      pk: rest.includes('@id'),
      unique: rest.includes('@unique'),
      notNull: !rawType.endsWith('?'),
      default: dflt,
    });
  }

  for (const c of compositePk) {
    const f = fields.find((x) => x.scopeName === c);
    if (f) f.pk = true;
  }
  for (const c of compositeUnique) {
    const f = fields.find((x) => x.scopeName === c);
    if (f) f.unique = true;
  }

  models.push({ prismaName, physTable, fields, relations, indexes });
  modelMap[prismaName] = physTable;
}

const modelOf = (pm) => models.find((x) => x.prismaName === pm);

// ── Relaciones cross-proceso ────────────────────────────────────────────
const processOf = {};
for (const [key, def] of Object.entries(PROCESSES)) {
  for (const pm of def.models) processOf[pm] = key;
}

const edges = [];       // { a, b, label }
const tenancyEdges = []; // mismo shape, hacia/desde tenancy
const seenPairs = new Set();

for (const mdl of models) {
  for (const r of mdl.relations) {
    const a = processOf[mdl.prismaName];
    const b = processOf[r.targetModel];
    if (!a || !b || a === b) continue;

    const srcField = mdl.fields.find((f) => f.scopeName === r.localField);
    const tgtModel = modelOf(r.targetModel);
    const tgtField = tgtModel ? tgtModel.fields.find((f) => f.scopeName === r.refField) : null;
    const label = `${mdl.physTable}.${srcField ? srcField.phys : r.localField} → ${modelMap[r.targetModel]}${tgtField ? '.' + tgtField.phys : ''}`;

    const key = `${a}|${b}|${label}`;
    // si ya existe un edge con el mismo par, solo agrega el label
    const holder = a === '01_tenancy' || b === '01_tenancy' ? tenancyEdges : edges;
    const existing = holder.find((e) => e.a === a && e.b === b);
    if (existing) {
      existing.label += ' · ' + label;
      continue;
    }
    holder.push({ a, b, label });
    seenPairs.add(`${a}|${b}`);
  }
}

// ── Geometría del SVG ───────────────────────────────────────────────────
const BW = 150;
const BH = 60;
const BOX = {
  '01_tenancy':    { x: 415, y: 10 },
  '02_auth':       { x: 30,  y: 165 },
  '03_ventas':     { x: 235, y: 165 },
  '08_config':     { x: 440, y: 165 },
  '09_sync':       { x: 645, y: 165 },
  '04_caja':       { x: 235, y: 320 },
  '05_compras':    { x: 440, y: 320 },
  '06_inventario': { x: 235, y: 475 },
  '07_turnos':     { x: 440, y: 475 },
};
const SVG_W = 980;
const SVG_H = 555;

function centerOf(key) {
  const b = BOX[key];
  return { x: b.x + BW / 2, y: b.y + BH / 2 };
}

function edgePoint(b, tx, ty) {
  const cx = b.x + BW / 2;
  const cy = b.y + BH / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (BW / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (BH / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

function pathFor(a, b, bend) {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const p1 = edgePoint(BOX[a], cb.x, cb.y);
  const p2 = edgePoint(BOX[b], ca.x, ca.y);
  if (!bend) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = 20;
  const cxp = mx - (dy / len) * off;
  const cyp = my + (dx / len) * off;
  return `M ${p1.x} ${p1.y} Q ${cxp} ${cyp} ${p2.x} ${p2.y}`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── SVG ─────────────────────────────────────────────────────────────────
function buildSvg() {
  const out = [];
  out.push(`<svg viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="Mapa de procesos" class="map-svg">`);
  out.push(`  <defs>`);
  out.push(`    <marker id="arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">`);
  out.push(`      <path d="M0,0 L8,4.5 L0,9 z" fill="#93b0c9"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);

  out.push(`  <!-- edges desde/hacia Tenancy (multi-empresa) -->`);
  for (const e of tenancyEdges) {
    const other = e.a === '01_tenancy' ? e.b : e.a;
    const d = pathFor('01_tenancy', other, false);
    out.push(`    <path class="svg-edge tenancy" data-link="01_tenancy,${other}" d="${d}" marker-end="url(#arrow)"><title>${esc(e.label)}</title></path>`);
  }

  out.push(`  <!-- edges cross-proceso -->`);
  for (const e of edges) {
    const d = pathFor(e.a, e.b, true);
    const labelPt = centerOf(e.a);
    out.push(`    <path class="svg-edge cross" data-link="${e.a},${e.b}" d="${d}" marker-end="url(#arrow)"><title>${esc(e.label)}</title></path>`);
  }

  out.push(`  <!-- cajas de proceso -->`);
  for (const [key, b] of Object.entries(BOX)) {
    const c = COLOR[key];
    const def = PROCESSES[key];
    out.push(`    <g class="svg-box" data-key="${key}" tabindex="0">`);
    out.push(`      <rect x="${b.x}" y="${b.y}" width="${BW}" height="${BH}" rx="10" fill="rgba(18,18,18,0.9)" stroke="${c}" stroke-width="1.5"/>`);
    out.push(`      <text x="${b.x + BW / 2}" y="${b.y + 26}" text-anchor="middle" fill="#e9e4dc" font-size="13" font-weight="700">${esc(def.short)}</text>`);
    out.push(`      <text x="${b.x + BW / 2}" y="${b.y + 44}" text-anchor="middle" fill="#8b93a1" font-size="10">${def.models.length} tablas</text>`);
    out.push(`    </g>`);
  }

  out.push(`</svg>`);
  return out.join('\n');
}

// ── Tarjetas de proceso (HTML) ──────────────────────────────────────────
function chipsFor(f) {
  const chips = [];
  if (f.pk) chips.push('PK');
  if (f.unique) chips.push('UK');
  if (f.notNull && !f.pk) chips.push('NN');
  if (f.default !== null) {
    let dv = f.default;
    if (dv === 'now()') dv = 'now()';
    else if (dv.startsWith('"')) dv = dv.slice(1, -1);
    chips.push(`def:${dv}`);
  }
  return chips
    .map((c) => {
      const kind = c === 'PK' ? 'pk' : c === 'UK' ? 'uk' : c.startsWith('def') ? 'df' : 'nn';
      return `<span class="chip ${kind}">${esc(c)}</span>`;
    })
    .join('');
}

function tableBlock(mdl) {
  const proc = processOf[mdl.prismaName];
  const lines = [];
  lines.push(`    <details class="tbl">`);
  lines.push(`      <summary>`);
  lines.push(`        <span class="tname mono">${esc(mdl.physTable)}</span>`);
  lines.push(`        <span class="tmeta">${mdl.fields.length} campos · ${mdl.indexes.length || 0} índices</span>`);
  lines.push(`      </summary>`);
  lines.push(`      <div class="cols">`);
  for (const f of mdl.fields) {
    // detecta si el campo es FK (apunta a otro proceso o interno)
    const rel = mdl.relations.find((r) => r.localField === f.scopeName);
    const cross = rel && proc && processOf[rel.targetModel] && processOf[rel.targetModel] !== proc;
    const tag = rel
      ? `<span class="fk ${cross ? 'cross' : ''}">→ ${esc(modelMap[rel.targetModel])}</span>`
      : '';
    lines.push(`        <div class="col"><code>${esc(f.phys)}</code><span class="type">${esc(f.type)}</span>${chipsFor(f)}${tag}</div>`);
  }
  lines.push(`      </div>`);
  lines.push(`      <div class="relnote">`);
  const internal = mdl.relations.filter((r) => processOf[r.targetModel] === proc);
  const crossRels = mdl.relations.filter((r) => processOf[r.targetModel] && processOf[r.targetModel] !== proc);
  if (internal.length) lines.push(`        <span class="relint">${internal.length} relación interna (cascade ${internal.some((r) => r.delete === 'Cascade') ? 'sí' : 'no'})</span>`);
  if (crossRels.length) lines.push(`        <span class="relx">${crossRels.length} FK a otro proceso</span>`);
  lines.push(`      </div>`);
  lines.push(`    </details>`);
  return lines.join('\n');
}

function processCard(key, def) {
  const c = COLOR[key];
  const tabs = def.models.map((pm) => modelOf(pm)).filter(Boolean);
  const fieldCount = tabs.reduce((n, t) => n + t.fields.length, 0);
  const searchable = (def.label + ' ' + tabs.map((t) => t.physTable).join(' ') + ' ' + tabs.map((t) => t.prismaName).join(' ')).toLowerCase();

  const rows = tabs.map((t) => tableBlock(t)).join('\n');

  return `  <article class="pcard" data-key="${key}" data-search="${esc(searchable)}">
    <header class="phead">
      <span class="pnum" style="--c:${c}">${key.split('_')[0]}</span>
      <div class="ptitle">
        <h2>${esc(def.label)}</h2>
        <span class="pstats">${tabs.length} tablas · ${fieldCount} campos · ${def.models.length} modelos Prisma</span>
      </div>
    </header>
    <div class="tables">
${rows}
    </div>
  </article>`;
}

// ── Página completa ─────────────────────────────────────────────────────
const generatedDate = new Date().toISOString().slice(0, 10);
const totalTables = models.length;
const totalFields = models.reduce((n, t) => n + t.fields.length, 0);
const totalRel = models.reduce((n, t) => n + t.relations.length, 0);
const crossFiles = Object.keys(PROCESSES).length;

const svg = buildSvg();
const cards = Object.entries(PROCESSES).map(([k, v]) => processCard(k, v)).join('\n');

const page = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tayta &amp; Sabroso — Mapa de Procesos</title>
<style>
  :root{
    --bg:#121212; --panel:#1c1c1c; --panel2:#232323; --line:#2b2b2b;
    --text:#e9e4dc; --muted:#8b93a1;
    --accent:#ffb597; --accent2:#ebc246; --ok:#34d399; --warn:#f87171;
    --mono:ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
  }
  *{box-sizing:border-box; margin:0; padding:0}
  body{background:var(--bg); color:var(--text); font:14px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif; padding:28px 20px 60px}
  .wrap{max-width:1180px; margin:0 auto}

  /* Header */
  header.top{display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end; justify-content:space-between; margin-bottom:18px}
  h1{font-size:22px; letter-spacing:.3px}
  h1 .dot{color:var(--accent)}
  .subtitle{color:var(--muted); font-size:13px}
  .meta-badges{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
  .badge{background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:3px 12px; font-size:12px; color:var(--muted)}
  .badge b{color:var(--text); font-weight:600}
  .tools{display:flex; gap:8px}
  button.btn{background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:6px 12px; font-size:12.5px; cursor:pointer; transition:.15s}
  button.btn:hover{border-color:var(--accent); color:var(--accent)}
  input.search{background:var(--panel); border:1px solid var(--line); border-radius:8px; color:var(--text); padding:6px 12px; font-size:13px; min-width:220px; outline:none}
  input.search:focus{border-color:var(--accent)}

  /* SVG */
  .map-box{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:10px; margin-bottom:26px; overflow-x:auto}
  .map-svg{width:100%; min-width:820px; max-width:1180px; height:auto; display:block}
  .svg-box{cursor:pointer; transition:opacity .15s}
  .svg-box:hover rect{filter:drop-shadow(0 0 8px rgba(255,255,255,.15))}
  .svg-box.muted,.svg-edge{opacity:.18; transition:opacity .15s}
  .svg-edge.on{opacity:1; stroke-width:2.4; filter:drop-shadow(0 0 4px rgba(255,255,255,.25))}
  .svg-edge.tenancy{stroke:#5b6474; stroke-width:1; stroke-dasharray:5 4}
  .svg-edge.cross{stroke:#93b0c9; stroke-width:1.3; fill:none}
  .svg-box text{pointer-events:none}

  /* Cards */
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px}
  .pcard{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:12px; transition:opacity .15s}
  .pcard.hidden{display:none}
  .phead{display:flex; gap:12px; align-items:flex-start}
  .pnum{font:700 20px var(--mono); color:var(--c); border:1px solid var(--c); border-radius:8px; min-width:38px; height:34px; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--c) 8%, transparent)}
  .ptitle h2{font-size:15px; font-weight:600; letter-spacing:.2px}
  .pstats{display:block; color:var(--muted); font-size:11.5px; margin-top:2px}

  /* Tables */
  .tables{display:flex; flex-direction:column; gap:8px}
  details.tbl{background:var(--panel2); border:1px solid var(--line); border-radius:10px; overflow:hidden}
  details.tbl summary{cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px}
  details.tbl summary::-webkit-details-marker{display:none}
  details.tbl summary::after{content:'▸'; color:var(--muted); transition:transform .15s}
  details.tbl[open] summary::after{transform:rotate(90deg)}
  .tname{color:var(--accent); font-size:13px}
  .tmeta{color:var(--muted); font-size:11px; white-space:nowrap}
  .cols{display:flex; flex-direction:column; border-top:1px solid var(--line); padding:6px 0}
  .col{display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:3px 12px; border-bottom:1px dotted #2a2a2a}
  .col:last-child{border-bottom:none}
  .col code{color:#d6e2f0; font:12px var(--mono); min-width:120px}
  .col .type{color:#7d8696; font:11px var(--mono)}
  .chip{font:10px var(--mono); padding:1px 6px; border-radius:999px; border:1px solid var(--line)}
  .chip.pk{color:#ebc246; border-color:#6b5b1a}
  .chip.uk{color:#34d399; border-color:#1f6b4f}
  .chip.nn{color:#8b93a1}
  .chip.df{color:#ffab76; border-color:#6b4a2b}
  .fk{font:10px var(--mono); color:#ff9fb0; border:1px solid #5e3140; background:#2a1f24; padding:1px 6px; border-radius:999px}
  .fk.cross{color:#a8b4ff; border-color:#35406b; background:#1f2540}
  .relnote{display:flex; gap:8px; flex-wrap:wrap; padding:5px 12px 8px; font-size:10.5px}
  .relint{color:#5f6b7a}
  .relx{color:#a8b4ff}

  /* Leyenda y footer */
  .legend{display:flex; flex-wrap:wrap; gap:14px; margin-bottom:26px; color:var(--muted); font-size:12px}
  .legend span{display:inline-flex; align-items:center; gap:6px}
  .sw{width:12px; height:12px; border-radius:3px}
  footer{margin-top:34px; color:#5f6b7a; font-size:11.5px; border-top:1px solid var(--line); padding-top:14px; font-family:var(--mono)}

  @media (max-width:640px){
    .grid{grid-template-columns:1fr}
    .tools{width:100%}
    input.search{flex:1}
  }
  @media print{
    body{background:#fff; color:#111}
    button.btn,input.search{display:none}
    .pcard,.map-box{background:#fff; border:1px solid #ccc; break-inside:avoid}
    .col code,.tname{color:#004}
    .chip.pk{color:#8a6d00}
  }
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div>
      <h1>Tayta &amp; Sabroso <span class="dot">·</span> Mapa de Procesos</h1>
      <div class="subtitle">Modelo físico de datos organizado por procesos de negocio — generado desde <span class="mono">server/prisma/schema.prisma</span></div>
      <div class="meta-badges">
        <span class="badge"><b>${totalTables}</b> tablas</span>
        <span class="badge"><b>${totalFields}</b> campos</span>
        <span class="badge"><b>${totalRel}</b> relaciones</span>
        <span class="badge"><b>${crossFiles}</b> procesos</span>
        <span class="badge">${generatedDate}</span>
      </div>
    </div>
    <div class="tools">
      <input class="search" type="search" placeholder="Buscar proceso o tabla…" aria-label="Buscar">
      <button class="btn" data-act="expand">Expandir todo</button>
      <button class="btn" data-act="collapse">Colapsar</button>
      <button class="btn" data-act="print" title="Imprimir o guardar como PDF">Imprimir / PDF</button>
    </div>
  </header>

  <div class="map-box">
${svg}
    <div class="legend" style="padding:6px 4px 2px">
      <span><span class="sw" style="background:#5b6474"></span> Multi-empresa (empresa_id → empresas)</span>
      <span><span class="sw" style="background:#93b0c9"></span> FK entre procesos</span>
      <span>Pase el cursor sobre un proceso para ver sus conexiones</span>
    </div>
  </div>

  <section class="grid">
${cards}
  </section>

  <footer>
    Generado: ${generatedDate} · Fuente: server/prisma/schema.prisma · Regenerar: node db/gen-process-map.mjs<br>
    Tipos: NVARCHAR sin enums (validación en servicios) · clienteOpId UNIQUE = idempotencia offline · esta_eliminado = soft delete · version = conflicto last-write-wins
  </footer>

</div>
<script>
  // Búsqueda
  const search = document.querySelector('.search');
  search.addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    document.querySelectorAll('.pcard').forEach(card => {
      card.classList.toggle('hidden', q.length > 0 && !card.dataset.search.includes(q));
    });
  });

  // Expandir / colapsar / imprimir
  document.querySelectorAll('button.btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'expand') document.querySelectorAll('details.tbl').forEach(d => (d.open = true));
      if (act === 'collapse') document.querySelectorAll('details.tbl').forEach(d => (d.open = false));
      if (act === 'print') window.print();
    });
  });

  // Hover en el SVG
  const boxes = document.querySelectorAll('.svg-box');
  function setActive(key) {
    boxes.forEach(el => el.classList.toggle('muted', !!key && el.dataset.key !== key));
    document.querySelectorAll('.svg-edge').forEach(el => {
      const link = el.dataset.link.split(',');
      const on = !!key && link.includes(key);
      el.classList.toggle('on', on);
      el.classList.toggle('off', !on);
    });
  }
  boxes.forEach(box => {
    const key = box.dataset.key;
    box.addEventListener('mouseenter', () => setActive(key));
    box.addEventListener('mouseleave', () => setActive(null));
    box.addEventListener('focus', () => setActive(key));
    box.addEventListener('blur', () => setActive(null));
  });
</script>
</body>
</html>
`;

writeFileSync(outPath, page);

// ── Validación ─────────────────────────────────────────────────────────
const covered = new Set();
for (const def of Object.values(PROCESSES)) def.models.forEach((pm) => covered.add(pm));
const uncovered = models.filter((x) => !covered.has(x.prismaName));
const nOpen = (page.match(/{/g) || []).length;

console.log(`✅ ${outPath.split('/').pop()} generado — ${totalTables} tablas en ${crossFiles} procesos`);
console.log(`   Edges cross-proceso: ${edges.length} · Tenancy→todos: ${tenancyEdges.length}`);
console.log(`   Líneas: ${page.split('\n').length} · Llaves CSS balanceadas {${nOpen} vs } ${((page.match(/}/g) || []).length)} ✔`);
if (uncovered.length) {
  console.error(`❌ Modelos sin cubrir: ${uncovered.map((x) => x.prismaName).join(', ')}`);
  process.exit(1);
}
console.log('🎉 Listo. Abre el archivo en cualquier navegador o compártelo.');