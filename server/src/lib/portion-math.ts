/** Shared decimal arithmetic: four-decimal inputs and displayed physical totals. */
export const physicalUnits = { kg: 1000, g: 1, L: 1000, ml: 1 } as const;
export type PhysicalUnit = keyof typeof physicalUnits;
export const compatibleUnits = (a: string, b: string) => ['kg','g'].includes(a) ? ['kg','g'].includes(b) : ['L','ml'].includes(a) && ['L','ml'].includes(b);
export function scaled(value: string | number): bigint {
  const text = String(value);
  if (!/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(text)) throw new Error('Use valores positivos con hasta cuatro decimales.');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole||'0') * 10000n + BigInt(fraction.padEnd(4,'0'));
  if (result > 999999999999n) throw new Error('El valor excede el límite permitido.');
  return result;
}
const halfUp = (a: bigint, b: bigint) => (a + b / 2n) / b;
export const unscaled = (v: bigint) => Number(v) / 10000;
export function proposePortions(consumed: string | number, reference: string | number, portions: string | number) {
  const divisor = scaled(reference);
  if (!divisor) throw new Error('Indica el consumo de referencia.');
  const result=scaled(consumed) * scaled(portions) / divisor;
  if(result>999999999999n)throw new Error('La propuesta de porciones excede el límite permitido.');
  return unscaled(result);
}
export function equivalentTotal(portions: string | number, equivalent: string | number, unit: string, sourceUnit: string) {
  if (!compatibleUnits(sourceUnit, unit)) throw new Error('Las unidades deben ser compatibles con el insumo base.');
  return unscaled(halfUp(scaled(portions) * scaled(equivalent) * BigInt(physicalUnits[unit as PhysicalUnit]), 10000n * BigInt(physicalUnits[sourceUnit as PhysicalUnit])));
}
export function portionBalance(consumed: string | number, sourceUnit: string, outputs: {quantity:string|number;equivalentQuantity:string|number;equivalentUnit:string}[], waste?: {quantity:string|number;unit:string}) {
  const totals = outputs.map(o=>equivalentTotal(o.quantity,o.equivalentQuantity,o.equivalentUnit,sourceUnit));
  const useful = totals.reduce((sum,n)=>sum+scaled(n),0n);
  const calculated = scaled(consumed)-useful;
  const declared = waste ? scaled(equivalentTotal(1,waste.quantity,waste.unit,sourceUnit)) : calculated;
  return {totals,usefulQuantity:unscaled(useful),calculatedWaste:unscaled(calculated),wasteQuantity:unscaled(declared),difference:unscaled(scaled(consumed)-useful-declared)};
}
