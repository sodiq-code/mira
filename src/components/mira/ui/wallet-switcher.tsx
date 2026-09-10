'use client';

/**
 * Wallet switcher — a header chip showing the connected wallet, with a
 * dropdown to change wallets or disconnect.
 *
 * Once a wallet is connected, the header shows a compact chip with the
 * wallet label + a truncated address. Opening the dropdown reveals the
 * demo-wallet picker (so a judge can switch profiles mid-flow without
 * restarting) and a disconnect action.
 *
 * The chip is emerald-accented for demo-mode wallets (clearly labelled)
 * and neutral for MetaMask, so the connection mode is obvious at a glance.
 */

import { useState } from 'react';
import { ChevronDown, LogOut, Wallet as WalletIcon, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMiraStore } from '@/lib/mira/store-client';
import { DEMO_BORROWERS } from '@/lib/mira/demo-borrowers';
import { shortenHash } from '@/lib/mira/explorer';

export function WalletSwitcher() {
  const { wallet, setWallet, runCreditCheck, resetFlow } = useMiraStore();
  const [open, setOpen] = useState(false);

  if (!wallet) return null;

  const isDemo = wallet.mode === 'demo';

  async function switchTo(address: string, label: string) {
    setOpen(false);
    setWallet({ address, mode: 'demo', label });
    await runCreditCheck();
  }

  function disconnect() {
    setOpen(false);
    resetFlow();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2.5"
          aria-label={`Connected wallet ${wallet.label ?? wallet.address}. Click to switch.`}
        >
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md',
              isDemo ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600',
            )}
          >
            {isDemo ? (
              <FlaskConical className="h-3.5 w-3.5" />
            ) : (
              <WalletIcon className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
            {wallet.label ?? shortenHash(wallet.address, 4, 3)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Connected via {isDemo ? 'demo wallet' : 'MetaMask'}
          <div className="mt-1 truncate font-mono text-[11px] text-foreground">
            {wallet.address}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Switch demo wallet
        </DropdownMenuLabel>
        {DEMO_BORROWERS.map((b) => {
          const active = b.address.toLowerCase() === wallet.address.toLowerCase();
          return (
            <DropdownMenuItem
              key={b.address}
              onClick={() => void switchTo(b.address, b.label)}
              className={cn(
                'flex items-center justify-between gap-2',
                active && 'bg-emerald-500/[0.06]',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{b.label}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {shortenHash(b.address, 5, 4)}
                </span>
              </span>
              {active && (
                <Badge variant="outline" className="border-emerald-500/40 text-[9px] text-emerald-600">
                  Active
                </Badge>
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
