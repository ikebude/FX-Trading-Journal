/**
 * EditAccountDialog — Modal for editing an existing account
 */

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccountFormFields } from './AccountFormFields';
import { UpdateAccountSchema, type UpdateAccountInput } from '@/lib/schemas';
import type { Account } from '@/lib/db/schema';

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<UpdateAccountInput>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when account loads
  useEffect(() => {
    if (account) {
      // Convert null values to undefined for schema compatibility
      setFormData({
        name: account.name,
        broker: account.broker ?? undefined,
        accountCurrency: account.accountCurrency,
        initialBalance: account.initialBalance,
        accountType: account.accountType,
        displayColor: account.displayColor,
        openedAtUtc: account.openedAtUtc ?? undefined,
        propDailyLossLimit: account.propDailyLossLimit ?? undefined,
        propDailyLossPct: account.propDailyLossPct ?? undefined,
        propMaxDrawdown: account.propMaxDrawdown ?? undefined,
        propMaxDrawdownPct: account.propMaxDrawdownPct ?? undefined,
        propDrawdownType: account.propDrawdownType ?? undefined,
        propProfitTarget: account.propProfitTarget ?? undefined,
        propProfitTargetPct: account.propProfitTargetPct ?? undefined,
        propPhase: account.propPhase ?? undefined,
        server: account.server ?? undefined,
        platform: account.platform ?? undefined,
        leverage: account.leverage ?? undefined,
        timezone: account.timezone ?? undefined,
        login: account.login ?? undefined,
        brokerType: account.brokerType ?? undefined,
      });
      setErrors({});
    }
  }, [account, open]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateAccountInput) =>
      account ? window.ledger.accounts.update(account.id, data) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setFormData({});
      setErrors({});
      onOpenChange(false);
    },
    onError: (err) => {
      setErrors({ submit: (err as Error).message });
    },
  });

  const handleSubmit = () => {
    try {
      const parsed = UpdateAccountSchema.parse(formData);
      updateMutation.mutate(parsed);
    } catch (err: any) {
      const newErrors: Record<string, string> = {};
      if (err.errors) {
        err.errors.forEach((e: any) => {
          const path = e.path.join('.');
          newErrors[path] = e.message;
        });
      }
      setErrors(newErrors);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>
            Update account details, broker metadata, and trading rules.
          </DialogDescription>
        </DialogHeader>

        <AccountFormFields
          data={formData}
          onChange={(field, value) => {
            setFormData((prev) => ({ ...prev, [field]: value }));
            // Clear error for this field when user starts editing
            if (errors[field]) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                return next;
              });
            }
          }}
          errors={errors}
        />

        {errors.submit && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errors.submit}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
