/**
 * CommandPalette — T4.6
 *
 * Self-contained Ctrl/Cmd+K palette (no cmdk dependency — keeps the locked
 * stack). Fuzzy-ish substring filter over navigation + actions, full
 * keyboard control (↑ ↓ Enter Esc).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/cn';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  onClose,
  onShortcuts,
}: {
  onClose: () => void;
  onShortcuts: () => void;
}) {
  const navigate = useNavigate();
  const setNewTradeOpen = useAppStore((s) => s.setNewTradeOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate({ to: path });
      onClose();
    };
    return [
      { id: 'new-trade', label: 'New Trade', hint: 'N', run: () => { setNewTradeOpen(true); onClose(); } },
      { id: 'nav-blotter', label: 'Go to Blotter', hint: 'G B', run: go('/') },
      { id: 'nav-dashboard', label: 'Go to Dashboard', hint: 'G D', run: go('/dashboard') },
      { id: 'nav-reviews', label: 'Go to Reviews', hint: 'G R', run: go('/reviews') },
      { id: 'nav-import', label: 'Go to Import', run: go('/import') },
      { id: 'nav-library', label: 'Go to Library', run: go('/library') },
      { id: 'nav-calendar', label: 'Go to Calendar', hint: 'G C', run: go('/calendar') },
      { id: 'nav-reports', label: 'Go to Reports', run: go('/reports') },
      { id: 'nav-postmortem', label: 'Go to Post-mortem', run: go('/post-mortem') },
      { id: 'nav-trash', label: 'Go to Trash', run: go('/trash') },
      { id: 'nav-settings', label: 'Go to Settings', hint: 'G S', run: go('/settings') },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', hint: '?', run: () => { onClose(); onShortcuts(); } },
    ];
  }, [navigate, onClose, onShortcuts, setNewTradeOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setActive(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[active]?.run();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or page…"
          aria-label="Command palette"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No matches</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => c.run()}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2 text-left text-sm',
                  i === active ? 'bg-primary/10 text-primary' : 'text-foreground',
                )}
              >
                <span>{c.label}</span>
                {c.hint && (
                  <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {c.hint}
                  </kbd>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
