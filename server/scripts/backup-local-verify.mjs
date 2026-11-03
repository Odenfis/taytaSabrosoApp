// Copia de seguridad y restauración de prueba. No modifica la base de origen.
import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const source = process.env.DATABASE_URL;
const match = source?.match(/;database=([^;]+)/i);
const original = match?.[1];
if (!/^sqlserver:\/\/(localhost|127\.0\.0\.1)(:\d+)?;/i.test(source ?? '')) throw new Error('Esta operación solo permite SQL Server en localhost.');
if (!source?.startsWith('sqlserver://') || !original || !/^[A-Za-z0-9_-]{1,80}$/.test(original) || /^(master|model|msdb|tempdb)$/i.test(original)) throw new Error('Base de origen no permitida.');
const token = randomUUID().replaceAll('-', '');
const restored = `tayta_restore_test_${token}`;
const backup = `/var/opt/mssql/data/tayta_backup_${token}.bak`;
const db = new PrismaClient({ datasourceUrl: source.replace(/;database=[^;]+/i, ';database=master') });
const sqlLiteral = (value) => "N'" + value.replaceAll("'", "''") + "'";
let attemptedRestore = false;
try {
  const existing = await db.$queryRawUnsafe(`SELECT name FROM sys.databases WHERE name = ${sqlLiteral(restored)}`);
  if (existing.length) throw new Error('El nombre de restauración temporal ya existe.');
  await db.$executeRawUnsafe(`BACKUP DATABASE [${original}] TO DISK = ${sqlLiteral(backup)} WITH COPY_ONLY, CHECKSUM`);
  await db.$queryRawUnsafe(`RESTORE VERIFYONLY FROM DISK = ${sqlLiteral(backup)} WITH CHECKSUM`);
  const files = await db.$queryRawUnsafe(`RESTORE FILELISTONLY FROM DISK = ${sqlLiteral(backup)}`);
  if (!files.length || files.some((file) => typeof file.LogicalName !== 'string' || !['D', 'L'].includes(file.Type))) throw new Error('Archivos de respaldo no compatibles con la restauración automática.');
  const moves = files.map((file, index) => `MOVE ${sqlLiteral(file.LogicalName)} TO ${sqlLiteral(`/var/opt/mssql/data/${restored}_${index}.${file.Type === 'L' ? 'ldf' : 'mdf'}`)}`);
  attemptedRestore = true;
  await db.$executeRawUnsafe(`RESTORE DATABASE [${restored}] FROM DISK = ${sqlLiteral(backup)} WITH ${moves.join(', ')}, CHECKSUM`);
  const status = await db.$queryRawUnsafe(`SELECT state_desc FROM sys.databases WHERE name = ${sqlLiteral(restored)}`);
  if (status[0]?.state_desc !== 'ONLINE') throw new Error('La copia restaurada no está en línea.');
  const check = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM [${restored}].[sys].[tables]`);
  if (Number(check[0]?.n) < 1) throw new Error('La copia restaurada no contiene tablas.');
  const copyUrl = source.replace(/;database=[^;]+/i, ';database=' + restored);
  const copy = new PrismaClient({ datasourceUrl: copyUrl });
  try {
    await copy.$executeRawUnsafe('DBCC CHECKDB WITH NO_INFOMSGS, ALL_ERRORMSGS');
    const tables = await copy.$queryRawUnsafe(`SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME <> '_prisma_migrations' ORDER BY TABLE_NAME`);
    const quote = name => '[' + name.replaceAll(']', ']]') + ']';
    const snapshots = [];
    const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row, (_key,value) => typeof value === 'bigint' ? value.toString() : value)).sort())).digest('hex');
    for (const table of tables) {
      const columns = await copy.$queryRaw`SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=${table.name} ORDER BY ORDINAL_POSITION`;
      const query = `SELECT ${columns.map(c => quote(c.name)).join(',')} FROM [dbo].${quote(table.name)}`;
      snapshots.push({ query, hash: digest(await copy.$queryRawUnsafe(query)), name: table.name });
    }
    // Deploy solo sobre la copia restaurada; ninguna migración toca el origen.
    await new Promise((resolve,reject) => {
      const child = spawn(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], {env:{...process.env,DATABASE_URL:copyUrl},stdio:'inherit'});
      child.on('error',reject); child.on('exit',code => code === 0 ? resolve() : reject(new Error(`Actualización de copia falló: ${code}`)));
    });
    for (const snapshot of snapshots) if (digest(await copy.$queryRawUnsafe(snapshot.query)) !== snapshot.hash) throw new Error(`La actualización cambió datos existentes: ${snapshot.name}`);
    await copy.$executeRawUnsafe('DBCC CHECKDB WITH NO_INFOMSGS, ALL_ERRORMSGS');
    console.log(`PASS: CHECKDB, migraciones sobre copia restaurada y contenido de ${snapshots.length} tablas preservado.`);
  } finally { await copy.$disconnect(); }
  console.log(`Respaldo restaurado y verificado: ${backup}; base original: ${original}.`);
} finally {
  if (attemptedRestore) {
    const found = await db.$queryRawUnsafe(`SELECT name FROM sys.databases WHERE name = ${sqlLiteral(restored)}`);
    if (found.length) {
      await db.$executeRawUnsafe(`ALTER DATABASE [${restored}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
      await db.$executeRawUnsafe(`DROP DATABASE [${restored}]`);
      console.log('Base temporal restaurada eliminada.');
    }
  }
  await db.$disconnect();
}
