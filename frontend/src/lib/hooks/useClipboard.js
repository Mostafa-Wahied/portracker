import { useCallback, useState } from 'react';

export function useClipboard(timeout=1500) {
  const [copiedKey, setCopiedKey] = useState(null);

  const copy = useCallback(async (key, text) => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
  } catch { void 0; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
  } catch { void 0; }
    }
    if (ok) {
      setCopiedKey(key);
      setTimeout(()=>setCopiedKey(null), timeout);
    }
    return ok;
  },[timeout]);

  return { copiedKey, copy };
}
