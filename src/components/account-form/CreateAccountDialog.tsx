/**
 * CreateAccountDialog — Modal for creating a new account
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

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
import { CreateAccountSchema, type CreateAccountInput } from '@/lib/schemas';

export function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateAccountInput>>({
    accountType: 'LIVE',
    accountCurrency: 'USD',
    displayColor: '#3b82f6',
    initialBalance: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountInput) =>
      window.ledger.accounts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setFormData({
        accountType: 'LIVE',
        accountCurrency: 'USD',
        displayColor: '#3b82f6',
        initialBalance: 0,
      });
      setErrors({});
      onOpenChange(false);
    },
    onError: (err) => {
      setErrors({ submit: (err as Error).message });
    },
  });

  const handleSubmit = () => {
    try {
      const parsed = CreateAccountSchema.parse(formData);
      createMutation.mutate(parsed);
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
          <DialogTitle>Create Account</DialogTitle>
          <DialogDescription>
            Set up a new trading account with broker metadata and trading rules.
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
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
