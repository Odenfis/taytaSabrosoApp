import React, { createContext, useContext, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
type ThemeSnapshot = { preference: ThemePreference; resolved: ResolvedTheme };
type ThemeStore = {
  getSnapshot: () => ThemeSnapshot;
  subscribe: (listener: () => void) => () => void;
  setPreference: (preference: ThemePreference) => void;
};
declare global { interface Window { TaytaTheme: ThemeStore } }
const ThemeContext = createContext<ThemeSnapshot & Pick<ThemeStore, 'setPreference'> | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const store = window.TaytaTheme;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <ThemeContext.Provider value={{ ...snapshot, setPreference: store.setPreference }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
