"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Wallet, Server, Database, ArrowDown, ArrowRight } from "lucide-react";

/**
 * A styled, color-coded architecture diagram that replaces the raw text mock.
 *
 * Three tiers stacked vertically: borrower wallet → MIRA worker → the two
 * ledgers it bridges (Creditcoin CC3 Testnet + Ethereum Sepolia). Each tier is
 * a labelled card with an icon; the connectors are animated dashes that imply
 * live data flow. On reduced-motion preferences the animation is dropped but
 * the diagram remains fully legible.
 */
export function ArchitectureDiagram() {
  const prefersReduced = useReducedMotion();

  const flowProps = prefersReduced
    ? {}
    : {
        initial: { opacity: 0.3 },
        whileInView: { opacity: 1 },
        viewport: { once: true },
        transition: { duration: 0.8, repeat: Infinity, repeatType: "reverse" as const },
      };

  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-background to-muted/40 p-6 sm:p-8">
      {/* Tier 1 — borrower */}
      <Tier
        label="Borrower wallet"
        sub="Ethereum Sepolia"
        icon={<Wallet className="h-5 w-5" />}
        tone="amber"
      />

      <Connector label="signed address" {...flowProps} />

      {/* Tier 2 — worker (the focus) */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-emerald-950">
            <Server className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">MIRA worker</p>
            <p className="text-xs text-muted-foreground">Node.js + TypeScript + @gluwa/usc-sdk</p>
          </div>
        </div>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li><span className="font-mono text-emerald-600">1</span> &nbsp;fetch verified Sepolia activity</li>
          <li><span className="font-mono text-emerald-600">2</span> &nbsp;generate Attestcoin inclusion proofs</li>
          <li><span className="font-mono text-emerald-600">3</span> &nbsp;verify via BlockProver precompile (CC3)</li>
          <li><span className="font-mono text-emerald-600">4</span> &nbsp;bounded AI decision → on-chain Policy check</li>
          <li><span className="font-mono text-emerald-600">5</span> &nbsp;originate loan + update reputation</li>
        </ol>
      </div>

      <Connector label="originate · update · writability" {...flowProps} />

      {/* Tier 3 — the two ledgers */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Ledger
          label="Creditcoin CC3 Testnet"
          sub="loans · reputation · policy"
          icon={<Database className="h-4 w-4" />}
          tone="emerald"
        />
        <Ledger
          label="Ethereum Sepolia"
          sub="verified activity · writability on default"
          icon={<Database className="h-4 w-4" />}
          tone="slate"
        />
      </div>
    </div>
  );
}

type Tone = "amber" | "emerald" | "slate";

const toneMap: Record<Tone, { ring: string; bg: string; fg: string }> = {
  amber: {
    ring: "border-amber-500/40",
    bg: "bg-amber-500/[0.06]",
    fg: "text-amber-600",
  },
  emerald: {
    ring: "border-emerald-500/40",
    bg: "bg-emerald-500/[0.06]",
    fg: "text-emerald-600",
  },
  slate: {
    ring: "border-slate-400/40",
    bg: "bg-slate-400/[0.06]",
    fg: "text-slate-600",
  },
};

function Tier({ label, sub, icon, tone }: { label: string; sub: string; icon: React.ReactNode; tone: Tone }) {
  const t = toneMap[tone];
  return (
    <div className={`rounded-xl border ${t.ring} ${t.bg} p-4`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-background ${t.fg}`}>
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function Ledger({ label, sub, icon, tone }: { label: string; sub: string; icon: React.ReactNode; tone: Tone }) {
  const t = toneMap[tone];
  return (
    <div className={`rounded-xl border ${t.ring} ${t.bg} p-4`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${t.fg}`}>{icon}</span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function Connector({ label, ...flowProps }: { label: string } & Record<string, unknown>) {
  return (
    <motion.div className="flex items-center justify-center py-2" {...flowProps}>
      <div className="flex flex-col items-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
        <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

// re-export for the horizontal variant used on wider screens if needed later
export { ArrowRight };
