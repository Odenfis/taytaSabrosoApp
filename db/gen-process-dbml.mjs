// Genera DBML fragmentado por procesos de negocio a partir de server/prisma/schema.prisma
// Uso: node db/gen-process-dbml.mjs
// Salida: db/processes/01_tenancy.dbml … 09_sync.dbml + _all.dbml
//
// Cada archivo contiene solo las tablas de su proceso.
// Las referencias a tablas de otros procesos quedan como ref: inline
// (se resuelven al importar varios archivos en dbdiagram.io).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dir, '..', 'server', 'prisma', 'schema.prisma');
const outDir = path.join(dir, 'processes');
const src = readFileSync(schemaPath, 'utf8');

// ── Mapa de procesos: nombre archivo → modelos Prisma ──────────────────
const PROCESSES = {
  '01_tenancy':    { label: 'Tenancy / Multi-empresa',              models: ['Company', 'NumberingSequence'] },
  '02_auth':       { label: 'Autenticación / Usuarios / Dispositivos', models: ['User', 'Session', 'Device'] },
  '03_ventas':     { label: 'Ventas (Órdenes / Mesas / Productos)',  models: ['Table', 'Product', 'Order', 'OrderItem'] },
  '04_caja':       { label: 'Caja / Libro de Transacciones / Finanzas', models: ['Transaction', 'BankAccount', 'CustomPaymentMethod'] },
  '05_compras':    { label: 'Compras',                               models: ['Purchase', 'PurchaseItem'] },
  '06_inventario': { label: 'Inventario (Kardex / Insumos / Recetas)', models: ['Insumo', 'Recipe', 'RecipeIngredient', 'KardexMovement'] },
  '07_turnos':     { label: 'Turnos / Arqueo de Caja',              models: ['ShiftRecord', 'CompanyShift'] },
  '08_config':     { label: 'Configuración (Impresoras)',            models: ['Printer', 'PrinterCategory'] },
  '09_sync':       { label: 'Motor de Sync Offline (ClientOp)',      models: ['ClientOp'] },
};

// ── Parsing de schema.prisma (adaptado de gen-dbml.mjs) ────────────────
const SCALAR = new Set(['String', 'Int', 'Decimal', 'Boolean', 'DateTime']);

function parseAttrList(expr) {
  const m = expr.match(/\(\[([^\]]*)\]\)/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

const models = [];
const modelMap = {}; // prismaName → physTable

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
      scopeName,
      phys,
      type,
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

// ── Helpers de generación DBML ──────────────────────────────────────────

function refTargetCol(targetModel, refField) {
  const tbl = models.find((x) => x.prismaName === targetModel);
  if (!tbl) return null;
  const f = tbl.fields.find((x) => x.scopeName === refField);
  return f ? f.phys : refField;
}

function generateTable(tbl) {
  const lines = [];
  lines.push(`// Prisma model: ${tbl.prismaName}`);
  lines.push(`Table ${tbl.physTable} {`);

  for (const f of tbl.fields) {
    const flags = [];
    if (f.pk) flags.push('pk');
    if (f.unique) flags.push('unique');
    if (f.notNull && !f.pk) flags.push('not null');

    let cascadeNote = false;
    const rel = tbl.relations.find((r) => r.localField === f.scopeName);
    if (rel) {
      const tgt = modelMap[rel.targetModel];
      const col = refTargetCol(rel.targetModel, rel.refField);
      const optional = !f.notNull;
      flags.push(`ref: >${optional ? '?' : ''} ${tgt}.${col}`);
      cascadeNote = rel.delete === 'Cascade';
    }

    if (f.default !== null) {
      let dv = f.default;
      if (dv === 'now()') dv = '`now()`';
      else if (dv.startsWith('"') && dv.endsWith('"')) dv = `'${dv.slice(1, -1)}'`;
      else if (!/^-?\d+(\.\d+)?$/.test(dv) && dv !== 'true' && dv !== 'false') dv = `'${dv}'`;
      flags.push(`default: ${dv}`);
    }

    const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
    const note = cascadeNote ? ' // delete: cascade' : '';
    lines.push(`  ${f.phys} ${f.type}${flagStr}${note}`);
  }

  if (tbl.indexes.length) {
    lines.push('');
    lines.push('  indexes {');
    for (const ix of tbl.indexes) {
      const phys = ix.map((c) => {
        const fl = tbl.fields.find((x) => x.scopeName === c);
        return fl ? fl.phys : c;
      });
      lines.push(`    (${phys.join(', ')}) [name: 'ix_${tbl.physTable}_${phys.join('_')}']`);
    }
    lines.push('  }');
  }

  lines.push('}');
  return lines;
}

function generateProcessFile(key, processDef, allTables) {
  const lines = [];
  const timestamp = new Date().toISOString().slice(0, 10);

  lines.push('// ============================================================');
  lines.push(`// Tayta & Sabroso POS — ${processDef.label}`);
  lines.push(`// Generado: ${timestamp} | Desde: server/prisma/schema.prisma`);
  lines.push('// Para importar en: https://dbdiagram.io');
  lines.push('//');
  lines.push(`// Tablas: ${processDef.models.map((pm) => modelMap[pm]).join(', ')}`);
  lines.push('//');
  lines.push('// Nota: referencias a tablas de otros procesos quedan como ref: inline.');
  lines.push('// Importar varios archivos .dbml en dbdiagram.io para resolverlas.');
  lines.push('// ============================================================');
  lines.push('');

  for (const pm of processDef.models) {
    const tbl = allTables.find((t) => t.prismaName === pm);
    if (!tbl) {
      console.error(`  ⚠ Modelo "${pm}" no encontrado en el schema`);
      continue;
    }
    lines.push(...generateTable(tbl));
    lines.push('');
  }

  return lines.join('\n');
}

// ── Generación ─────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });

const allFiles = [];
let totalTables = 0;
const coveredModels = new Set();

for (const [key, def] of Object.entries(PROCESSES)) {
  const content = generateProcessFile(key, def, models);
  const outPath = path.join(outDir, `${key}.dbml`);
  writeFileSync(outPath, content);

  const tableCount = def.models.length;
  totalTables += tableCount;
  def.models.forEach((pm) => coveredModels.add(pm));

  console.log(`  ✅ ${key}.dbml — ${def.label} (${tableCount} tablas: ${def.models.map((pm) => modelMap[pm]).join(', ')})`);
  allFiles.push({ key, content });
}

// ── Generar _all.dbml ──────────────────────────────────────────────────

const allLines = [];
allLines.push('// ============================================================');
allLines.push('// Tayta & Sabroso POS — Modelo completo (consolidado)');
allLines.push('// Generado por: db/gen-process-dbml.mjs');
allLines.push('// Para importar en: https://dbdiagram.io');
allLines.push('//');
allLines.push('// Este archivo concatena los 9 procesos de negocio.');
allLines.push('// Equivalente a db/modeladobase.dbml pero generado desde fragmentos.');
allLines.push('// ============================================================');
allLines.push('');

for (const { content } of allFiles) {
  allLines.push(content);
  allLines.push('');
}

const allOutPath = path.join(outDir, '_all.dbml');
writeFileSync(allOutPath, allLines.join('\n'));

// ── Validación ─────────────────────────────────────────────────────────

console.log('');
console.log(`📊 Total: ${totalTables} tablas en ${Object.keys(PROCESSES).length} procesos`);

// Verificar que todos los modelos del schema están cubiertos
const uncovered = models.filter((m) => !coveredModels.has(m.prismaName));
if (uncovered.length > 0) {
  console.error(`❌ Modelos sin cubrir: ${uncovered.map((m) => `${m.prismaName} (${m.physTable})`).join(', ')}`);
  process.exit(1);
} else {
  console.log('✅ Todos los modelos del schema están cubiertos');
}

// Verificar referencias
const tables = new Set(models.map((x) => x.physTable));
const errors = [];
for (const t of models) {
  for (const r of t.relations) {
    const tgt = modelMap[r.targetModel];
    const col = refTargetCol(r.targetModel, r.refField);
    if (!tables.has(tgt)) errors.push(`${t.physTable}.${r.localField} -> tabla desconocida ${tgt}`);
    else {
      const tgtModel = models.find((x) => x.physTable === tgt);
      if (col && tgtModel && !tgtModel.fields.some((f) => f.phys === col)) {
        errors.push(`${t.physTable}.${r.localField} -> columna desconocida ${tgt}.${col}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('❌ Errores de referencia:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log('✅ Todas las referencias son válidas');
}

// Verificar _all.dbml
const allText = allLines.join('\n');
const nOpen = (allText.match(/{/g) || []).length;
const nClose = (allText.match(/}/g) || []).length;
console.log(`✅ _all.dbml: ${allText.split('\n').length} líneas, llaves balanceadas {${nOpen} }${nClose} ${nOpen === nClose ? '✔' : '✘'}`);

console.log('');
console.log('🎉 Listo. Archivos generados en db/processes/');
