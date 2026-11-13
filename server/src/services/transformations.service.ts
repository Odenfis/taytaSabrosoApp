import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/utils.js';
import { calculateTransformation } from '../lib/transformation-cost.js';
import { inventoryTransaction, requireActiveInsumos, notifyInventoryAfterCommit } from '../lib/inventory.js';
import { auditOperation, type OperationActor } from '../lib/operation-audit.js';
import { emitKardexChanged } from '../lib/realtime.js';

const id = z.string().min(1).max(36);
const amount = z.number().finite().min(0).max(99999999.9999).refine(n => new Prisma.Decimal(n).decimalPlaces() <= 4, 'Máximo cuatro decimales.');
export const templateSchema = z.object({
  id: z.uuid(), expectedVersion: z.number().int().nonnegative(), name: z.string().trim().min(1).max(150),
  sourceId: id, active: z.boolean(),
  outputs: z.array(z.object({ insumoId: id, percentage: amount.max(100) }).strict()).min(1).max(100),
  definitionVersion: z.literal(2),
}).strict();
export const executionSchema = z.object({
  id: z.uuid(), templateId: z.uuid(), quantity: amount.refine(n => n > 0),
  outputs: z.array(z.object({ insumoId: id, quantity: amount }).strict()).min(1).max(100),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
type Template = z.infer<typeof templateSchema>;
type Execution = z.infer<typeof executionSchema>;
const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const conflict = (message: string): never => { throw new AppError(message, 409, 'TRANSFORMATION_CONFLICT'); };
const dimension = (unit: string) => ({ kg:'mass', g:'mass', L:'volume', ml:'volume' }[unit]);
async function lock(tx: Prisma.TransactionClient, resource: string) {
  // También serializa claves todavía inexistentes, sin bloqueos de rango globales.
  const result = await tx.$queryRaw<{result:number}[]>`DECLARE @result INT; EXEC @result = sp_getapplock @Resource=${resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; SELECT @result AS result;`;
  if (!result.length || result[0].result < 0) conflict('La operación está ocupada. Reintente.');
}
function checkRows(sourceId: string, outputs: {insumoId:string}[], rows: {id:string;unit:string}[]) {
  const source = rows.find(r => r.id === sourceId)!;
  if (outputs.some(o => o.insumoId === sourceId) || new Set(outputs.map(o => o.insumoId)).size !== outputs.length)
    conflict('El insumo base y los resultados deben ser distintos y no repetirse.');
  if (!dimension(source.unit) || rows.some(r => dimension(r.unit) !== dimension(source.unit)))
    conflict('Todos los insumos deben usar unidades compatibles de peso o volumen.');
}
function range(value: Prisma.Decimal) {
  if (value.lt(0) || value.gt('99999999.9999')) conflict('Las existencias o el costo exceden el rango permitido.');
  return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
export async function saveTransformation(companyId: string, raw: Template, actor: OperationActor) {
  const input = templateSchema.parse(raw);
  const totalPercentage = input.outputs.reduce((sum, o) => sum.add(o.percentage), new Prisma.Decimal(0));
  if (totalPercentage.lte(0) || totalPercentage.gt(100)) conflict('Los porcentajes deben sumar más de 0 y no superar 100 %.');
  return inventoryTransaction(async tx => {
    await lock(tx, 'transformation:template:' + input.id);
    const old = await tx.transformationTemplate.findUnique({where:{id:input.id}});
    if (old && (old.companyId !== companyId || old.isDeleted)) throw new AppError('Ficha no encontrada.',404,'NOT_FOUND');
    const rows = await requireActiveInsumos(tx, [input.sourceId,...input.outputs.map(o=>o.insumoId)], companyId);
    if (!await tx.company.findUnique({where:{id:companyId}})) throw new AppError('Empresa no encontrada.',404,'NOT_FOUND');
    checkRows(input.sourceId,input.outputs,rows);
    const definition = JSON.stringify({version:2,outputs:input.outputs.map(o=>({...o,unit:rows.find(r=>r.id===o.insumoId)!.unit}))});
    // Creación repetida tras perder respuesta: no genera otra ficha ni otra auditoría.
    if (old && input.expectedVersion===0 && old.version===1 && old.name===input.name && old.sourceId===input.sourceId && old.definition===definition && old.active===input.active) return old;
    if ((old?.version ?? 0) !== input.expectedVersion) conflict('La ficha cambió en otra terminal. Recargue antes de editar.');
    const data = {companyId,name:input.name,sourceId:input.sourceId,definition,active:input.active};
    const row = old ? await tx.transformationTemplate.update({where:{id:input.id},data:{...data,version:{increment:1}}})
      : await tx.transformationTemplate.create({data:{id:input.id,...data}});
    await auditOperation(tx,actor,companyId,'guardar_ficha_transformacion',row.id);
    return row;
  });
}
async function calculate(tx: Prisma.TransactionClient, companyId: string, input: Execution) {
  await lock(tx,'transformation:template:'+input.templateId);
  const template = await tx.transformationTemplate.findFirst({where:{id:input.templateId,companyId}});
  if (!template || !template.active || template.isDeleted) conflict('La ficha no existe o está inactiva.');
  const definition = JSON.parse(template!.definition);
  if (Array.isArray(definition) || definition.version !== 2 || !Array.isArray(definition.outputs)) conflict('Esta ficha necesita convertirse a porcentajes antes de ejecutarse.');
  const outputs = definition.outputs as {insumoId:string;percentage:number;unit:string}[];
  if (new Set(input.outputs.map(o=>o.insumoId)).size!==outputs.length || input.outputs.length!==outputs.length || outputs.some(o=>!input.outputs.some(i=>i.insumoId===o.insumoId))) conflict('Los resultados no corresponden a la ficha vigente.');
  const rows = await requireActiveInsumos(tx,[template!.sourceId,...outputs.map(o=>o.insumoId)],companyId);
  checkRows(template!.sourceId,outputs,rows);
  const source = rows.find(r=>r.id===template!.sourceId)!;
  if (source.currentStock.lt(input.quantity)) conflict('Stock insuficiente del insumo base.');
  if (outputs.some(o=>o.unit!==rows.find(r=>r.id===o.insumoId)!.unit)) conflict('Cambió la unidad de un resultado. Revise y guarde la ficha.');
  const calculation = calculateTransformation({quantity:input.quantity,unit:source.unit,costPerUnit:Number(source.costPerUnit),outputs:outputs.map(o=>({...o,relativeValue:1,quantity:input.outputs.find(i=>i.insumoId===o.insumoId)!.quantity}))});
  const result = {
    templateId:template!.id,templateName:template!.name,templateVersion:template!.version,
    source:{id:source.id,name:source.name,unit:source.unit,quantity:input.quantity,unitCost:Number(source.costPerUnit),stockBefore:Number(source.currentStock),stockAfter:range(source.currentStock.minus(input.quantity))},
    totalCost:calculation.totalCost,wasteQuantity:calculation.wasteQuantity,yieldPct:calculation.yieldPct,
    outputs:calculation.outputs.map(o=>{
      const row=rows.find(r=>r.id===o.insumoId)!;
      if (row.currentStock.lt(0)) conflict('Regularice las existencias negativas antes de transformar.');
      const stockAfter=range(row.currentStock.add(o.quantity));
      const average=o.quantity===0?Number(row.costPerUnit):range(row.currentStock.mul(row.costPerUnit).add(o.totalCost).div(stockAfter));
      range(new Prisma.Decimal(o.unitCost));
      return {...o,name:row.name,stockBefore:Number(row.currentStock),stockAfter,previousUnitCost:Number(row.costPerUnit),averageUnitCost:average};
    }),
  };
  return {...result,previewHash:hash({companyId,result,versions:rows.map(r=>[r.id,r.version]).sort()})};
}
export async function previewTransformation(companyId: string, input: Execution) {
  return inventoryTransaction(tx=>calculate(tx,companyId,executionSchema.parse(input)));
}
export async function executeTransformation(companyId: string, raw: Execution, actor: OperationActor) {
  const input=executionSchema.parse(raw);
  if(!input.previewHash) conflict('Revise el cálculo antes de confirmar.');
  const requestHash=hash({...input,companyId,outputs:[...input.outputs].sort((a,b)=>a.insumoId.localeCompare(b.insumoId))});
  return inventoryTransaction(async tx=>{
    await lock(tx,'transformation:execution:'+input.id);
    const old=await tx.transformationExecution.findUnique({where:{id:input.id}});
    if(old){
      if(old.companyId!==companyId || old.requestHash!==requestHash || old.actorUserId!==actor.userId) conflict('El identificador corresponde a otra ejecución o autor.');
      return old;
    }
    const preview=await calculate(tx,companyId,input);
    if(preview.previewHash!==input.previewHash) conflict('Cambió la ficha, el stock o su costo. Revise nuevamente el cálculo.');
    const now=new Date();
    const snapshot={...preview,id:input.id,companyId,actorUserId:actor.userId,deviceId:actor.deviceId,createdAt:now.toISOString()};
    const execution=await tx.transformationExecution.create({data:{id:input.id,companyId,templateId:input.templateId,requestHash,snapshot:JSON.stringify(snapshot),actorUserId:actor.userId,deviceId:actor.deviceId}});
    const changes=[{insumoId:preview.source.id,name:preview.source.name,quantity:-input.quantity,unit:preview.source.unit,unitCost:preview.source.unitCost,totalCost:preview.totalCost,stockBefore:preview.source.stockBefore,stockAfter:preview.source.stockAfter,averageUnitCost:preview.source.unitCost,type:'TRANSFORMACION_SALIDA'},...preview.outputs.filter(o=>o.quantity>0).map(o=>({...o,type:'TRANSFORMACION_ENTRADA'}))];
    for(const c of changes){
      const movement=await tx.kardexMovement.create({data:{id:randomUUID(),transformationExecutionId:input.id,clientOpId:randomUUID(),companyId,insumoId:c.insumoId,insumoName:c.name,timestamp:now,date:now.toLocaleDateString('es-PE',{timeZone:'America/Lima'}),time:now.toLocaleTimeString('es-PE',{timeZone:'America/Lima'}),type:c.type,referenceDoc:`Transformación ${input.id}`,quantity:c.quantity,unit:c.unit,unitCost:c.unitCost,totalCost:c.totalCost,stockBefore:c.stockBefore,stockAfter:c.stockAfter,notes:preview.templateName}});
      await tx.insumo.update({where:{id:c.insumoId},data:{currentStock:c.stockAfter,costPerUnit:c.averageUnitCost,version:{increment:1}}});
      notifyInventoryAfterCommit(tx,()=>emitKardexChanged(companyId,{...c,insumoName:c.name,companyId,referenceDoc:movement.referenceDoc,updatedAt:now.toISOString()}));
    }
    await auditOperation(tx,actor,companyId,'ejecutar_transformacion',execution.id);
    return execution;
  });
}
export const listTransformations = (companyId:string) => prisma.transformationTemplate.findMany({where:{companyId,isDeleted:false},orderBy:{name:'asc'}});
export const listExecutions = (companyId:string,skip=0) => prisma.transformationExecution.findMany({where:{companyId},orderBy:[{createdAt:'desc'},{id:'asc'}],skip,take:50});
export async function getExecution(companyId:string,id:string){
  const row=await prisma.transformationExecution.findFirst({where:{id,companyId}});
  if(!row)throw new AppError('Ejecución no encontrada.',404,'NOT_FOUND');
  return row;
}

export async function deleteTransformation(companyId:string, templateId:string, expectedVersion:number, actor:OperationActor) {
  return inventoryTransaction(async tx => {
    await lock(tx, 'transformation:template:' + templateId);
    const row = await tx.transformationTemplate.findFirst({where:{id:templateId,companyId}});
    if (!row || row.isDeleted) throw new AppError('Ficha no encontrada.',404,'NOT_FOUND');
    if (row.version !== expectedVersion) conflict('La ficha cambió en otra terminal. Recargue antes de eliminar.');
    await tx.transformationTemplate.update({where:{id:templateId},data:{isDeleted:true,active:false,version:{increment:1}}});
    await auditOperation(tx,actor,companyId,'eliminar_ficha_transformacion',templateId);
  });
}
