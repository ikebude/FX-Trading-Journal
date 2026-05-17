/**
 * VoiceMemos — T6.1
 *
 * Record a short audio memo (≤60s, MediaRecorder) attached to a trade.
 * Auto-transcribed offline when the local Whisper model is present;
 * otherwise saved with an editable manual transcript (model-gated, no
 * network).
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

interface Memo {
  id: string;
  audioPath: string;
  transcript: string | null;
  durationSec: number | null;
  createdAtUtc: string;
}

const MAX_SECONDS = 60;

export function VoiceMemos({ tradeId }: { tradeId: string }) {
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: memos = [] } = useQuery<Memo[]>({
    queryKey: ['voice', tradeId],
    queryFn: () => window.ledger.voice.list(tradeId) as Promise<Memo[]>,
  });

  const add = useMutation({
    mutationFn: async (payload: { bytes: ArrayBuffer; durationSec: number }) =>
      window.ledger.voice.add({ tradeId, ...payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice', tradeId] }),
  });

  const saveTranscript = useMutation({
    mutationFn: ({ id, transcript }: { id: string; transcript: string }) =>
      window.ledger.voice.setTranscript(id, transcript),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice', tradeId] }),
  });

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const bytes = await blob.arrayBuffer();
        add.mutate({ bytes, durationSec: elapsed });
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= MAX_SECONDS) stop();
          return e + 1;
        });
      }, 1000);
    } catch {
      // Mic denied/unavailable — silently no-op; manual notes still work.
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current?.state === 'recording') recRef.current.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {recording ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            Stop ({MAX_SECONDS - elapsed}s)
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={start}
            disabled={add.isPending}
          >
            {add.isPending ? 'Saving…' : '● Record memo'}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          ≤60s · transcribed offline when the speech model is installed
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {memos.map((m) => (
          <div key={m.id} className="rounded-md border border-border p-2 text-xs">
            <div className="mb-1 flex justify-between text-muted-foreground">
              <span>{new Date(m.createdAtUtc).toLocaleString()}</span>
              <span>{m.durationSec != null ? `${Math.round(m.durationSec)}s` : ''}</span>
            </div>
            <textarea
              defaultValue={m.transcript ?? ''}
              placeholder="No transcript — type one here…"
              className="w-full resize-none rounded bg-transparent text-xs outline-none"
              rows={2}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== (m.transcript ?? '')) {
                  saveTranscript.mutate({ id: m.id, transcript: v });
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
