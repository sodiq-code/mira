'use client';

/**
 * Connect Wallet screen.
 *
 * Lets a borrower connect via MetaMask (window.ethereum) or pick a preset
 * demo wallet. The demo wallets cover the four archetypal underwriting
 * profiles (seasoned, returning, fresh, prior-default) so a judge can
 * exercise the full decision surface without needing real Sepolia history.
 *
 * MetaMask connection requests eth_accounts; if the user rejects or no
 * injected provider exists, we fall back to the demo-wallet picker rather
 * than blocking the demo.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, FlaskConical, ArrowRight, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DEMO_BORROWERS } from '@/lib/mira/demo-borrowers';
import { useMiraStore } from '@/lib/mira/store-client';
import { shortenHash } from '@/lib/mira/explorer';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListeners?: (event: string) => void;
    };
  }
}

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
        <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/[0.04]">
          <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-emerald-500 transition-transform duration-300 group-hover:scale-x-100" />
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Connect with MetaMask</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            {error && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/[0.06] p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Demo wallets */}
        <Card className="relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-amber-500 transition-transform duration-300 group-hover:scale-x-100" />
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <FlaskConical className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Try a demo wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Preset profiles that exercise every decision path. Labelled as demo data throughout.
            </p>
            <ul className="space-y-1.5">
              {DEMO_BORROWERS.map((b) => (
                <li key={b.address}>
                  <button
                    type="button"
                    onClick={() => pickDemo(b.address, b.label)}
                    disabled={connecting}
                    className="group flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.label}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {shortenHash(b.address, 5, 4)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
