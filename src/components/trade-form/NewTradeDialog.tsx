import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TradeForm } from './TradeForm';
import { useAppStore } from '@/stores/app-store';

export function NewTradeDialog() {
  const { newTradeOpen, setNewTradeOpen } = useAppStore();

  return (
    <Dialog open={newTradeOpen} onOpenChange={setNewTradeOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>New Trade</DialogTitle>
        </DialogHeader>
        <TradeForm
          mode="full"
          onSuccess={() => setNewTradeOpen(false)}
          onCancel={() => setNewTradeOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
