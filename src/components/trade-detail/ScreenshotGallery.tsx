/**
 * Screenshot gallery for a trade.
 * Drag-to-upload or click to browse. Shows WebP thumbnails via data-URL.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, ZoomIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Screenshot } from '@/lib/db/schema';

interface ScreenshotGalleryProps {
  tradeId: string;
  screenshots: Screenshot[];
}

export function ScreenshotGallery({ tradeId, screenshots }: ScreenshotGalleryProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null); // data-URL
  const [dataUrls, setDataUrls] = useState<Record<string, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
  }

  async function loadDataUrl(id: string) {
    if (dataUrls[id]) return;
    const url = await window.ledger.screenshots.getDataUrl(id);
    if (url) setDataUrls((prev) => ({ ...prev, [id]: url }));
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      await window.ledger.screenshots.saveFromBuffer(tradeId, 'ENTRY', buf, file.name);
      invalidate();
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) await uploadFile(file);
    }
  }

  async function handleDelete(id: string) {
    await window.ledger.screenshots.delete(id);
    invalidate();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Screenshots</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-3 w-3" />
          {uploading ? 'Uploading…' : 'Add image'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone + grid */}
      <div
        className={cn(
          'min-h-[80px] rounded-md border-2 border-dashed transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {screenshots.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            Drop chart screenshots here or click "Add image"
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-2 sm:grid-cols-4">
            {screenshots.map((s) => (
              <div key={s.id} className="group relative aspect-video overflow-hidden rounded-md border border-border bg-muted">
                {dataUrls[s.id] ? (
                  <img
                    src={dataUrls[s.id]}
                    alt={s.caption ?? s.kind}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    className="flex h-full w-full items-center justify-center text-xs text-muted-foreground"
                    onClick={() => loadDataUrl(s.id)}
                  >
                    Load
                  </button>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  {dataUrls[s.id] && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white"
                      onClick={() => setLightbox(dataUrls[s.id])}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white hover:text-rose-400"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {s.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80 truncate">
                    {s.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Screenshot"
            className="max-h-[90vh] max-w-[90vw] rounded object-contain"
          />
        </div>
      )}
    </div>
  );
}
