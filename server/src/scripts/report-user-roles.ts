/** Solo lectura. No muestra PIN, hashes, sesiones ni tokens. */
import { writeFile } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { reviewRoleReadiness } from '../lib/role-readiness.js';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, companyId: true, assignedCompanyId: true, isActive: true, isDeleted: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  const companies = await prisma.company.findMany({ select: { id: true } });
  const report = { generatedAt: new Date().toISOString(), ...reviewRoleReadiness(users, companies.map(c => c.id)) };
  const json = JSON.stringify(report, null, 2);
  const path = process.argv.find(arg => arg.startsWith('--report='))?.slice('--report='.length);
  if (path) await writeFile(path, json + '\n', { mode: 0o600, flag: 'wx' });
  console.log(json);
  if (process.argv.includes('--check') && !report.readyForActivation) process.exitCode = 2;
}
main().catch(error => { console.error('No se pudo generar el informe:', error instanceof Error ? error.message : 'Error desconocido'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
