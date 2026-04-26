import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Methodology, PropFirmPreset } from '@/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Inline-edit row shared by both tabs
// ─────────────────────────────────────────────────────────────

interface EditRowProps {
  value: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

function EditRow({ value, onSave, onCancel }: EditRowProps) {
  const [name, setName] = useState(value);
  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-7 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(name.trim())}>
        <Check className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Methodologies tab
// ─────────────────────────────────────────────────────────────

function MethodologiesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery<Methodology[]>({
    queryKey: ['library', 'methodologies'],
    queryFn: () => window.ledger.library.methodologies.list() as Promise<Methodology[]>,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => window.ledger.library.methodologies.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'methodologies'] });
      setNewName('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      window.ledger.library.methodologies.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'methodologies'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.ledger.library.methodologies.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'methodologies'] }),
  });

  function handleAdd() {
    const trimmed = newName.trim();
    if (trimmed) createMutation.mutate(trimmed);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          placeholder="New methodology name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="max-w-xs"
        />
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No methodologies yet. Add one above to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              {editingId === m.id ? (
                <EditRow
                  value={m.name}
                  onSave={(name) => updateMutation.mutate({ id: m.id, name })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <span className="text-sm font-medium">{m.name}</span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditingId(m.id)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(m.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Prop firm presets tab
// ─────────────────────────────────────────────────────────────

interface PresetFormState {
  name: string;
  maxDrawdownPct: string;
  maxDailyLossPct: string;
  maxDrawdownAmount: string;
}

const emptyForm: PresetFormState = {
  name: '',
  maxDrawdownPct: '',
  maxDailyLossPct: '',
  maxDrawdownAmount: '',
};

function PropFirmPresetsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<PresetFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery<PropFirmPreset[]>({
    queryKey: ['library', 'presets'],
    queryFn: () => window.ledger.library.presets.list() as Promise<PropFirmPreset[]>,
  });

  function pct(s: string): number | undefined {
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  }

  const createMutation = useMutation({
    mutationFn: (f: PresetFormState) =>
      window.ledger.library.presets.create({
        name: f.name,
        maxDrawdownPct: pct(f.maxDrawdownPct),
        maxDailyLossPct: pct(f.maxDailyLossPct),
        maxDrawdownAmount: pct(f.maxDrawdownAmount),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'presets'] });
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: PresetFormState }) =>
      window.ledger.library.presets.update(id, {
        name: f.name,
        maxDrawdownPct: pct(f.maxDrawdownPct),
        maxDailyLossPct: pct(f.maxDailyLossPct),
        maxDrawdownAmount: pct(f.maxDrawdownAmount),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'presets'] });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.ledger.library.presets.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'presets'] }),
  });

  function startEdit(p: PropFirmPreset) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      maxDrawdownPct: p.maxDrawdownPct?.toString() ?? '',
      maxDailyLossPct: p.maxDailyLossPct?.toString() ?? '',
      maxDrawdownAmount: p.maxDrawdownAmount?.toString() ?? '',
    });
  }

  function field(key: keyof PresetFormState, placeholder: string) {
    return (
      <Input
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="h-8 text-sm"
      />
    );
  }

  const formPanel = (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {editingId ? 'Edit preset' : 'New preset'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{field('name', 'Preset name (e.g. FTMO 10K)')}</div>
        {field('maxDrawdownPct', 'Max drawdown %')}
        {field('maxDailyLossPct', 'Max daily loss %')}
        {field('maxDrawdownAmount', 'Max drawdown $')}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!form.name.trim()}
          onClick={() => {
            if (editingId) {
              updateMutation.mutate({ id: editingId, f: form });
            } else {
              createMutation.mutate(form);
            }
          }}
        >
          {editingId ? 'Save changes' : 'Add preset'}
        </Button>
        {editingId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setEditingId(null); setForm(emptyForm); }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {formPanel}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No presets yet. Add a prop firm above to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium">{p.name}</span>
                <span className="ml-3 text-xs text-muted-foreground">
                  {[
                    p.maxDrawdownPct != null && `DD ${p.maxDrawdownPct}%`,
                    p.maxDailyLossPct != null && `Daily ${p.maxDailyLossPct}%`,
                    p.maxDrawdownAmount != null && `$${p.maxDrawdownAmount}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => startEdit(p)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(p.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page root
// ─────────────────────────────────────────────────────────────

export function LibraryPage() {
  return (
    <div className="flex flex-1 flex-col overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage trading methodologies and prop firm rule presets.
        </p>
      </div>
      <Tabs defaultValue="methodologies" className="flex-1">
        <TabsList>
          <TabsTrigger value="methodologies">Methodologies</TabsTrigger>
          <TabsTrigger value="presets">Prop Firm Presets</TabsTrigger>
        </TabsList>
        <TabsContent value="methodologies" className="mt-4">
          <MethodologiesTab />
        </TabsContent>
        <TabsContent value="presets" className="mt-4">
          <PropFirmPresetsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
