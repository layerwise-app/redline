import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'redline:draft:';

export function readDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage. The draft just won't survive reload.
  }
}

/** Text that survives reloads until it's sent or cancelled. */
export function useDraftText(key: string) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(readDraft<string>(key) ?? '');
  }, [key]);
  const update = useCallback(
    (next: string) => {
      setText(next);
      writeDraft(key, next ? next : null);
    },
    [key]
  );
  const clear = useCallback(() => {
    setText('');
    writeDraft(key, null);
  }, [key]);
  return [text, update, clear] as const;
}
