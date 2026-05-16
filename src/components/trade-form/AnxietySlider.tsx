/**
 * AnxietySlider — T3.7
 *
 * Optional pre-trade anxiety level (0-10). Unset = not recorded (null), which
 * is distinct from 0 ("completely calm"). Used inside the shared <TradeForm>.
 */
import { cn } from '@/lib/cn';

interface AnxietySliderProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}

export function AnxietySlider({ value, onChange }: AnxietySliderProps) {
  const recorded = value != null;

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={recorded ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer accent-primary"
        aria-label="Pre-trade anxiety level, 0 to 10"
      />
      <span
        className={cn(
          'w-10 text-right text-xs tabular-nums',
          recorded ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {recorded ? `${value}/10` : '—'}
      </span>
      {recorded && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          clear
        </button>
      )}
    </div>
  );
}
