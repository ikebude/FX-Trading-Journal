/**
 * Compact audit log for a single trade — shows all mutations in reverse chronological order.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDatetime } from '@/lib/format';
import { useAppStore } from '@/stores/app-store';
import type { AuditLogEntry } from '@/lib/db/schema';

interface AuditLogProps {
  tradeId: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'text-emerald-400',
  UPDATE: 'text-blue-400',
  DELETE: 'text-rose-400',
  RESTORE: 'text-yellow-400',
  MERGE: 'text-purple-400',
  BULK_UPDATE: 'text-blue-300',
};

export function AuditLog({ tradeId }: AuditLogProps) {
  const { displayTimezone } = useAppStore();

  const { data: entries = [] } = useQuery<AuditLogEntry[]>({
    queryKey: ['audit', tradeId],
    queryFn: () => window.ledger.audit.forTrade(tradeId),
  });

  if (entries.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">No audit history.</div>
    );
  }

  return (
    <div className="flex flex-col gap-0 divide-y divide-border rounded-md border border-border">
      {entries.map((e) => {
        let changedFields: Record<string, [unknown, unknown]> | null = null;
        try {
          if (e.changedFields) changedFields = JSON.parse(e.changedFields);
        } catch {/* ignore */}

        return (
          <div key={e.id} className="flex items-start gap-3 px-3 py-2">
            <span
              className={`w-20 shrink-0 text-[10px] font-semibold uppercase ${ACTION_COLORS[e.action] ?? 'text-muted-foreground'}`}
            >
              {e.action}
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{e.entityType}</span>
              {changedFields && Object.keys(changedFields).length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(changedFields).map(([field, [from, to]]) => (
                    <span key={field} className="text-[10px] text-muted-foreground/70">
                      <span className="text-foreground/60">{field}</span>:{' '}
                      <span className="line-through">{String(from ?? '—')}</span>{' '}
                      <span className="text-foreground">→ {String(to ?? '—')}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
              {formatDatetime(e.timestampUtc, displayTimezone, 'dd MMM HH:mm')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
