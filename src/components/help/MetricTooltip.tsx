import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getEntry } from './glossary-entries';

interface MetricTooltipProps {
  /** Glossary term key (case-insensitive). If not found, renders children as-is. */
  metric: string;
  children: ReactNode;
}

export function MetricTooltip({ metric, children }: MetricTooltipProps) {
  const entry = getEntry(metric);
  if (!entry) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dashed border-muted-foreground/40">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-left">
        <p className="font-semibold text-foreground">{entry.term}</p>
        <p className="mt-1 text-xs text-muted-foreground">{entry.definition}</p>
        {entry.example && (
          <p className="mt-1 text-xs italic text-muted-foreground">{entry.example}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
