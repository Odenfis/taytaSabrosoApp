import { ApiError } from './api';

const TERMINAL_KEY = 'ts_terminal_code_v1';

// Identidad por perfil/origen del navegador; cerrar sesión no la elimina.
// 29 caracteres para respetar dispositivos.codigo_terminal NVARCHAR(30).
export function getTerminalIdentity() {
  try {
    let deviceCode = localStorage.getItem(TERMINAL_KEY);
    if (!deviceCode || !/^TERM-[A-F0-9]{24}$/.test(deviceCode)) {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      deviceCode = `TERM-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
      localStorage.setItem(TERMINAL_KEY, deviceCode);
      if (localStorage.getItem(TERMINAL_KEY) !== deviceCode) throw new Error('Storage unavailable');
    }
    return { deviceCode, terminalName: `Terminal ${deviceCode.slice(-6)}` };
  } catch {
    throw new ApiError(
      'No se pudo guardar la identidad de esta terminal. Habilite el almacenamiento del navegador.',
      'TERMINAL_STORAGE_UNAVAILABLE',
      0
    );
  }
}
