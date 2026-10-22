import React, { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemePreference } from '../context/ThemeContext';

const options: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: 'light_mode' },
  { value: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  { value: 'system', label: 'Sistema', icon: 'settings_brightness' },
];
export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choices = <div role="group" aria-label="Tema de la aplicación" className="flex gap-1">
    {options.map(option => <button key={option.value} type="button" aria-pressed={preference === option.value}
      onClick={() => { setPreference(option.value); setOpen(false); if (compact) trigger.current?.focus(); }}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${preference === option.value ? 'bg-primary-container text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
      <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">{option.icon}</span>{option.label}
    </button>)}
  </div>;
  return <div ref={root} className="relative" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    {compact ? <>
      <button ref={trigger} type="button" aria-label="Cambiar tema de la aplicación" aria-expanded={open}
        onClick={() => setOpen(!open)} title="Apariencia" className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface-container px-2 py-2 text-on-surface-variant focus-visible:outline-2 focus-visible:outline-primary">
        <span aria-hidden="true" className="material-symbols-outlined !text-[20px]">{resolved === 'dark' ? 'dark_mode' : 'light_mode'}</span>
        <span className="hidden md:inline text-xs">{options.find(option => option.value === preference)?.label}</span>
      </button>
      {open && <div className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-outline-variant bg-surface-container-low p-3 shadow-xl">{choices}
        <p className="mt-2 text-xs text-on-surface-variant">{preference === 'system' ? `Sistema: ${resolved === 'dark' ? 'oscuro' : 'claro'}` : 'Se recuerda en este navegador.'}</p>
      </div>}
    </> : <>{choices}<p className="mt-2 text-xs text-on-surface-variant">{preference === 'system' ? `Sistema: ${resolved === 'dark' ? 'oscuro' : 'claro'}` : 'Se recuerda en este navegador.'}</p></>}
  </div>;
}
