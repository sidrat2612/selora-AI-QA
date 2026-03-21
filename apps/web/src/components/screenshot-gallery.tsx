'use client';

import { useCallback, useEffect, useState } from 'react';

type ScreenshotItem = {
  id: string;
  fileName: string;
  objectUrl: string;
};

export function ScreenshotGallery({
  screenshots,
  onClose,
}: {
  screenshots: ScreenshotItem[];
  onClose?: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = screenshots[selectedIndex] ?? null;

  const goTo = useCallback(
    (direction: -1 | 1) => {
      setSelectedIndex((current) => {
        const next = current + direction;
        if (next < 0) return screenshots.length - 1;
        if (next >= screenshots.length) return 0;
        return next;
      });
    },
    [screenshots.length],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goTo(-1);
      else if (e.key === 'ArrowRight') goTo(1);
      else if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goTo, onClose]);

  if (screenshots.length === 0) {
    return (
      <div className="empty-state">
        No screenshots available.
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-none border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Screenshots</span>
          <span className="text-xs text-[var(--muted)]">
            {selectedIndex + 1} / {screenshots.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="secondary-button !px-3 !py-1.5 text-xs"
            disabled={screenshots.length <= 1}
            type="button"
            onClick={() => goTo(-1)}
          >
            ← Prev
          </button>
          <button
            className="secondary-button !px-3 !py-1.5 text-xs"
            disabled={screenshots.length <= 1}
            type="button"
            onClick={() => goTo(1)}
          >
            Next →
          </button>
          {onClose ? (
            <button
              className="secondary-button !px-3 !py-1.5 text-xs"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      {selected ? (
        <div className="flex items-center justify-center p-4">
          <img
            alt={selected.fileName}
            className="max-h-[65vh] w-auto border border-[var(--line)]"
            src={selected.objectUrl}
          />
        </div>
      ) : null}

      {selected ? (
        <div className="border-t border-[var(--line)] px-5 py-2 text-xs text-[var(--muted)]">
          {selected.fileName}
        </div>
      ) : null}

      {screenshots.length > 1 ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] p-4">
          {screenshots.map((screenshot, index) => (
            <button
              key={screenshot.id}
              className={`overflow-hidden border-2 transition ${
                index === selectedIndex
                  ? 'border-[var(--accent)]'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              type="button"
              onClick={() => setSelectedIndex(index)}
            >
              <img
                alt={screenshot.fileName}
                className="h-16 w-24 object-cover"
                src={screenshot.objectUrl}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
