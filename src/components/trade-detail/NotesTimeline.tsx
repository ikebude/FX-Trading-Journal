/**
 * Timestamped notes timeline for a trade.
 * Notes are never silently overwritten — every edit creates a visible history entry.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDatetime } from '@/lib/format';
import { useAppStore } from '@/stores/app-store';
import type { TradeNote } from '@/lib/db/schema';

interface NotesTimelineProps {
  tradeId: string;
  notes: TradeNote[];
}

export function NotesTimeline({ tradeId, notes }: NotesTimelineProps) {
  const { displayTimezone } = useAppStore();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
  }

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await window.ledger.notes.create(tradeId, draft.trim());
      setDraft('');
      setComposing(false);
      invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: string) {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      await window.ledger.notes.update(id, editBody.trim());
      setEditId(null);
      setEditBody('');
      invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await window.ledger.notes.delete(id);
    invalidate();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setComposing((p) => !p)}
        >
          <Plus className="h-3 w-3" />
          Add note
        </Button>
      </div>

      {/* Compose box */}
      {composing && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a note… Markdown supported."
            rows={4}
            className="selectable text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setDraft(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={saving || !draft.trim()}>
              {saving ? 'Saving…' : 'Save note'}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col gap-2">
        {notes.length === 0 && !composing && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No notes yet. Click "Add note" to start your post-trade reflection.
          </p>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            className="relative rounded-md border border-border bg-card px-4 py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {formatDatetime(note.createdAtUtc, displayTimezone)}
                {note.updatedAtUtc !== note.createdAtUtc && (
                  <span className="ml-1 opacity-60">
                    (edited {formatDatetime(note.updatedAtUtc, displayTimezone)})
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => { setEditId(note.id); setEditBody(note.bodyMd); }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(note.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {editId === note.id ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                  className="selectable text-xs"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => handleEdit(note.id)} disabled={saving}>
                    {saving ? 'Saving…' : 'Update'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="selectable prose prose-sm prose-invert max-w-none text-xs text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.bodyMd}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
