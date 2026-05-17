/**
 * MoodCheckin — T3.7
 *
 * Standalone, optional mood check-in (1-5 + optional note). Independent of
 * daily/weekly reviews. Writes one mood_checkins row via window.ledger.mood.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/cn';

const FACES: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

export function MoodCheckin() {
  const accountId = useAppStore((s) => s.activeAccountId);
  const qc = useQueryClient();
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const checkin = useMutation({
    mutationFn: () =>
      window.ledger.mood.checkin({
        accountId: accountId ?? null,
        moodScore: score as number,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mood'] });
      setScore(null);
      setNote('');
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            aria-label={`Mood ${n} of 5`}
            className={cn(
              'flex-1 rounded-md border py-1.5 text-lg transition-colors',
              score === n
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-border/60',
            )}
          >
            {FACES[n]}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note…"
        maxLength={1000}
        className="rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
      />
      <button
        type="button"
        disabled={score == null || checkin.isPending}
        onClick={() => checkin.mutate()}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {checkin.isPending ? 'Saving…' : 'Check in'}
      </button>
    </div>
  );
}
