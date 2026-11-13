import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTransformation as calculate} from '../src/lib/transformation-cost.js';
const outputs=[{insumoId:'parrilla',quantity:2,unit:'kg',relativeValue:30},{insumoId:'saltado',quantity:1.5,unit:'kg',relativeValue:20}];
test('despiece absorbe merma y distribuye costo según cantidad equivalente',()=>{
 const result=calculate({quantity:4,unit:'kg',costPerUnit:30,outputs});
 assert.equal(result.wasteQuantity,.5);assert.equal(result.yieldPct,87.5);
 assert.deepEqual(result.outputs.map(r=>r.totalCost),[68.57,51.43]);assert.equal(result.totalCost,120);
});
test('conversión de unidades y redondeo conservan costo total',()=>{
 const result=calculate({quantity:1,unit:'kg',costPerUnit:1,outputs:[1,2,3].map(id=>({insumoId:String(id),quantity:300,unit:'g',relativeValue:1}))});
 assert.equal(result.wasteQuantity,.1);assert.deepEqual(result.outputs.map(r=>r.totalCost),[.34,.33,.33]);
});
test('rechaza resultados incompatibles, excesivos, duplicados o sin aprovechamiento',()=>{
 for(const changed of [[{...outputs[0],unit:'L'}],[{...outputs[0],quantity:5}],[outputs[0],outputs[0]],[{...outputs[0],quantity:0}],[{...outputs[0],relativeValue:0}]]) assert.throws(()=>calculate({quantity:4,unit:'kg',costPerUnit:30,outputs:changed}));
});

test('el costo se asigna por unidades equivalentes entre kg y g',()=>{const r=calculate({quantity:2,unit:'kg',costPerUnit:10,outputs:[{insumoId:'a',quantity:1,unit:'kg',relativeValue:1},{insumoId:'b',quantity:1000,unit:'g',relativeValue:1}]});assert.deepEqual(r.outputs.map(x=>x.totalCost),[10,10]);});
