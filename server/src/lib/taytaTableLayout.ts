export const TAYTA_TABLE_LAYOUT = [
  ...Array.from({ length: 35 }, (_, index) => {
    const n = index + 1;
    return { number: String(n).padStart(2, '0'), capacity: 4,
      zone: n <= 5 ? 'Primer Piso' : n <= 12 ? 'Mezanine' : n <= 26 ? 'Jardín' : 'Terraza' };
  }),
  ...Array.from({ length: 8 }, (_, index) => ({ number: `B${String(index + 1).padStart(2, '0')}`, capacity: 1, zone: 'Barra' })),
];

export const isServiceZone = (zone: string) => zone === 'Delivery' || zone === 'Llevar';

export const TAYTA_PHYSICAL_PREFIXES = {
  'Primer Piso': 'P', Mezanine: 'M', 'Jardín': 'J', Terraza: 'T',
} as const;
export type TaytaPhysicalZone = keyof typeof TAYTA_PHYSICAL_PREFIXES;
