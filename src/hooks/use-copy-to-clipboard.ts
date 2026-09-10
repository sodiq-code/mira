'use client';

/**
 * Copy-to-clipboard hook with a transient "copied" flag.
 *
 * Returns the copy handler and a `copied` boolean that flips true for ~1.5s
 * after a successful copy — long enough for a checkmark animation to register
 * but short enough that the icon returns to its idle state promptly.
 */

import { useCallback, useEffect, useState } from 'react';

export function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), resetMs);
    return () => clearTimeout(id);
  }, [copied, resetMs]);

  const copy = useCallback(async (text: string) => {
    if (!text) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts / older browsers.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copied, copy };
}
