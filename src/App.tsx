/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { POSProvider, usePOS } from './context/POSContext';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { TableMapScreen } from './components/TableMapScreen';
import { OrderTakingScreen } from './components/OrderTakingScreen';
import { PaymentScreen } from './components/PaymentScreen';
import { CashLedgerScreen } from './components/CashLedgerScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { KardexScreen } from './components/KardexScreen';
import { PurchasesScreen } from './components/PurchasesScreen';
import { RecipesScreen } from './components/RecipesScreen';
import { ExpenseRatiosScreen } from './components/ExpenseRatiosScreen';
import { BankAccountsScreen } from './components/BankAccountsScreen';
import { ShiftModal } from './components/ShiftModal';
import { PrinterTestModal } from './components/PrinterTestModal';
import { OfflineModal } from './components/OfflineModal';

const MainLayout: React.FC = () => {
  const { currentUser, isSessionInitializing, currentScreen } = usePOS();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isSessionInitializing) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#121212]">
        <div className="flex flex-col items-center gap-3 text-[#dac1b8]/80">
          <span className="material-symbols-outlined animate-spin text-[32px]">autorenew</span>
          <p className="text-[13px]">Validando sesión...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  // Screens that have their own full custom header/split layout
  const isFullCustomHeader = currentScreen === 'pedido' || currentScreen === 'cobro';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#121212] text-[#e5e2e1] font-sans antialiased select-none">
      {/* Persistent POS Sidebar */}
      <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
        />
      )}

      {/* Main Workspace Area (Offset for sidebar: w-24 on mobile/tablet, w-64 on desktop) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden ml-24 md:ml-64 relative">
        {/* Top Header if not full screen comanda/cobro */}
        {!isFullCustomHeader && (
          <Header onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />
        )}

        {/* Dynamic Screen Outlet */}
        <div className={`flex-1 flex flex-col overflow-hidden ${!isFullCustomHeader ? 'pt-16' : ''}`}>
          {currentScreen === 'mesas' && <TableMapScreen />}
          {currentScreen === 'pedido' && <OrderTakingScreen />}
          {currentScreen === 'cobro' && <PaymentScreen />}
          {currentScreen === 'kardex' && <KardexScreen />}
          {currentScreen === 'compras' && <PurchasesScreen />}
          {currentScreen === 'recetas' && <RecipesScreen />}
          {currentScreen === 'ratios' && <ExpenseRatiosScreen />}
          {currentScreen === 'movimientos' && <CashLedgerScreen />}
          {currentScreen === 'bancos' && <BankAccountsScreen />}
          {currentScreen === 'reportes' && <ReportsScreen />}
          {currentScreen === 'configuracion' && <SettingsScreen />}
        </div>
      </div>

      {/* Global Modals for Shift Arqueo, Thermal Printer Diagnostics, and Offline Connectivity */}
      <ShiftModal />
      <PrinterTestModal />
      <OfflineModal />
    </div>
  );
};

export default function App() {
  return (
    <POSProvider>
      <MainLayout />
    </POSProvider>
  );
}
