import React, { useState } from 'react';
import { usePOS } from '../context/POSContext';
import { ApiError } from '../lib/api';

export const LoginScreen: React.FC = () => {
  const { login, isAuthenticating } = usePOS();
  const [pin, setPin] = useState('1004');
  const [errorMsg, setErrorMsg] = useState('');

  const runLogin = async (attemptPin: string) => {
    setErrorMsg('');
    try {
      await login(attemptPin.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('No se pudo iniciar sesión. Intente nuevamente.');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Por favor ingresa tu Staff ID o PIN');
      return;
    }
    await runLogin(pin);
  };

  const handleQuickLogin = async (testPin: string) => {
    setPin(testPin);
    await runLogin(testPin);
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen w-full flex items-center justify-center bg-[#121212] ambient-bg p-4 select-none relative overflow-hidden"
    >
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#823b19]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#b08c09]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <main className="w-full max-w-md mx-auto relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#1e1e1e] border border-[#54433c]/70 rounded-2xl p-8 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex flex-col items-center">
          {/* Logo & Branding */}
          <div className="mb-6 flex flex-col items-center w-full">
            <div className="w-24 h-24 mb-4 rounded-full bg-[#20201f] flex items-center justify-center overflow-hidden border border-[#54433c] p-2 shadow-inner group">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCKm_4HjXpw70p5L5oeT3ffaeS3hASRSFyIU8BnnrGwgs7YNGbN1xybB9NFtOCM3GZmslBQDhLUdq_W7fq7jjZhOJUUuVsHhBgEEb1RUnu3Q4oyV03MAHtAo3fWW11mtclR-ciq5vs3E2G1L0lw0CYWB1SszMMGlC1Si1Evl4GJ_808q2MqfcT1WzxhC9WKLCgLoq6NLRYEGXMvL4KZUwZSJwvOT5MZ0y3HoIorUnf4tGIdrPM3fmjy3o8LhJrnd-OpnQ"
                alt="El Tayta Logo"
                className="w-full h-full object-contain drop-shadow-md group-hover:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <h1 className="text-[32px] font-extrabold text-[#ffb597] text-center tracking-tight">
              El Tayta
            </h1>
            <p className="text-[15px] font-medium text-[#dac1b8]/80 text-center mt-1">
              POS System Login
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
            {errorMsg && (
              <div className="bg-[#93000a]/30 border border-[#ffb4ab]/40 rounded-xl p-3 text-[13px] text-[#ffdad6] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Staff ID / PIN */}
            <div className="flex flex-col gap-2">
              <label htmlFor="staff-id" className="text-[14px] font-semibold text-[#e5e2e1]">
                Staff ID / PIN
              </label>
              <div className="relative w-full">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#dac1b8]/70 pointer-events-none">
                  <span className="material-symbols-outlined fill text-[20px]">badge</span>
                </span>
                <input
                  id="staff-id"
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Ingresa ID o PIN (ej. 1004)"
                  maxLength={6}
                  className="w-full bg-[#2d2d2d] border border-transparent focus:border-[#60d4fb] rounded-xl text-[#e5e2e1] placeholder-[#dac1b8]/40 pl-11 pr-4 py-3.5 h-[50px] focus:ring-2 focus:ring-[#60d4fb]/30 focus:outline-none transition-all text-[16px]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="btn-login-submit"
              type="submit"
              disabled={isAuthenticating}
              className="mt-2 w-full bg-[#944926] hover:bg-[#823b19] active:bg-[#763211] text-white text-[18px] font-bold py-3.5 px-6 rounded-xl min-h-[50px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(148,73,38,0.4)] disabled:opacity-50 cursor-pointer"
            >
              <span>{isAuthenticating ? 'Accediendo...' : 'Login'}</span>
              <span className="material-symbols-outlined text-[22px]">arrow_forward</span>
            </button>

            {/* Quick Demo Login Switchers */}
            <div className="pt-3 border-t border-[#54433c]/40 flex flex-col gap-2">
              <p className="text-[12px] text-center text-[#dac1b8]/70">Acceso rápido para prueba:</p>
              <button
                type="button"
                disabled={isAuthenticating}
                onClick={() => handleQuickLogin('1004')}
                className="bg-[#2a2a2a] hover:bg-[#353535] border border-[#54433c]/60 rounded-lg py-2 px-3 text-[12px] text-[#e5e2e1] font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <span className="w-2 h-2 rounded-full bg-[#ebc246]"></span>
                Carlos M. (Cajero)
              </button>
            </div>

            {/* System Status Indicator */}
            <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-[#dac1b8]/70">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>API Conectada • TERM-CENTRAL-01</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};