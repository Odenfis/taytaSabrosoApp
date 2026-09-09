// Genera db/modeladobase.dbml a partir de server/prisma/schema.prisma
// Uso: node db/gen-dbml.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dir, '..', 'server', 'prisma', 'schema.prisma');
const outPath = path.join(dir, 'modeladobase.dbml');
const src = readFileSync(schemaPath, 'utf8');

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

function refTargetCol(targetModel, refField) {
  const tbl = models.find((x) => x.prismaName === targetModel);
  if (!tbl) return null;
  const f = tbl.fields.find((x) => x.scopeName === refField);
  return f ? f.phys : refField;
}

const lines = [];
lines.push('// ============================================================');
lines.push('// Tayta & Sabroso POS — Modelado físico de la Base de Datos');
lines.push('// Generado desde: server/prisma/schema.prisma');
lines.push('// Para importar en: https://dbdiagram.io');
lines.push('//');
lines.push('// Convenciones:');
lines.push('//  - Multi-empresa por fila: empresa_id NULL = recurso compartido (\'ambas\'/holding).');
lines.push('//  - id_operacion_cliente UNIQUE = clave de idempotencia del motor de sync (offline-first).');
lines.push('//  - Sin enums (SQL Server): estados/tipos como nvarchar validados en servicios.');
lines.push('//  - delete: cascade solo en composiciones puras; el resto es NO ACTION.');
lines.push('//    (dbdiagram.io no renderiza acciones ON DELETE: se marca con // cascade)');
lines.push('//  - mesas.pedido_actual_id NO tiene FK (referencia circular documentada en el schema).');
lines.push('// ============================================================');
lines.push('');

for (const tbl of models) {
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
  lines.push('');
}

writeFileSync(outPath, lines.join('\n'));
const dbmlText = lines.join('\n');

// Validación ligera: referencias existen y llaves balanceadas
const tables = new Set(models.map((x) => x.physTable));
const errors = [];
for (const t of models) {
  for (const r of t.relations) {
    const tgt = modelMap[r.targetModel];
    const col = refTargetCol(r.targetModel, r.refField);
    const tgtModel = models.find((x) => x.physTable === tgt);
    if (!tables.has(tgt)) errors.push(`${t.physTable}.${r.localField} -> tabla desconocida ${tgt}`);
    else if (col && tgtModel && !tgtModel.fields.some((f) => f.phys === col)) {
      errors.push(`${t.physTable}.${r.localField} -> columna desconocida ${tgt}.${col}`);
    }
  }
}
const nOpen = (dbmlText.match(/{/g) || []).length;
const nClose = (dbmlText.match(/}/g) || []).length;

console.log(`OK: ${models.length} tablas, ${dbmlText.split('\n').length} líneas -> ${outPath}`);
console.log(`Llaves balanceadas: { ${nOpen} vs } ${nClose} ${nOpen === nClose ? '✔' : '✘'}`);
if (errors.length) {
  console.log('ERRORES:');
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}