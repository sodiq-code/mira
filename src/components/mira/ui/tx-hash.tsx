'use client';

/**
 * A compact, monospace transaction-hash chip with an explorer link + copy.
 *
 * Tx hashes are the receipts a judge clicks to confirm the on-chain
 * evidence. They render in Geist Mono, shortened for layout, expand on hover
 * via the `title` attribute, and now carry a one-click copy button so a
 * judge can paste a hash straight into an explorer search.
 */

import { Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortenHash } from '@/lib/mira/explorer';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

export function TxHash({
  hash,
  href,
  label,
  className,
  mono = true,
  copyable = true,
}: {
  hash: string;
  href?: string;
  label?: string;
  className?: string;
  mono?: boolean;
  /** Show the copy button. Defaults to true; set false in dense tables. */
  copyable?: boolean;
}) {
  const { copied, copy } = useCopyToClipboard();

  if (!hash) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }

  const content = (
    <span className={cn('inline-flex items-center gap-1', mono && 'font-mono', className)}>
      {label ? <span className="font-sans">{label}: </span> : null}
      <span title={hash}>{shortenHash(hash)}</span>
      {href ? <ExternalLink className="h-3 w-3 opacity-60" aria-hidden /> : null}
    </span>
  );

  return (
    <span className="inline-flex items-center gap-1">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md px-1 py-0.5 text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {content}
        </a>
      ) : (
        content
      )}
      {copyable && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void copy(hash);
          }}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded transition-colors',
            copied
              ? 'text-emerald-500'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}
