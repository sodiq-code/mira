/**
 * A compact, monospace transaction-hash chip with an explorer link.
 *
 * Tx hashes are the receipts a judge clicks to confirm the on-chain
 * evidence. They are rendered in JetBrains Mono / Geist Mono, shortened for
 * layout, and expand on hover via the `title` attribute.
 */

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortenHash } from '@/lib/mira/explorer';

export function TxHash({
  hash,
  href,
  label,
  className,
  mono = true,
}: {
  hash: string;
  href?: string;
  label?: string;
  className?: string;
  mono?: boolean;
}) {
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

  if (!href) return content;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-md px-1 py-0.5 text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {content}
    </a>
  );
}
