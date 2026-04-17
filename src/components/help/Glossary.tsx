import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GLOSSARY, type GlossaryEntry } from './glossary-entries';

interface GlossaryProps {
  open: boolean;
  onClose: () => void;
}

export function Glossary({ open, onClose }: GlossaryProps) {
  const [search, setSearch] = useState('');

  const filtered = GLOSSARY.filter(
    (e) =>
      search === '' ||
      e.term.toLowerCase().includes(search.toLowerCase()) ||
      e.definition.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trading Glossary</DialogTitle>
        </DialogHeader>

        <input
          type="text"
          placeholder="Search terms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {filtered.map((entry) => (
            <GlossaryRow key={entry.term} entry={entry} />
          ))}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No terms matching &quot;{search}&quot;
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GlossaryRow({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="px-1 py-3">
      <p className="text-sm font-semibold text-foreground">{entry.term}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{entry.definition}</p>
      {entry.example && (
        <p className="mt-1 text-xs italic text-muted-foreground">
          Example: {entry.example}
        </p>
      )}
      {entry.seeAlso && (
        <p className="mt-1 text-xs text-muted-foreground">
          See also: {entry.seeAlso.join(', ')}
        </p>
      )}
    </div>
  );
}
