/**
 * KeyboardShortcuts — modal overlay showing all keyboard shortcuts.
 *
 * Triggered by the keyboard icon in the TopBar (or pressing ?).
 * Closed by pressing Escape or clicking outside.
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ShortcutGroup {
  label: string;
  items: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    items: [
      { keys: ['G', 'B'], description: 'Go to Blotter' },
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'R'], description: 'Go to Reviews' },
      { keys: ['G', 'C'], description: 'Go to Calendar' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    label: 'Trades',
    items: [
      { keys: ['N'], description: 'New trade' },
      { keys: ['Ctrl', 'Alt', 'L'], description: 'Open capture overlay (global)' },
      { keys: ['Esc'], description: 'Close drawer / dialog' },
    ],
  },
  {
    label: 'Blotter',
    items: [
      { keys: ['F'], description: 'Toggle filter panel' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['↑', '↓'], description: 'Navigate rows' },
      { keys: ['Enter'], description: 'Open selected trade' },
    ],
  },
  {
    label: 'General',
    items: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Ctrl', 'Z'], description: 'Undo (where applicable)' },
    ],
  },
];

function KeyChip({ k }: { k: string }) {
  return (
    <kbd className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-semibold text-foreground shadow-sm">
      {k}
    </kbd>
  );
}

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[560px] max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Groups */}
        <div className="grid grid-cols-2 gap-6 p-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h3>
              <div className="flex flex-col gap-2">
                {group.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          {ki > 0 && (
                            <span className="text-[9px] text-muted-foreground/50">+</span>
                          )}
                          <KeyChip k={k} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          <p className="text-[10px] text-muted-foreground/60">
            Press <KeyChip k="?" /> anywhere to open this panel. Press <KeyChip k="Esc" /> to close.
          </p>
        </div>
      </div>
    </div>
  );
}
