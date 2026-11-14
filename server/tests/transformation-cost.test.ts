import { portionBalance, proposePortions } from '../src/lib/portion-math.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTransformation as calculate} from '../src/lib/transformation-cost.js';
const outputs=[{insumoId:'parrilla',quantity:2,unit:'Porción',equivalentQuantity:1,equivalentUnit:'kg'},{insumoId:'saltado',quantity:1.5,unit:'Porción',equivalentQuantity:1,equivalentUnit:'kg'}];
test('despiece absorbe merma y distribuye costo según cantidad equivalente',()=>{
 const result=calculate({quantity:4,unit:'kg',costPerUnit:30,outputs});
 assert.equal(result.wasteQuantity,.5);assert.equal(result.yieldPct,87.5);
 assert.deepEqual(result.outputs.map(r=>r.totalCost),[68.57,51.43]);assert.equal(result.totalCost,120);
});
test('conversión de unidades y redondeo conservan costo total',()=>{
 const result=calculate({quantity:1,unit:'kg',costPerUnit:1,outputs:[1,2,3].map(id=>({insumoId:String(id),quantity:300,unit:'Porción',equivalentQuantity:1,equivalentUnit:'g'}))});
 assert.equal(result.wasteQuantity,.1);assert.deepEqual(result.outputs.map(r=>r.totalCost),[.34,.33,.33]);
});
test('rechaza resultados incompatibles, excesivos, duplicados o sin aprovechamiento',()=>{
 for(const changed of [[{...outputs[0],unit:'L'}],[{...outputs[0],quantity:5}],[outputs[0],outputs[0]],[{...outputs[0],quantity:0}],[{...outputs[0],equivalentQuantity:0}]]) assert.throws(()=>calculate({quantity:4,unit:'kg',costPerUnit:30,outputs:changed}));
});

test('el costo se asigna por unidades equivalentes entre kg y g',()=>{const r=calculate({quantity:2,unit:'kg',costPerUnit:10,outputs:[{insumoId:'a',quantity:1,unit:'Porción',equivalentQuantity:1,equivalentUnit:'kg'},{insumoId:'b',quantity:1000,unit:'Porción',equivalentQuantity:1,equivalentUnit:'g'}]});assert.deepEqual(r.outputs.map(x=>x.totalCost),[10,10]);});

test('40 porciones de 200 g: merma editable exige balance exacto',()=>{
 const input={quantity:10,unit:'kg',costPerUnit:20,outputs:[{insumoId:'corte',unit:'Porción',quantity:40,equivalentQuantity:200,equivalentUnit:'g'}]};
 const p=calculate(input);assert.equal(p.wasteQuantity,2);assert.equal(p.outputs[0].unitCost,5);assert.equal(p.outputs[0].equivalentTotal,8);
 assert.throws(()=>calculate({...input,waste:{quantity:1,unit:'kg'}}));
 assert.equal(calculate({...input,waste:{quantity:2000,unit:'g'}}).wasteEdited,true);
 assert.throws(()=>calculate({...input,outputs:[{...input.outputs[0],equivalentUnit:'ml'}]}));
});

test('propuestas fraccionarias y precisión visible conservan balance',()=>{
 assert.equal(proposePortions(1,3,10),3.3333);
 const b=portionBalance(1,'kg',[{quantity:'0.5',equivalentQuantity:333.3333,equivalentUnit:'g'}]);
 assert.equal(b.usefulQuantity,.1667);assert.equal(b.calculatedWaste,.8333);assert.equal(b.difference,0);
 assert.equal(portionBalance('.5','kg',[{quantity:1,equivalentQuantity:500,equivalentUnit:'g'}]).wasteQuantity,0);
 assert.throws(()=>proposePortions(99999999,.0001,99999999));
});
