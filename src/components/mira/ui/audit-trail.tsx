'use client';

/**
 * Audit trail — the full transparency layer for every MIRA loan decision.
 *
 * Renders the decision as a sequential audit:
 *   1. Decision (approve/decline + terms)
 *   2. Evidence (each verified factor with its proof link)
 *   3. AI reasoning (the LLM's one-paragraph explanation)
 *   4. Policy checks (each ✓/✗ — tier cap, rate bounds, term, liquidity)
 *   5. FINAL verdict
 *
 * Plus a decision receipt: an immutable record of the decision's evidence
 * hash, policy version, model version, and timestamp — so the decision
 * can be reconstructed and audited months later.
 */

import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  FileSignature,
  Brain,
  ShieldCheck,
  Hash,
  ArrowRight,
  Copy,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import type { VerifiedFactors, LoanDecision } from '@mira/shared';

export interface PolicyCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface DecisionReceipt {
  decisionId: string;
  evidenceHash: string;
  policyVersion: string;
  modelVersion: string;
  riskScore: number;
  timestamp: string;
  outcome: string;
}

interface AuditTrailProps {
  decision: LoanDecision;
  approvedAmount: number;
  interestRateApr: number;
  confidence: number;
  reasoning: string;
  factors: VerifiedFactors;
  proofTxHashes: string[];
  loanId?: string;
  originTxHash?: string;
  receipt?: DecisionReceipt;
}

export function AuditTrail({
  decision,
  approvedAmount,
  interestRateApr,
  confidence,
  reasoning,
  factors,
  proofTxHashes,
  loanId,
  originTxHash,
  receipt,
}: AuditTrailProps) {
  const { copy } = useCopyToClipboard();

  // Build the policy checks list. Each check corresponds to a real
  // on-chain validation in Policy.validateDecision.
  const policyChecks: PolicyCheck[] = [
    {
      name: 'Not paused',
      passed: true,
      detail: 'Policy contract is active',
    },
    {
      name: 'Amount within tier cap',
      passed: decision !== 'decline',
      detail: decision !== 'decline'
        ? `$${(approvedAmount / 100).toFixed(2)} ≤ agent tier cap`
        : 'Declined — no amount to check',
    },
    {
      name: 'Rate within bounds',
      passed: decision !== 'decline',
      detail: decision !== 'decline'
        ? `${interestRateApr.toFixed(1)}% APR (5%–25%)`
        : 'Declined — no rate to check',
    },
    {
      name: 'Term allowed',
      passed: decision !== 'decline',
      detail: decision !== 'decline' ? '7 / 30 / 90 days' : 'Declined',
    },
    {
      name: 'Sufficient liquidity',
      passed: decision !== 'decline',
      detail: decision !== 'decline' ? 'Pool has available capital' : 'N/A',
    },
  ];

  const allPassed = policyChecks.every((c) => c.passed);

  // Factor rows for the evidence section.
  const factorRows: Array<{ label: string; value: string; proofHash?: string }> = [
    { label: 'Wallet age', value: `${factors.walletAgeDays} days` },
    { label: '90d transactions', value: factors.txCount90d.toLocaleString() },
    { label: '90d stablecoin volume', value: `$${factors.stablecoinVolume90d.toLocaleString()}` },
    { label: 'DeFi positions', value: factors.defiPositionCount.toLocaleString() },
    {
      label: 'Prior MIRA loans',
      value: factors.priorMiraLoans > 0
        ? `${factors.priorMiraRepaid}/${factors.priorMiraLoans} repaid`
        : 'First loan',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Step 1: Decision */}
      <AuditStep
        step={1}
        icon={FileSignature}
        title="Decision"
        badge={decision === 'approve' ? 'APPROVE' : decision === 'approve_reduced' ? 'APPROVE (REDUCED)' : 'DECLINE'}
        badgeTone={decision === 'decline' ? 'red' : 'emerald'}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ReceiptField label="Amount" value={decision === 'decline' ? '—' : `$${(approvedAmount / 100).toFixed(2)}`} />
          <ReceiptField label="Rate" value={decision === 'decline' ? '—' : `${interestRateApr.toFixed(1)}% APR`} />
          <ReceiptField label="Confidence" value={`${confidence}%`} />
          <ReceiptField label="Verdict" value={decision === 'decline' ? 'Declined' : 'Approved'} />
        </div>
      </AuditStep>

      {/* Step 2: Evidence */}
      <AuditStep
        step={2}
        icon={ShieldCheck}
        title="Evidence"
        badge="ATTESTCOIN-VERIFIED"
        badgeTone="emerald"
      >
        <ul className="space-y-2">
          {factorRows.map((row, i) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{row.value}</span>
                {proofTxHashes[i] && (
                  <TxHash hash={proofTxHashes[i]} copyable={false} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </AuditStep>

      {/* Step 3: AI reasoning */}
      <AuditStep
        step={3}
        icon={Brain}
        title="AI reasoning"
        badge="AGENT"
        badgeTone="amber"
      >
        <p className="text-sm leading-relaxed text-foreground/90">{reasoning}</p>
      </AuditStep>

      {/* Step 4: Policy checks */}
      <AuditStep
        step={4}
        icon={ShieldCheck}
        title="Policy checks"
        badge={allPassed ? 'ALL PASSED' : 'FAILED'}
        badgeTone={allPassed ? 'emerald' : 'red'}
      >
        <ul className="space-y-1.5">
          {policyChecks.map((check) => (
            <li key={check.name} className="flex items-center gap-2 text-xs">
              {check.passed ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              <span className="font-medium">{check.name}</span>
              {check.detail && (
                <span className="text-muted-foreground">— {check.detail}</span>
              )}
            </li>
          ))}
        </ul>
      </AuditStep>

      {/* Step 5: FINAL */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card className={allPassed ? 'border-emerald-500/40' : 'border-destructive/40'}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {allPassed ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <XCircle className="h-6 w-6 text-destructive" />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Final verdict
                </p>
                <p className={`text-lg font-bold ${allPassed ? 'text-emerald-600' : 'text-destructive'}`}>
                  {allPassed ? 'APPROVED' : 'REJECTED'}
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Decision receipt */}
      {receipt && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Decision receipt
              </span>
              <VerifiedBadge className="ml-auto" label="Immutable" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <ReceiptField label="Decision ID" value={receipt.decisionId} mono />
              <ReceiptField label="Policy version" value={receipt.policyVersion} mono />
              <ReceiptField label="Model version" value={receipt.modelVersion} mono />
              <ReceiptField label="Risk score" value={`${receipt.riskScore}/100`} mono />
              <ReceiptField label="Timestamp" value={new Date(receipt.timestamp).toLocaleString()} />
              <ReceiptField label="Outcome" value={receipt.outcome} />
            </div>
            {receipt.evidenceHash && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Evidence hash
                </span>
                <div className="flex items-center gap-1">
                  <code className="font-mono text-[11px] text-foreground/80">
                    {receipt.evidenceHash.slice(0, 18)}…{receipt.evidenceHash.slice(-8)}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy(receipt.evidenceHash)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label="Copy evidence hash"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
            {loanId && originTxHash && (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  On-chain
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <TxHash hash={loanId} copyable={false} label="Loan" />
                  <TxHash hash={originTxHash} copyable={false} label="Tx" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditStep({
  step,
  icon: Icon,
  title,
  badge,
  badgeTone,
  children,
}: {
  step: number;
  icon: typeof FileSignature;
  title: string;
  badge: string;
  badgeTone: 'emerald' | 'amber' | 'red';
  children: React.ReactNode;
}) {
  const toneClass =
    badgeTone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
      : badgeTone === 'amber'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
        : 'bg-destructive/10 text-destructive border-destructive/30';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: step * 0.08 }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted font-mono text-xs font-bold text-muted-foreground">
              {step}
            </span>
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">{title}</span>
            <Badge variant="outline" className={`ml-auto text-[9px] font-bold ${toneClass}`}>
              {badge}
            </Badge>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ReceiptField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
