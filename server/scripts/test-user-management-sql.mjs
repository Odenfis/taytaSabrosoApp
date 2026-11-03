// Base efímera exclusiva; nunca modifica la base configurada.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const source = process.env.DATABASE_URL;
if (!source?.startsWith('sqlserver://') || !/;database=[^;]+/i.test(source)) throw new Error('Se requiere SQL Server con database explícita.');
const database = 'tayta_users_test_' + randomUUID().replaceAll('-', '');
const admin = new PrismaClient({ datasourceUrl: source.replace(/;database=[^;]+/i, ';database=master') });
const env = { ...process.env, DATABASE_URL: source.replace(/;database=[^;]+/i, ';database=' + database), USER_TEST_DATABASE: database };
const run = (args) => new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { env, stdio: 'inherit' }); child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Prueba falló: ' + code))); });
let created = false;
try {
  await admin.$executeRawUnsafe('CREATE DATABASE [' + database + ']'); created = true;
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run(['--import', 'tsx', 'tests/user-management.sql.ts']);
} finally {
  if (created) { await admin.$executeRawUnsafe('ALTER DATABASE [' + database + '] SET SINGLE_USER WITH ROLLBACK IMMEDIATE'); await admin.$executeRawUnsafe('DROP DATABASE [' + database + ']'); console.log('Base temporal eliminada.'); }
  await admin.$disconnect();
}
