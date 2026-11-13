import React, { useEffect, useRef, useState } from 'react';

/** Normaliza solo la escritura: nunca redondea ni convierte identificadores. */
export function normalizeNumericText(value: string): string {
  return value.replace(/^([+-]?)0+(?=\d)/, '$1');
}
type Props = { value?: string | number; onChange?: (event: any) => void; [key: string]: any };
export function NumericInput({value='',onChange,onFocus,onBlur,...props}:Props) {
  const display = (v: string | number) => typeof v==='number' && !Number.isFinite(v) ? '' : String(v);
  const [text,setText]=useState(()=>display(value));
  const echo=useRef<{raw:string;number:number}|null>(null);
  useEffect(()=>{
    const pending=echo.current;
    // Los formularios existentes convierten '' a 0/NaN: conservar la edición
    // vacía, pero permitir actualizaciones externas (botones de importe, etc.).
    if(pending && (String(value)===pending.raw || (typeof value==='number' && (Object.is(value,pending.number) || (pending.raw==='' && !Number.isFinite(value)))))) return;
    echo.current=null;setText(display(value));
  },[value]);
  return <input {...props} type="number" value={text}
    onFocus={e=>{if(e.currentTarget.value!=='' && Number(e.currentTarget.value)===0)e.currentTarget.select();onFocus?.(e)}}
    onChange={e=>{const raw=e.currentTarget.value;echo.current={raw,number:Number(raw)};setText(raw);onChange?.(e)}}
    onBlur={e=>{const normalized=normalizeNumericText(e.currentTarget.value);if(normalized!==e.currentTarget.value)e.currentTarget.value=normalized;setText(normalized);onBlur?.(e)}} />;
}
