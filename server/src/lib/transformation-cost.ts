import { Prisma } from '@prisma/client';
import { AppError } from './utils.js';
const D = Prisma.Decimal;
const units: Record<string, {dimension:string;factor:number}> = {
  kg:{dimension:'mass',factor:1000},g:{dimension:'mass',factor:1},
  L:{dimension:'volume',factor:1000},ml:{dimension:'volume',factor:1},
};
export interface TransformationOutput {insumoId:string;quantity:number;unit:string;relativeValue:number}
/** Pure preview. The commit must supply authoritative units and input cost from locked SQL rows. */
export function calculateTransformation(input:{quantity:number;unit:string;costPerUnit:number;outputs:TransformationOutput[]}) {
  const fail=(message:string):never=>{throw new AppError(message,400,'INVALID_TRANSFORMATION');};
  const decimal=(value:number,positive=false)=>{
    if(!Number.isFinite(value) || value<0 || (positive && value===0)) fail('Cantidad o valor no válido.');
    const n=new D(value);if(n.decimalPlaces()>4 || n.greaterThan('99999999.9999'))fail('Use hasta cuatro decimales y valores dentro del límite permitido.');return n;
  };
  const source=units[input.unit];if(!source)fail('Unidad base no compatible con un despiece.');
  const quantity=decimal(input.quantity,true), cost=decimal(input.costPerUnit);
  if(!input.outputs.length || input.outputs.length>100)fail('Indique entre uno y cien resultados.');
  const ids=new Set<string>();
  const rows=input.outputs.map(row=>{
    if(!row.insumoId || ids.has(row.insumoId))fail('Los resultados deben identificar insumos distintos.');ids.add(row.insumoId);
    const unit=units[row.unit];if(!unit || unit.dimension!==source.dimension)fail('Las unidades deben pertenecer a la misma dimensión.');
    const qty=decimal(row.quantity), value=decimal(row.relativeValue,true);
    return {row,qty,base:qty.mul(unit.factor),weight:qty.mul(unit.factor)};
  });
  const consumed=quantity.mul(source.factor);
  const useful=rows.reduce((sum,r)=>sum.add(r.base),new D(0));
  if(useful.lte(0))fail('Debe existir al menos un resultado aprovechable.');
  if(useful.gt(consumed))fail('Los resultados superan la cantidad consumida.');
  const total=quantity.mul(cost).toDecimalPlaces(2,D.ROUND_HALF_UP);
  if(total.gt('9999999999.99'))fail('El costo total supera el límite permitido.');
  const cents=total.mul(100), weight=rows.reduce((sum,r)=>sum.add(r.weight),new D(0));
  const portions=rows.map((r,index)=>{const exact=cents.mul(r.weight).div(weight);return {index,cents:exact.floor(),remainder:exact.minus(exact.floor())};});
  let left=cents.minus(portions.reduce((sum,r)=>sum.add(r.cents),new D(0))).toNumber();
  for(const part of [...portions].sort((a,b)=>b.remainder.comparedTo(a.remainder)||a.index-b.index)) {if(left--<=0)break;part.cents=part.cents.add(1);}
  return {totalCost:total.toNumber(),wasteQuantity:consumed.minus(useful).div(source.factor).toNumber(),yieldPct:useful.div(consumed).mul(100).toDecimalPlaces(4).toNumber(),outputs:rows.map((r,i)=>{
    const assigned=portions[i].cents.div(100);
    return {...r.row,totalCost:assigned.toNumber(),unitCost:r.qty.isZero()?0:assigned.div(r.qty).toDecimalPlaces(4,D.ROUND_HALF_UP).toNumber(),yieldPct:r.base.div(consumed).mul(100).toDecimalPlaces(4).toNumber()};
  })};
}
