/**
 * Toast notification system using @radix-ui/react-toast.
 * Usage: call `toast("message")` from anywhere.
 */

import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────
// Types & context
// ─────────────────────────────────────────────────────────────

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error';
}

interface ToastContextValue {
  toast: (title: string, opts?: { description?: string; variant?: ToastMessage['variant'] }) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (title: string, opts?: { description?: string; variant?: ToastMessage['variant'] }) => {
      const id = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id, title, description: opts?.description, variant: opts?.variant ?? 'default' }]);
    },
    [],
  );

  function dismiss(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}

        {messages.map((msg) => (
          <ToastPrimitive.Root
            key={msg.id}
            onOpenChange={(open) => { if (!open) dismiss(msg.id); }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[swipe=end]:animate-out data-[state=closed]:fade-out-80',
              'data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-right-full',
              msg.variant === 'success' && 'border-emerald-500/30 bg-emerald-950 text-emerald-100',
              msg.variant === 'error' && 'border-rose-500/30 bg-rose-950 text-rose-100',
              (msg.variant === 'default' || !msg.variant) && 'border-border bg-card text-foreground',
            )}
          >
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-medium">
                {msg.title}
              </ToastPrimitive.Title>
              {msg.description && (
                <ToastPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
                  {msg.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              onClick={() => dismiss(msg.id)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[9999] flex w-80 flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
