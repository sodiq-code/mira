'use client';

/**
 * Connect Wallet screen.
 *
 * Lets a borrower connect via MetaMask (window.ethereum) or pick a preset
 * demo wallet. The demo wallets cover the four archetypal underwriting
 * profiles (seasoned, returning, fresh, prior-default) so a judge can
 * exercise the full decision surface without needing real Sepolia history.
 *
 * The two cards are balanced: the MetaMask card carries a "what happens
 * next" preview so its visual weight matches the demo-wallet list, and
 * each demo wallet shows a one-line profile hint (approve / decline path)
 * so a judge can pick the right persona without guessing.
 *
 * MetaMask connection requests eth_accounts; if the user rejects or no
 * injected provider exists, we surface the error inline rather than
 * blocking the demo.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  FlaskConical,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Lock,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DEMO_BORROWERS, type DemoBorrower } from '@/lib/mira/demo-borrowers';
import { useMiraStore } from '@/lib/mira/store-client';
import { shortenHash } from '@/lib/mira/explorer';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListeners?: (event: string) => void;
    };
  }
}

// A short hint about the underwriting path each demo wallet exercises, so a
// judge can pick the right persona without guessing.
const PROFILE_HINT: Record<string, { tag: string; tone: 'emerald' | 'amber' | 'red' }> = {
  'Seasoned DeFi user': { tag: 'Approve', tone: 'emerald' },
  'Returning borrower': { tag: 'Approve', tone: 'emerald' },
  'Fresh wallet': { tag: 'Decline', tone: 'red' },
  'Prior default': { tag: 'Decline', tone: 'red' },
};

const NEXT_STEPS = [
  { icon: ShieldCheck, label: 'Verify', hint: 'Attestcoin proves your Sepolia activity' },
  { icon: Zap, label: 'Decide', hint: 'The agent decides in ~15s' },
  { icon: Lock, label: 'Originate', hint: 'Loan lands on Creditcoin' },
];

export function ConnectWallet() {
  const setWallet = useMiraStore((s) => s.setWallet);
  const runCreditCheck = useMiraStore((s) => s.runCreditCheck);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectMetaMask() {
    setError(null);
    setConnecting(true);
    try {
      if (!window.ethereum) {
        throw new Error(
          'No Ethereum provider detected. Install MetaMask, or use a demo wallet below.',
        );
      }
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error('No account returned by MetaMask');
      setWallet({ address, mode: 'metamask' });
      await runCreditCheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MetaMask connection failed');
    } finally {
      setConnecting(false);
    }
  }

  async function pickDemo(address: string, label: string) {
    setError(null);
    setConnecting(true);
    try {
      setWallet({ address, mode: 'demo', label });
      await runCreditCheck();
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <Badge
          variant="outline"
          className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600"
        >
          Step 1 — Connect
        </Badge>
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Connect a wallet to begin
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
          MIRA reads the wallet&apos;s verified Sepolia activity through Attestcoin. No paperwork,
          no off-chain identity — just a signed address.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* MetaMask */}
        <Card className="group relative flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/[0.04]">
          <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-emerald-500 transition-transform duration-300 group-hover:scale-x-100" />
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Connect with MetaMask</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Use your browser wallet. MIRA will read the connected address&apos;s verified
              activity.
            </p>
            <Button
              onClick={connectMetaMask}
              disabled={connecting}
              className="w-full"
              size="lg"
            >
              {connecting ? 'Connecting…' : 'Connect MetaMask'}
              {!connecting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>

            {error ? (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/[0.06] p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              /* What happens next — balances this card against the demo list */
              <div className="mt-auto rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  What happens next
                </p>
                <ul className="space-y-2">
                  {NEXT_STEPS.map((step) => (
                    <li key={step.label} className="flex items-center gap-2.5 text-xs">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                        <step.icon className="h-3 w-3" />
                      </span>
                      <span className="font-medium">{step.label}</span>
                      <span className="text-muted-foreground">— {step.hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Demo wallets */}
        <Card className="relative flex flex-col overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-amber-500 transition-transform duration-300 group-hover:scale-x-100" />
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <FlaskConical className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Try a demo wallet</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-3 text-sm text-muted-foreground">
              Preset profiles that exercise every decision path. Labelled as demo data throughout.
            </p>
            <ul className="space-y-1.5">
              {DEMO_BORROWERS.map((b) => (
                <li key={b.address}>
                  <DemoWalletRow borrower={b} disabled={connecting} onPick={pickDemo} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DemoWalletRow({
  borrower,
  disabled,
  onPick,
}: {
  borrower: DemoBorrower;
  disabled: boolean;
  onPick: (address: string, label: string) => void;
}) {
  const hint = PROFILE_HINT[borrower.label];
  const toneClass =
    hint?.tone === 'red'
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : hint?.tone === 'amber'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';

  return (
    <button
      type="button"
      onClick={() => onPick(borrower.address, borrower.label)}
      disabled={disabled}
      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="block text-sm font-medium">{borrower.label}</span>
          {hint && (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase',
                toneClass,
              )}
            >
              {hint.tag}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {shortenHash(borrower.address, 5, 4)}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
