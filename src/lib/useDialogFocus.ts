import { useEffect, useRef } from 'react';
/** Mantiene Tab dentro del diálogo y devuelve el foco al control de origen. */
export function useDialogFocus(active = true) {
  const ref = useRef<HTMLElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  if (!active || !originRef.current) originRef.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (!active) return;
    const origin = originRef.current;
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled)')?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !ref.current) return;
      const elements = Array.from<HTMLElement>(ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', trap); if (origin?.isConnected) origin.focus(); };
  }, [active]);
  return ref;
}
