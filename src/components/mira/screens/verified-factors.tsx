'use client';

/**
 * Verified Credit Factors screen.
 *
 * Shows the Attestcoin-verified feature vector: wallet age, 90-day tx
 * count, 90-day stablecoin volume, DeFi position count, and prior MIRA
 * history. Every factor carries a clickable proof tx hash that opens in the
 * CC3 Testnet explorer, and clicking a factor card opens a proof detail
 * dialog with the full Merkle + continuity proof structure.
 *
 * If the wallet did not verify (insufficient activity), the screen shows a
 * clear decline notice and a path back to try another wallet — MIRA never
 * invents factors.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  Activity,
  Coins,
  Layers,
  History,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { VerificationSourceBadge } from '@/components/mira/ui/verification-source-badge';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { ProofDetailDialog } from '@/components/mira/ui/proof-detail-dialog';
import { useMiraStore } from '@/lib/mira/store-client';
import { cc3TxUrl, sepoliaTxUrl } from '@/lib/mira/explorer';
import type { DemoProof } from '@/lib/mira/proofs';

export function VerifiedFactors() {
  const { wallet, credit, creditLoading, creditError, proofs, setView, resetFlow } =
    useMiraStore();
  const [activeProof, setActiveProof] = useState<DemoProof | null>(null);

  if (creditLoading || (!credit && !creditError)) {
    return <FactorsSkeleton />;
  }

  if (creditError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <Card className="border-destructive/40 bg-destructive/[0.03]">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Credit check failed</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{creditError}</p>
            <Button variant="outline" onClick={resetFlow}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try another wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!credit) return null;

  const factors = credit.factors;
  const factorRows = [
    {
      icon: CalendarClock,
      label: 'Wallet age',
      value: `${factors.walletAgeDays} days`,
      hint: 'Since first verified Sepolia tx',
    },
    {
      icon: Activity,
      label: '90-day transactions',
      value: factors.txCount90d.toLocaleString(),
      hint: 'Verified Sepolia transactions',
    },
    {
      icon: Coins,
      label: '90-day stablecoin volume',
      value: `$${factors.stablecoinVolume90d.toLocaleString()}`,
      hint: 'USDC / USDT / DAI flow',
    },
    {
      icon: Layers,
      label: 'DeFi positions',
      value: factors.defiPositionCount.toLocaleString(),
      hint: 'Distinct contracts touched',
    },
  ];

  const priorHistory =
    factors.priorMiraLoans > 0 || factors.priorMiraRepaid > 0 || factors.priorMiraDefaulted > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Badge
          variant="outline"
          className="mb-4 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600"
        >
          Step 2 — Verified factors
        </Badge>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Your on-chain activity is your credit
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Every factor below was read from Sepolia and verified by the Creditcoin BlockProver
              precompile. A borrower cannot claim activity they did not produce.
            </p>
          </div>
          <VerificationSourceBadge
            source={credit.verificationSource}
            demoMode={credit.demoMode}
            scannedTxCount={credit.scannedTxCount}
            verifiedTxCount={credit.verifiedTxCount}
            className="shrink-0"
          />
        </div>

        {credit.verificationSource === 'fallback' && credit.fallbackReason && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div className="text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Real verification unavailable — showing demo data.</span>{' '}
              The live Attestcoin credit check could not complete ({credit.fallbackReason}). The
              factors below are synthetic and labeled as such. Connect the verified Sepolia demo
              wallet, or try again later, for real verified data.
            </div>
          </div>
        )}

        {credit.verificationSource === 'attestcoin' &&
          typeof credit.verifiedTxCount === 'number' &&
          typeof credit.scannedTxCount === 'number' && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">
                  {credit.verifiedTxCount} of {credit.scannedTxCount} Sepolia transactions
                </span>{' '}
                passed Attestcoin inclusion-proof verification via the BlockProver precompile.
              </span>
            </div>
          )}
      </motion.div>

      {credit.demoMode && (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">Demo mode.</strong> Synthetic data stands in for live
            Sepolia reads so the flow is reliable. Real and simulated data are never blurred. Run{' '}
            <code className="rounded bg-amber-500/10 px-1 font-mono">
              bun run worker:validate
            </code>{' '}
            for the live read path.
          </span>
        </div>
      )}

      {/* Factors grid — equal-height cards, click to open proof detail */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {factorRows.map((row, i) => {
          const proof = proofs[i];
          return (
            <motion.div
              key={row.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <Card
                role={proof ? 'button' : undefined}
                tabIndex={proof ? 0 : undefined}
                onClick={proof ? () => setActiveProof(proof) : undefined}
                onKeyDown={
                  proof
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveProof(proof);
                        }
                      }
                    : undefined
                }
                className={`group flex h-full flex-col transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md ${
                  proof ? 'cursor-pointer' : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-transform group-hover:scale-110">
                      <row.icon className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-1">
                      <VerifiedBadge />
                      {proof && (
                        <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          <Info className="inline h-3 w-3" /> details
                        </span>
                      )}
                    </div>
                  </div>
                  <CardTitle className="mt-3 font-mono text-2xl tracking-tight">
                    {row.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="mt-auto flex flex-1 flex-col">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>
                  {proof && (
                    <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-xs">
                      <TxHash
                        hash={proof.sepoliaTxHash}
                        href={sepoliaTxUrl(proof.sepoliaTxHash)}
                        label="Sepolia"
                        copyable={false}
                      />
                      <TxHash
                        hash={proof.cc3VerificationTxHash}
                        href={cc3TxUrl(proof.cc3VerificationTxHash)}
                        label="CC3 verify"
                        copyable={false}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Prior MIRA history */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Prior MIRA history</CardTitle>
            {priorHistory && <VerifiedBadge className="ml-auto" />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mx-auto grid max-w-md grid-cols-3 gap-4 text-center">
            <Stat label="Prior loans" value={factors.priorMiraLoans} />
            <Stat label="Repaid" value={factors.priorMiraRepaid} accent="emerald" />
            <Stat label="Defaulted" value={factors.priorMiraDefaulted} accent="red" />
          </div>
          {!priorHistory && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              No prior MIRA loans — this is a first-time borrower.
            </p>
          )}
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* Verdict + CTA */}
      {!credit.verified ? (
        <Card className="border-destructive/40 bg-destructive/[0.03]">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Insufficient verified activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              This wallet does not meet MIRA&apos;s minimum underwriting thresholds (30 days age,
              $1,000 stablecoin volume). MIRA declines rather than invent factors.
            </p>
            <Button variant="outline" onClick={resetFlow}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try another wallet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              Connected as{' '}
              <span className="font-mono text-foreground">
                {wallet?.address.slice(0, 8)}…{wallet?.address.slice(-4)}
              </span>
              {credit.demoMode
                ? ` via demo profile.`
                : ` — real Attestcoin-verified Sepolia wallet.`}
            </span>
          </div>
          <Button size="lg" onClick={() => setView('apply')}>
            Apply for a loan
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      <ProofDetailDialog
        proof={activeProof}
        open={!!activeProof}
        onOpenChange={(o) => !o && setActiveProof(null)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'red';
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'red' && value > 0
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div>
      <div className={`font-mono text-xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FactorsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-4 h-10 w-3/4" />
      <Skeleton className="mt-3 h-4 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="mt-3 h-8 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
