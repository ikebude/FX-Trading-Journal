import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import type { Account } from '@/lib/db/schema';

export function AccountSelector() {
  const { activeAccountId, setActiveAccountId } = useAppStore();

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => window.ledger.accounts.list(),
  });

  const active = accounts.find((a) => a.id === activeAccountId);

  return (
    <Select
      value={activeAccountId ?? '__all__'}
      onValueChange={(v) => setActiveAccountId(v === '__all__' ? null : v)}
    >
      <SelectTrigger className="h-8 w-48 border-border text-xs">
        <div className="flex items-center gap-2">
          {active && (
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: active.displayColor }}
            />
          )}
          <SelectValue placeholder="All accounts" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: a.displayColor }}
              />
              {a.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
