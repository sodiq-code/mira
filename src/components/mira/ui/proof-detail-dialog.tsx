'use client';

/**
 * Proof detail dialog.
 *
 * Clicking a verified factor card opens this dialog to show the full
 * Attestcoin proof artifact: the Sepolia transaction that was proven, the
 * CC3 verification transaction, the block height, and the (truncated) Merkle
 * + continuity proof hex. This is the "show your work" surface — a judge can
 * inspect exactly what was verified, on which block, and through which
 * proof structure.
 */

import { motion } from 'framer-motion';
import { ShieldCheck, ArrowUpRight, FileSignature, Boxes } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TxHash } from '@/components/mira/ui/tx-hash';
import { VerifiedBadge } from '@/components/mira/ui/verified-badge';
import { cc3TxUrl, sepoliaTxUrl, cc3BlockUrl } from '@/lib/mira/explorer';
import type { DemoProof } from '@/lib/mira/proofs';

export function ProofDetailDialog({
  proof,
  open,
  onOpenChange,
}: {
  proof: DemoProof | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <DialogTitle className="text-base">Attestcoin proof</DialogTitle>
            <VerifiedBadge className="ml-auto" />
          </div>
          <DialogDescription>
            {proof
              ? `The verified factor "${proof.label}" was backed by an Attestcoin inclusion proof and accepted by the Creditcoin BlockProver precompile.`
              : 'Select a verified factor to inspect its proof.'}
          </DialogDescription>
        </DialogHeader>

        {proof && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Factor + verification result */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{proof.label}</span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                  Verified
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Verified at Creditcoin block{' '}
                <a
                  href={cc3BlockUrl(proof.verifiedAtBlock)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-mono text-foreground hover:underline"
                >
                  #{proof.verifiedAtBlock.toLocaleString()}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </p>
            </div>

            <Separator />

            {/* Transaction trail */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transaction trail
              </h4>

              <ProofRow
                icon={FileSignature}
                title="Source transaction (Sepolia)"
                hint="The borrower activity that was proven"
              >
                <TxHash hash={proof.sepoliaTxHash} href={sepoliaTxUrl(proof.sepoliaTxHash)} />
              </ProofRow>

              <ProofRow
                icon={Boxes}
                title="Verification transaction (CC3 Testnet)"
                hint="The BlockProver precompile call that verified the proof"
              >
                <TxHash
                  hash={proof.cc3VerificationTxHash}
                  href={cc3TxUrl(proof.cc3VerificationTxHash)}
                />
              </ProofRow>
            </div>

            <Separator />

            {/* Proof structure */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proof structure
              </h4>

              <ProofField label="Merkle inclusion proof" value={proof.merkleProof} />
              <ProofField label="Continuity proof" value={proof.continuityProof} />

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The Merkle proof establishes that the Sepolia transaction is included in the
                attested block; the continuity proof establishes that the block is part of the
                attested chain. The Creditcoin precompile verifies both before accepting the
                factor as trustworthy.
              </p>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProofRow({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof FileSignature;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mb-1 text-xs text-muted-foreground">{hint}</p>
        {children}
      </div>
    </div>
  );
}

function ProofField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <code className="block max-h-20 overflow-y-auto rounded-md border border-border/60 bg-background p-2 font-mono text-[11px] leading-relaxed break-all">
        {value}
      </code>
    </div>
  );
}
