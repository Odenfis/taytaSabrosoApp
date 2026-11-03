// Ensayo 0008 -> actual, exclusivamente en una base aleatoria. No altera origen.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdtemp, cp, readdir, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const source = process.env.DATABASE_URL;
assert.match(source ?? '', /^sqlserver:\/\/(localhost|127\.0\.0\.1)(:\d+)?;.*;?database=/i);
const database = `tayta_roles_upgrade_${randomUUID().replaceAll('-', '')}`;
const connection = source.replace(/;database=[^;]+/i, ';database=' + database);
const admin = new PrismaClient({ datasourceUrl: source.replace(/;database=[^;]+/i, ';database=master') });
const db = new PrismaClient({ datasourceUrl: connection });
const folder = await mkdtemp(join(tmpdir(), 'tayta-roles-migrations-'));
const run = (schema) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema], { env: { ...process.env, DATABASE_URL: connection }, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`migrate deploy: ${code}`)));
});
let created = false;
try {
  await cp('prisma/schema.prisma', join(folder, 'schema.prisma'));
  await mkdir(join(folder, 'migrations'));
  const migrations = (await readdir('prisma/migrations')).filter(n => /^\d{4}_/.test(n)).sort();
  await cp('prisma/migrations/migration_lock.toml', join(folder, 'migrations/migration_lock.toml'));
  for (const name of migrations.filter(n => n.slice(0,4) <= '0008')) await cp(join('prisma/migrations', name), join(folder, 'migrations', name), { recursive: true });
  await admin.$executeRawUnsafe(`CREATE DATABASE [${database}]`); created = true;
  await run(join(folder, 'schema.prisma'));
  await db.company.create({ data: { id:'upgrade-company', name:'Prueba', tradeName:'Prueba', ruc:'20999999999', specialty:'', themeColor:'', accentColor:'', badgeText:'', address:'' } });
  for (const [id, role] of [['admin','Administrador'], ['legacy','Coordinador'], ['kitchen','Jefe de Cocina']]) await db.user.create({ data: { id, name:id, role, pinHash:'fixture-hash-preserved', terminal:'test' } });
  await db.device.create({ data: { id:'device', name:'Prueba', terminalCode:'UPGRADE' } });
  await db.session.create({ data: { id:'session', userId:'admin', deviceId:'device', tokenHash:'fixture-session', expiresAt:new Date('2030-01-01') } });
  const before = { users: await db.user.findMany({orderBy:{id:'asc'}}), companies: await db.company.findMany(), sessions: await db.session.findMany() };
  await run('prisma/schema.prisma');
  assert.deepEqual({ users: await db.user.findMany({orderBy:{id:'asc'}}), companies: await db.company.findMany(), sessions: await db.session.findMany() }, before);
  for (const model of ['userAccessAudit','operationAudit','offlineSigningKey']) assert.equal(await db[model].count(), 0);
  const applied = await db.$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  assert.deepEqual(applied.map(r => r.migration_name), migrations);
  await run('prisma/schema.prisma');
  const gate = await new Promise((resolve,reject) => {
    const child = spawn(process.execPath, ['dist/scripts/report-user-roles.js','--check'], {env:{...process.env,DATABASE_URL:connection},stdio:['ignore','pipe','inherit']});
    let output=''; child.stdout.on('data',data=>{output+=data});
    child.on('error',reject); child.on('exit',code=>resolve({code,report:JSON.parse(output)}));
  });
  assert.equal(gate.code,2);
  assert.equal(gate.report.activeUsersRequiringRoleReview,2);
  assert.equal(gate.report.readyForActivation,false);
  assert.equal(await db.user.count(), 3);
  console.log('PASS: CLI compilada bloquea activación con roles antiguos mediante código 2, sin reasignarlos.');
  console.log('PASS: actualización desde 0008, usuarios/PIN/sesiones preservados, roles antiguos sin reasignación, tablas nuevas y deploy repetido.');
} finally {
  await db.$disconnect();
  if (created) { await admin.$executeRawUnsafe(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE`); await admin.$executeRawUnsafe(`DROP DATABASE [${database}]`); console.log('Base temporal de actualización eliminada.'); }
  await admin.$disconnect(); await rm(folder, {recursive:true, force:true});
}
