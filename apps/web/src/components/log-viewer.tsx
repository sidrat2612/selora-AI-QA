'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';

type LogLevel = 'stdout' | 'stderr' | 'stack' | 'info';

type LogLine = {
  number: number;
  text: string;
  level: LogLevel;
};

function classifyLevel(line: string, currentSection: LogLevel): LogLevel {
  if (/^\[stdout\]/.test(line)) return 'stdout';
  if (/^\[stderr\]/.test(line)) return 'stderr';
  if (/^\[stack\]/.test(line)) return 'stack';
  return currentSection;
}

function levelColor(level: LogLevel) {
  switch (level) {
    case 'stderr':
    case 'stack':
      return 'text-red-400';
    case 'stdout':
      return 'text-green-300';
    default:
      return 'text-gray-300';
  }
}

export function LogViewer({
  content,
  fileName,
  onClose,
}: {
  content: string;
  fileName: string;
  onClose?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [goToInput, setGoToInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const lines = useMemo<LogLine[]>(() => {
    let currentSection: LogLevel = 'info';
    return content.split('\n').map((text, index) => {
      currentSection = classifyLevel(text, currentSection);
      return { number: index + 1, text, level: currentSection };
    });
  }, [content]);

  const filteredLines = useMemo(() => {
    if (!search.trim()) return lines;
    const lower = search.toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(lower));
  }, [lines, search]);

  const scrollToLine = useCallback(
    (lineNumber: number) => {
      setHighlightedLine(lineNumber);
      const element = containerRef.current?.querySelector(`[data-line="${lineNumber}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [],
  );

  const handleGoTo = useCallback(() => {
    const n = Number.parseInt(goToInput, 10);
    if (n >= 1 && n <= lines.length) {
      scrollToLine(n);
      setGoToInput('');
    }
  }, [goToInput, lines.length, scrollToLine]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="flex h-full flex-col rounded-none border border-[var(--line)] bg-[rgba(16,24,40,0.96)] text-sm text-white shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-gray-400">{fileName}</span>
          <span className="text-xs text-gray-500">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[var(--brand)]"
            placeholder="Search logs..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="w-20 border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[var(--brand)]"
            placeholder="Go to #"
            type="text"
            value={goToInput}
            onChange={(e) => setGoToInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleGoTo();
            }}
          />
          {onClose ? (
            <button
              className="border border-white/10 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-0 font-mono text-xs leading-relaxed"
      >
        {filteredLines.map((line) => (
          <div
            key={line.number}
            className={`flex hover:bg-white/5 ${highlightedLine === line.number ? 'bg-yellow-500/20' : ''}`}
            data-line={line.number}
          >
            <span
              className="sticky left-0 w-14 shrink-0 select-none bg-[rgba(16,24,40,0.96)] px-3 py-0.5 text-right text-gray-600 cursor-pointer hover:text-gray-400"
              onClick={() => scrollToLine(line.number)}
            >
              {line.number}
            </span>
            <span className={`flex-1 whitespace-pre-wrap break-all px-3 py-0.5 ${levelColor(line.level)}`}>
              {search && line.text.toLowerCase().includes(search.toLowerCase())
                ? highlightMatches(line.text, search)
                : line.text || '\u00A0'}
            </span>
          </div>
        ))}
        {filteredLines.length === 0 && search ? (
          <p className="p-5 text-gray-500">No lines match &quot;{search}&quot;</p>
        ) : null}
      </div>

      {search && filteredLines.length > 0 ? (
        <div className="border-t border-white/10 px-5 py-2 text-xs text-gray-500">
          Showing {filteredLines.length} of {lines.length} lines
        </div>
      ) : null}
    </div>
  );
}

function highlightMatches(text: string, query: string) {
  const parts: Array<{ text: string; match: boolean }> = [];
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const index = lower.indexOf(lowerQuery, cursor);
    if (index === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index), match: false });
    }
    parts.push({ text: text.slice(index, index + query.length), match: true });
    cursor = index + query.length;
  }

  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-yellow-500/40 text-white">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
