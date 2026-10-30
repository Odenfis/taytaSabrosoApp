// Aplica todas las migraciones únicamente en una base SQL temporal y la elimina.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const source = process.env.DATABASE_URL;
if (!source?.startsWith('sqlserver://') || !/;database=[^;]+/i.test(source)) throw new Error('Se requiere SQL Server con database explícita.');
const database = 'tayta_bills_migration_test_' + randomUUID().replaceAll('-', '');
const admin = new PrismaClient({ datasourceUrl: source.replace(/;database=[^;]+/i, ';database=master') });
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE [${database}]`);
  created = true;
  const env = { ...process.env, DATABASE_URL: source.replace(/;database=[^;]+/i, ';database=' + database) };
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Migración falló: ${code}`)));
  });
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    const tables = await db.$queryRaw`SELECT name FROM sys.tables WHERE name IN ('cuentas_comensales', 'detalle_cuentas_comensales')`;
    if (tables.length !== 2) throw new Error('Faltan tablas de cuentas individuales.');
    const fields = await db.$queryRaw`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.transacciones') AND name IN ('cuenta_comensal_id', 'monto_recibido_abono', 'vuelto_abono')`;
    if (fields.length !== 3) throw new Error('Faltan columnas de abonos.');
    console.log('Migraciones y estructura de cuentas individuales verificadas.');
  } finally { await db.$disconnect(); }
} finally {
  if (created) {
    await admin.$executeRawUnsafe(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
    await admin.$executeRawUnsafe(`DROP DATABASE [${database}]`);
    console.log('Base temporal eliminada.');
  }
  await admin.$disconnect();
}
