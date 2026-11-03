import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewRoleReadiness } from '../src/lib/role-readiness.js';
const admin = { role:'Administrador', companyId:null, assignedCompanyId:null, isActive:true, isDeleted:false };
test('activación exige administrador global activo, no solo administrador limitado', () => {
  for (const user of [{...admin,companyId:'a'}, {...admin,isActive:false}, {...admin,isDeleted:true}]) assert.equal(reviewRoleReadiness([user], ['a']).readyForActivation, false);
  assert.equal(reviewRoleReadiness([admin], ['a']).readyForActivation, true);
});
test('roles antiguos y empresas inconsistentes bloquean sin cambiar los usuarios', () => {
  const users = [admin, {...admin,role:'Coordinador'}, {...admin,role:'Mesero',companyId:'a',assignedCompanyId:'b'}, {...admin,role:'Cajero',assignedCompanyId:'missing'}];
  const before = structuredClone(users);
  const report = reviewRoleReadiness(users, ['a','b']);
  assert.equal(report.readyForActivation,false);
  assert.equal(report.activeUsersRequiringRoleReview,1);
  assert.equal(report.activeUsersWithCompanyConflict,1);
  assert.equal(report.activeUsersWithMissingCompany,1);
  assert.deepEqual(users,before);
});
test('historial inactivo se informa sin bloquear perfiles actuales válidos', () => {
  const report = reviewRoleReadiness([admin, {...admin,role:'Jefe de Cocina',isActive:false}, {...admin,role:'Jefe de restaurante',companyId:'a'}], ['a']);
  assert.equal(report.readyForActivation,true);
  assert.equal(report.users[1].needsRoleReview,true);
});
