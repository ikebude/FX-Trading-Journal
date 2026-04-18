/**
 * GuidedTour — step-by-step first-run walkthrough.
 *
 * Shown automatically on first launch (when first_run_complete = false in config).
 * Can also be triggered manually from Settings.
 *
 * Uses a spotlight overlay pattern: each step highlights a DOM element by
 * data-tour attribute and shows a tooltip card positioned relative to it.
 * Falls back gracefully if the target element is not in the DOM.
 *
 * Steps:
 *  1. Welcome — overview of FXLedger
 *  2. New Trade button — how to log a trade
 *  3. Blotter — what the trade list shows
 *  4. Dashboard — performance analytics
 *  5. Bridge — live MT4/5 integration
 *  6. Hotkey — Ctrl+Alt+L to open overlay
 *  7. Done — congratulations, start trading
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────
// Tour step definitions
// ─────────────────────────────────────────────────────────────

interface TourStep {
  title: string;
  body: string;
  target?: string;   // data-tour attribute value on the target element
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to FXLedger 👋',
    body: 'FXLedger is your local-first forex trading journal. Everything lives on your machine — no cloud, no subscriptions.',
    position: 'center',
  },
  {
    title: 'Log Your First Trade',
    body: 'Click "New Trade" to manually log a trade, or use Ctrl+Alt+L from any app to open the quick-capture overlay.',
    target: 'new-trade',
    position: 'bottom',
  },
  {
    title: 'The Blotter',
    body: 'Every trade appears here. Filter by symbol, date, session, setup, or R-multiple. Click a row to view full details.',
    target: 'sidebar-blotter',
    position: 'right',
  },
  {
    title: 'Dashboard',
    body: 'Your performance at a glance — equity curve, R distribution, session heatmaps, win rate, and more.',
    target: 'sidebar-dashboard',
    position: 'right',
  },
  {
    title: 'Live Bridge',
    body: 'Connect your MT4/5 terminal. Set the watch folder in Settings → Bridge. Trades appear automatically when you close them.',
    target: 'sidebar-settings',
    position: 'right',
  },
  {
    title: 'Import Statements',
    body: 'Already have trades? Import MT4 or MT5 HTML statements or CSV files from your broker.',
    target: 'sidebar-import',
    position: 'right',
  },
  {
    title: "You're Ready!",
    body: 'Start by importing your history or logging today\'s trade. Press ? at any time for keyboard shortcuts.',
    position: 'center',
  },
];

// ─────────────────────────────────────────────────────────────
// Spotlight helpers
// ─────────────────────────────────────────────────────────────

function getTargetRect(target?: string): DOMRect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  return el ? el.getBoundingClientRect() : null;
}

// ─────────────────────────────────────────────────────────────
// Tour card
// ─────────────────────────────────────────────────────────────

function TourCard({
  step,
  stepIndex,
  total,
  onNext,
  onPrev,
  onClose,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(getTargetRect(step.target));
  }, [step.target]);

  const isLast = stepIndex === total - 1;
  const isFirst = stepIndex === 0;

  // Positioning: center or near target
  let cardStyle: React.CSSProperties = {};
  const isCenter = step.position === 'center' || !rect;

  if (!isCenter && rect) {
    const PAD = 16;
    switch (step.position) {
      case 'right':
        cardStyle = { top: rect.top, left: rect.right + PAD };
        break;
      case 'bottom':
        cardStyle = { top: rect.bottom + PAD, left: rect.left };
        break;
      case 'left':
        cardStyle = { top: rect.top, right: window.innerWidth - rect.left + PAD };
        break;
      case 'top':
        cardStyle = { bottom: window.innerHeight - rect.top + PAD, left: rect.left };
        break;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]" />

      {/* Spotlight cutout (if we have a target rect) */}
      {rect && (
        <div
          className="fixed z-40 rounded-md ring-2 ring-primary ring-offset-2"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            background: 'transparent',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Card */}
      <div
        className={cn(
          'fixed z-50 w-80 rounded-xl border border-border bg-card p-5 shadow-2xl',
          isCenter && 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        )}
        style={isCenter ? undefined : cardStyle}
      >
        {/* Progress dots */}
        <div className="mb-3 flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === stepIndex ? 'w-4 bg-primary' : 'w-1.5 bg-border',
              )}
            />
          ))}
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h3 className="mb-2 text-sm font-semibold text-foreground">{step.title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onPrev}
            disabled={isFirst}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {stepIndex + 1} / {total}
          </span>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={isLast ? onClose : onNext}>
            {isLast ? 'Start Trading' : 'Next'}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main GuidedTour
// ─────────────────────────────────────────────────────────────

interface GuidedTourProps {
  onComplete: () => void;
}

export function GuidedTour({ onComplete }: GuidedTourProps) {
  const [step, setStep] = useState(0);

  return (
    <TourCard
      step={STEPS[step]}
      stepIndex={step}
      total={STEPS.length}
      onNext={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
      onPrev={() => setStep((s) => Math.max(s - 1, 0))}
      onClose={onComplete}
    />
  );
}
