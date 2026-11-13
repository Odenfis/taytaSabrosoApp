import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import { saveTransformation, previewTransformation, executeTransformation, getExecution, deleteTransformation, listTransformations } from '../src/services/transformations.service.js';
assert.match(process.env.USER_TEST_DATABASE??'',/^tayta_users_test_[a-f0-9]{32}$/);
assert.ok(process.env.DATABASE_URL?.includes(';database='+process.env.USER_TEST_DATABASE));
const companyId='el-tayta', actor={userId:'tester',deviceId:'test-device'};
const stock=async(id:string)=>Number((await prisma.insumo.findUniqueOrThrow({where:{id}})).currentStock);
const ingredient=async(id:string,unit:string,qty:number,cost:number,company:string|null=companyId)=>prisma.insumo.create({data:{id,code:id,name:id,unit,currentStock:qty,costPerUnit:cost,minStock:0,category:'Carnes & Aves',companyId:company}});
try{
 for(const id of [companyId,'el-sabroso'])await prisma.company.create({data:{id,name:id,tradeName:id,ruc:id===companyId?'20000000001':'20000000002',specialty:'',themeColor:'',accentColor:'',badgeText:'',address:''}});
 await ingredient('Lomo base','kg',100,30);await ingredient('Parrilla','kg',1,20);await ingredient('Saltado','kg',0,0);await ingredient('Ajeno','kg',10,10,'el-sabroso');await ingredient('Volumen','L',10,10);await ingredient('Compartido','g',0,0,null);
 const ficha={id:randomUUID(),expectedVersion:0,name:'Despiece de lomo',sourceId:'Lomo base',active:true,definitionVersion:2 as const,outputs:[{insumoId:'Parrilla',percentage:50},{insumoId:'Saltado',percentage:40}]};
 await saveTransformation(companyId,ficha,actor);await saveTransformation(companyId,ficha,actor);
 await assert.rejects(saveTransformation(companyId,{...ficha,id:randomUUID(),outputs:[{insumoId:'Parrilla',percentage:60},{insumoId:'Saltado',percentage:41}]},actor));
 await assert.rejects(saveTransformation(companyId,{...ficha,id:randomUUID(),outputs:[{insumoId:'Parrilla',percentage:0}]},actor));
 const legacy={...ficha,id:randomUUID()};await saveTransformation(companyId,legacy,actor);
 await prisma.transformationTemplate.update({where:{id:legacy.id},data:{definition:JSON.stringify([{insumoId:'Parrilla',unit:'kg',relativeValue:1}])}});
 await assert.rejects(previewTransformation(companyId,{id:randomUUID(),templateId:legacy.id,quantity:1,outputs:[{insumoId:'Parrilla',quantity:1}]}));
 await saveTransformation(companyId,{...legacy,expectedVersion:1},actor);
 await deleteTransformation(companyId,legacy.id,2,actor);
 assert.equal((await listTransformations(companyId)).some(t=>t.id===legacy.id),false);
 await assert.rejects(previewTransformation(companyId,{id:randomUUID(),templateId:legacy.id,quantity:1,outputs:[{insumoId:'Parrilla',quantity:1}]}));
 assert.equal(await prisma.operationAudit.count({where:{entityId:legacy.id,action:'eliminar_ficha_transformacion'}}),1);
 assert.equal(await prisma.operationAudit.count({where:{entityId:ficha.id}}),1);
 const input={id:randomUUID(),templateId:ficha.id,quantity:4,outputs:[{insumoId:'Parrilla',quantity:2},{insumoId:'Saltado',quantity:1.5}]};
 const preview=await previewTransformation(companyId,input);assert.equal(preview.totalCost,120);assert.equal(preview.wasteQuantity,.5);assert.equal(preview.outputs[0].averageUnitCost,29.5233);
 const body={...input,previewHash:preview.previewHash};
 const results=await Promise.all([executeTransformation(companyId,body,actor),executeTransformation(companyId,body,actor)]);
 assert.equal(results[0].id,results[1].id);assert.equal(await stock('Lomo base'),96);assert.equal(await stock('Parrilla'),3);assert.equal(await stock('Saltado'),1.5);
 assert.equal(Number((await prisma.insumo.findUniqueOrThrow({where:{id:'Parrilla'}})).costPerUnit),29.5233);
 assert.equal(Number((await prisma.insumo.findUniqueOrThrow({where:{id:'Saltado'}})).costPerUnit),34.2867);
 assert.equal(await prisma.kardexMovement.count({where:{referenceDoc:'Transformación '+body.id}}),3);
 const audit=await prisma.operationAudit.findFirstOrThrow({where:{entityId:body.id}});assert.equal(audit.actorUserId,actor.userId);assert.equal(audit.deviceId,actor.deviceId);assert.equal(audit.companyId,companyId);
 await assert.rejects(executeTransformation(companyId,{...body,quantity:5},actor));
 await assert.rejects(executeTransformation('el-sabroso',body,actor));
 await assert.rejects(executeTransformation(companyId,body,{...actor,userId:'otro'}));
 await assert.rejects(getExecution('el-sabroso',body.id));
 await saveTransformation(companyId,{...ficha,expectedVersion:1,name:'Ficha modificada'},actor);
 assert.equal((await getExecution(companyId,body.id)).snapshot,results[0].snapshot);
 assert.equal((await executeTransformation(companyId,body,actor)).id,body.id);
 await assert.rejects(saveTransformation(companyId,{...ficha,expectedVersion:1},actor));
 for(const bad of [ {...ficha,id:randomUUID(),sourceId:'Ajeno'}, {...ficha,id:randomUUID(),outputs:[{insumoId:'Ajeno',percentage:100}]}, {...ficha,id:randomUUID(),outputs:[{insumoId:'Volumen',percentage:100}]}, {...ficha,id:randomUUID(),outputs:[{insumoId:'Lomo base',percentage:100}]} ])await assert.rejects(saveTransformation(companyId,bad,actor));
 for(const bad of [{...input,quantity:101},{...input,quantity:1},{...input,outputs:[{insumoId:'Parrilla',quantity:1},{insumoId:'Parrilla',quantity:1}]}])await assert.rejects(previewTransformation(companyId,bad));
 const next={...input,id:randomUUID()};const p=await previewTransformation(companyId,next);
 await prisma.$executeRawUnsafe("EXEC(N'CREATE TRIGGER fail_transformation_audit ON dbo.auditoria_operaciones AFTER INSERT AS BEGIN IF EXISTS (SELECT 1 FROM inserted WHERE accion IN (''ejecutar_transformacion'',''guardar_ficha_transformacion'')) THROW 51000, ''AUDIT TEST FAILURE'', 1; END')");
 await assert.rejects(executeTransformation(companyId,{...next,previewHash:p.previewHash},actor));
 await assert.rejects(saveTransformation(companyId,{...ficha,id:randomUUID(),name:'No debe persistir'},actor));
 assert.equal(await stock('Lomo base'),96);assert.equal(await prisma.transformationExecution.count({where:{id:next.id}}),0);assert.equal(await prisma.kardexMovement.count({where:{referenceDoc:'Transformación '+next.id}}),0);assert.equal(await prisma.transformationTemplate.count({where:{name:'No debe persistir'}}),0);
 await prisma.$executeRawUnsafe('DROP TRIGGER fail_transformation_audit');
 const concurrent=await Promise.allSettled([randomUUID(),randomUUID()].map(id=>executeTransformation(companyId,{...next,id,previewHash:p.previewHash},actor)));
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(await stock('Lomo base'),92);
 const shared={...ficha,id:randomUUID(),outputs:[{insumoId:'Compartido',percentage:100}]};await saveTransformation(companyId,shared,actor);
 const sharedInput={id:randomUUID(),templateId:shared.id,quantity:1,outputs:[{insumoId:'Compartido',quantity:900}]};const ps=await previewTransformation(companyId,sharedInput);await executeTransformation(companyId,{...sharedInput,previewHash:ps.previewHash},actor);assert.equal(await stock('Compartido'),900);await deleteTransformation(companyId,shared.id,1,actor);assert.equal((await getExecution(companyId,sharedInput.id)).id,sharedInput.id);assert.equal((await executeTransformation(companyId,{...sharedInput,previewHash:ps.previewHash},actor)).id,sharedInput.id);
 // Una receta consume el corte obtenido, nunca vuelve a descontar el insumo base.
 const sourceBefore=await stock('Lomo base'),cutBefore=await stock('Parrilla');
 const product=await prisma.product.create({data:{id:randomUUID(),companyId,name:'Plato con corte',category:'platos',price:40,description:'',image:''}});
 await prisma.recipe.create({data:{id:randomUUID(),companyId,productId:product.id,productName:product.name,category:'platos',salePrice:40,totalCost:8,theoreticalFoodCostPct:20,ingredients:{create:{id:randomUUID(),insumoId:'Parrilla',insumoName:'Parrilla',quantity:.2,unit:'kg',costPerUnit:40,subtotalCost:8}}}});
 const order=await prisma.order.create({data:{id:randomUUID(),companyId,ticketNumber:'TRANS-RECIPE',zone:'Barra',waiter:'Test',createdAt:'00:00',subtotal:40,igv:0,total:40,status:'abierto',clientOpId:randomUUID(),items:{create:{id:randomUUID(),productId:product.id,name:product.name,price:40,quantity:1,status:'agregado',addedAt:'00:00'}}}});
 const {sendToKitchen}=await import('../src/services/order.service.js');await sendToKitchen(order.id,undefined,actor);assert.equal(await stock('Parrilla'),cutBefore-.2);assert.equal(await stock('Lomo base'),sourceBefore);
 await ingredient('Liquido final','ml',100,0.02);
 const liquid={...ficha,id:randomUUID(),sourceId:'Volumen',outputs:[{insumoId:'Liquido final',percentage:100}]};await saveTransformation(companyId,liquid,actor);
 const liquidInput={id:randomUUID(),templateId:liquid.id,quantity:1,outputs:[{insumoId:'Liquido final',quantity:900}]};const lp=await previewTransformation(companyId,liquidInput);assert.equal(lp.wasteQuantity,.1);await executeTransformation(companyId,{...liquidInput,previewHash:lp.previewHash},actor);assert.equal(await stock('Volumen'),9);assert.equal(await stock('Liquido final'),1000);
 const zp=await previewTransformation(companyId,{...input,outputs:[{insumoId:'Parrilla',quantity:0},{insumoId:'Saltado',quantity:3.5}]});assert.equal(zp.outputs[0].totalCost,0);assert.equal(zp.outputs[1].totalCost,120);
 await prisma.insumo.update({where:{id:'Saltado'},data:{isDeleted:true}});await assert.rejects(previewTransformation(companyId,input));await prisma.insumo.update({where:{id:'Saltado'},data:{isDeleted:false}});
 console.log('PASS SQL: despiece, promedio, merma, compartidos, receta, versiones, idempotencia, concurrencia, auditoría y rollback.');
 process.env.JWT_SECRET='isolated-transformations-test-secret';
 const {createApp}=await import('../src/app.js');const {createServer}=await import('node:http');const {signAccessToken,hashToken}=await import('../src/lib/auth.js');
 await prisma.device.create({data:{id:actor.deviceId,name:'Test',terminalCode:'TRANSFORM-TEST'}});
 const bcrypt=await import('bcryptjs');await prisma.user.create({data:{id:actor.userId,name:'Tester',role:'Administrador',companyId,assignedCompanyId:companyId,pinHash:bcrypt.default.hashSync('991188',4),terminal:'Test'}});
 const token=signAccessToken({sub:actor.userId,deviceId:actor.deviceId,role:'Administrador',name:'Tester'});await prisma.session.create({data:{id:randomUUID(),userId:actor.userId,deviceId:actor.deviceId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+600000)}});
 const web=express();web.use(express.static(path.resolve('../dist')));web.use(createApp());const server=createServer(web);const {initRealtime}=await import('../src/lib/realtime.js');const realtime=initRealtime(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await fetch(url+'/api/transformations/templates?companyId=el-sabroso',{headers})).status,403);
  const routes=[['GET','templates'],['POST','templates'],['POST','preview'],['POST','executions'],['GET','executions'],['GET','executions/'+body.id]];
  for(const role of ['Cajero','Mesero']){await prisma.user.update({where:{id:actor.userId},data:{role}});for(const [method,route] of routes)assert.equal((await fetch(url+'/api/transformations/'+route+'?companyId='+companyId,{method,headers})).status,403);}
  await prisma.user.update({where:{id:actor.userId},data:{role:'Jefe de restaurante'}});assert.equal((await fetch(url+'/api/transformations/templates?companyId='+companyId,{headers})).status,200);
  const fresh={...input,id:randomUUID()};const pre=await (await fetch(url+'/api/transformations/preview?companyId='+companyId,{method:'POST',headers,body:JSON.stringify(fresh)})).json();assert.ok(pre.previewHash);
  const response=await fetch(url+'/api/transformations/executions?companyId='+companyId,{method:'POST',headers,body:JSON.stringify({...fresh,previewHash:pre.previewHash})});assert.equal(response.status,200);
  assert.equal((await fetch(url+'/api/transformations/executions?companyId='+companyId,{method:'POST',headers:{...headers,'x-offline-replay':'1'},body:JSON.stringify({...fresh,previewHash:pre.previewHash})})).status,409);
  console.log('PASS HTTP: admin/jefe, restricciones de cajero/mozo y empresa, vista previa y ejecución.');
  if(process.env.TRANSFORMATION_BROWSER_TEST==='true'){
    await prisma.user.update({where:{id:actor.userId},data:{role:'Administrador'}});
    const {chromium}=await import('playwright');const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/transformations/templates?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_FAILURE',message:'Consulta de prueba fallida'}})}));
      await page.route('**/socket.io/**',route=>route.abort());
      await page.goto(url);await page.getByPlaceholder('Ingresa tu PIN').fill('991188');await page.locator('#btn-login-submit').click();await page.locator('#btn-logout').waitFor();
      await page.getByRole('button',{name:/Kardex/}).first().click();await page.getByRole('button',{name:/Transformaciones/}).click();
      const panel=page.getByRole('region',{name:'Transformaciones de insumos'});
      await panel.getByRole('alert').waitFor();assert.equal(await panel.getByText('Cargando fichas e insumos…').count(),0);assert.equal(await panel.getByText('Primero crea una ficha en la sección Fichas.').count(),0);await page.unroute('**/api/transformations/templates?*');await panel.getByRole('button',{name:'Actualizar',exact:true}).click();
      await panel.getByRole('button',{name:'Fichas',exact:true}).click();await panel.getByLabel('Nombre',{exact:true}).fill('Ficha navegador');await panel.getByLabel('Insumo base').selectOption('Lomo base');await panel.getByRole('button',{name:'Añadir resultado'}).click();await panel.getByLabel('Resultado 1',{exact:true}).selectOption('Saltado');await panel.getByRole('button',{name:'Guardar ficha'}).click();await panel.getByText('Ficha guardada.',{exact:false}).waitFor();
      await panel.getByRole('button',{name:'Ejecutar',exact:true}).click();await panel.getByLabel('Ficha',{exact:true}).selectOption({label:'Ficha navegador'});await panel.getByLabel('Cantidad consumida (kg)').fill('1');await page.waitForTimeout(200);assert.equal(await panel.getByLabel('Saltado · obtenido (kg)').inputValue(),'1');await panel.getByLabel('Saltado · obtenido (kg)').fill('0.8');await panel.getByRole('button',{name:'Calcular rendimiento y costo'}).click();await panel.getByRole('button',{name:'Confirmar transformación'}).waitFor();
      await page.screenshot({path:'/tmp/tayta-transformations-desktop.png',fullPage:true});
      // El servidor confirma, pero la respuesta se pierde. Recargar conserva la identidad.
      let committed='';await page.route('**/api/transformations/executions?*',async route=>{if(route.request().method()==='POST'){const response=await route.fetch();assert.equal(response.status(),200);committed=(await response.json()).id;await route.abort();}else await route.continue()});
      await panel.getByRole('button',{name:'Confirmar transformación'}).click();await panel.getByRole('heading',{name:'Confirmación pendiente'}).waitFor();
      for(let i=0;i<50&&!committed;i++)await page.waitForTimeout(100);assert.ok(committed);
      await page.unroute('**/api/transformations/executions?*');await page.reload();await page.locator('#btn-logout').waitFor();await page.getByRole('button',{name:/Kardex/}).first().click();await page.getByRole('button',{name:/Transformaciones/}).click();await panel.getByRole('button',{name:'Consultar resultado'}).click();await panel.getByText('Transformación confirmada.',{exact:false}).waitFor();
      assert.equal(await prisma.transformationExecution.count({where:{id:committed}}),1);assert.equal(await prisma.operationAudit.count({where:{entityId:committed}}),1);
      const observer=await browser.newPage();
      await observer.goto(url);await observer.getByPlaceholder('Ingresa tu PIN').fill('991188');await observer.locator('#btn-login-submit').click();await observer.locator('#btn-logout').waitFor();
      await observer.getByRole('button',{name:/Kardex/}).first().click();
      // Confirmación sin realtime: el catálogo compartido debe actualizarse por REST.
      await panel.getByLabel('Ficha',{exact:true}).selectOption({label:'Ficha navegador'});
      await panel.getByLabel('Cantidad consumida (kg)').fill('1');
      await page.waitForTimeout(200);await panel.getByLabel('Saltado · obtenido (kg)').fill('0.5');
      await panel.getByRole('button',{name:'Calcular rendimiento y costo'}).click();
      const countBefore=await prisma.transformationExecution.count();
      await page.route('**/api/catalogs/insumos**',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_FAILURE',message:'Consulta de insumos fallida'}})}));
      await panel.getByRole('button',{name:'Confirmar transformación'}).click();
      await panel.getByRole('button',{name:'Reintentar actualización'}).waitFor();
      assert.equal(await panel.getByRole('heading',{name:'Confirmación pendiente'}).count(),0);
      assert.equal(await prisma.transformationExecution.count(),countBefore+1);
      await page.unroute('**/api/catalogs/insumos**');
      await panel.getByRole('button',{name:'Reintentar actualización'}).click();
      await panel.getByRole('button',{name:'Reintentar actualización'}).waitFor({state:'detached'});
      assert.equal(await prisma.transformationExecution.count(),countBefore+1);
      const saltado=await prisma.insumo.findUniqueOrThrow({where:{id:'Saltado'}});
      await observer.waitForFunction(expected=>Array.from(document.querySelectorAll('tr')).some(row=>row.textContent?.includes('Saltado')&&row.textContent?.includes(expected)), 'S/ '+Number(saltado.costPerUnit).toFixed(2));
      await page.getByRole('button',{name:/Existencias Físicas/}).click();
      const stockRow=page.getByRole('row').filter({hasText:'Saltado'});
      assert.ok((await stockRow.innerText()).includes('S/ '+Number(saltado.costPerUnit).toFixed(2)));
      assert.ok((await stockRow.innerText()).includes('S/ '+(Number(saltado.costPerUnit)*Number(saltado.currentStock)).toFixed(2)));
      await page.getByRole('button',{name:/Fichas.*Recetas/}).first().click();
      await page.getByRole('button',{name:/Nueva Ficha Técnica/}).click();
      assert.equal(await page.locator('option[value="Saltado"]').innerText(),`Saltado (S/ ${Number(saltado.costPerUnit).toFixed(2)}/kg)`);
      // Una terminal desconectada recupera el catálogo completo al reconectar.
      await observer.context().setOffline(true);
      const replay={...input,id:randomUUID()};const replayPreview=await previewTransformation(companyId,replay);await executeTransformation(companyId,{...replay,previewHash:replayPreview.previewHash},actor);
      const reconnectedCost=Number((await prisma.insumo.findUniqueOrThrow({where:{id:'Saltado'}})).costPerUnit).toFixed(2);
      await observer.context().setOffline(false);
      await observer.waitForFunction(expected=>Array.from(document.querySelectorAll('tr')).some(row=>row.textContent?.includes('Saltado')&&row.textContent?.includes(expected)), 'S/ '+reconnectedCost);
      await observer.close();
      await page.getByRole('button',{name:'Cancelar',exact:true}).click();
      await page.getByRole('button',{name:/Kardex/}).first().click();
      await page.getByRole('button',{name:/Transformaciones/}).click();
      await panel.getByRole('button',{name:'Historial',exact:true}).click();await panel.getByRole('button',{name:/Ficha navegador/}).first().click();
      for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);await panel.getByRole('heading',{name:/Detalle confirmado/}).scrollIntoViewIfNeeded();await page.waitForTimeout(200);await page.screenshot({path:`/tmp/tayta-transformations-mobile-${theme}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);}
      assert.deepEqual(errors,[]);console.log('PASS Chrome: costos SQL/Existencias/Recetas sin realtime, fallo de consulta y reintento sin duplicar, segunda terminal, reconexión, respuesta perdida, historial, móvil y temas.');
    }catch(e){for(const p of browser.contexts().flatMap(c=>c.pages())){console.log(await p.locator('body').innerText());await p.screenshot({path:'/tmp/tayta-transformations-failure.png',fullPage:true});}throw e}finally{await browser.close()}
  }
 }finally{await new Promise<void>(resolve=>realtime.close(()=>resolve()));if(server.listening)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
}finally{await prisma.$disconnect()}
