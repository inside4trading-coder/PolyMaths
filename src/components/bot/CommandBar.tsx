import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface CommandBarProps {
  onCommand: (cmd: string) => void;
  lastResult?: string;
}

const COMMANDS = ['scan', 'execute', 'prices', 'cycle', 'pause', 'resume', 'reset', 'filter:all', 'filter:signals', 'filter:orders', 'filter:fills', 'filter:errors', 'help'];

export function CommandBar({ onCommand, lastResult }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const cmd = input.trim().toLowerCase();
    if (!cmd) return;
    setHistory(prev => [cmd, ...prev.slice(0, 19)]);
    setHistoryIdx(-1);
    setInput('');
    setSuggestions([]);
    onCommand(cmd);
  }, [input, onCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      if (history[next]) setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(next);
        setInput(history[next]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setInput(suggestions[0]);
        setSuggestions([]);
      }
    }
  };

  const handleChange = (val: string) => {
    setInput(val);
    if (val.trim()) {
      setSuggestions(COMMANDS.filter(c => c.startsWith(val.trim().toLowerCase())).slice(0, 3));
    } else {
      setSuggestions([]);
    }
  };

  return (
    <div className="border-t border-border bg-card/50">
      {/* Last result */}
      {lastResult && (
        <div className="px-3 py-1 text-[10px] font-mono-data text-muted-foreground border-b border-border">
          <span className="text-primary">›</span> {lastResult}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center px-3 py-1.5">
        <ChevronRight className="w-3 h-3 text-primary flex-shrink-0 mr-1" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command... (scan, execute, prices, pause, help)"
          className="flex-1 bg-transparent text-xs font-mono-data text-foreground placeholder:text-muted-foreground/50 outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        {suggestions.length > 0 && input && (
          <div className="flex items-center gap-1">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); setSuggestions([]); }}
                className="px-1.5 py-0.5 rounded bg-accent text-[10px] font-mono-data text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
