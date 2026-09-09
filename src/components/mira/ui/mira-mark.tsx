/**
 * The MIRA wordmark + mark used across the borrower flow shell.
 *
 * The mark is a rounded emerald tile with the initial — kept consistent
 * with the landing page so the transition from marketing into the app
 * feels continuous.
 */

import { cn } from '@/lib/utils';

export function MiraMark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'sm' ? 'h-6 w-6 text-xs' : size === 'lg' ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm';
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-lg bg-emerald-500 font-bold text-emerald-950 shadow-sm shadow-emerald-500/30',
        dim,
        className,
      )}
      aria-hidden
    >
      M
    </span>
  );
}

export function MiraWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <MiraMark />
      <span className="text-lg font-semibold tracking-tight">MIRA</span>
    </span>
  );
}
