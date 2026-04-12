/**
 * TopBar — main application header.
 *
 * Contains:
 *  - Account selector
 *  - Session clock + quick stats (live market session, UTC/NY/LDN times, today's P&L)
 *  - Lot-size calculator popover
 *  - New Trade button
 *  - Keyboard shortcuts help button
 */

import { Plus, Calculator, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountSelector } from './AccountSelector';
import { SessionClock } from '@/components/session-header/SessionClock';
import { RiskCalculator } from '@/components/risk-calculator/RiskCalculator';
import { useAppStore } from '@/stores/app-store';

interface TopBarProps {
  onShortcuts?: () => void;
}

export function TopBar({ onShortcuts }: TopBarProps) {
  const setNewTradeOpen = useAppStore((s) => s.setNewTradeOpen);
  const calcOpen = useAppStore((s) => s.calcOpen);
  const setCalcOpen = useAppStore((s) => s.setCalcOpen);
  const setPendingLotSize = useAppStore((s) => s.setPendingLotSize);

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: account selector */}
      <AccountSelector />

      {/* Center: session clock */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <SessionClock />
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-2">
        {/* Risk calculator */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Lot-size calculator"
            onClick={() => setCalcOpen(!calcOpen)}
          >
            <Calculator className="h-4 w-4" />
          </Button>
          {calcOpen && (
            <div className="absolute right-0 top-10 z-50">
              <RiskCalculator
                onClose={() => setCalcOpen(false)}
                onUseLotSize={(lots) => {
                  setPendingLotSize(lots);
                  setCalcOpen(false);
                  setNewTradeOpen(true);
                }}
              />
            </div>
          )}
        </div>

        {/* Keyboard shortcuts */}
        {onShortcuts && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Keyboard shortcuts (?)"
            onClick={onShortcuts}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        )}

        {/* New trade */}
        <Button size="sm" data-tour="new-trade" onClick={() => setNewTradeOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="ml-1">New Trade</span>
        </Button>
      </div>
    </header>
  );
}
