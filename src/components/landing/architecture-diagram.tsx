"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Wallet,
  Server,
  Database,
  ArrowDown,
  ArrowRight,
  ShieldCheck,
  Coins,
  TrendingUp,
  RotateCcw,
} from "lucide-react";

/**
 * Architecture diagram — the self-accountable credit loop.
 *
 * Shows the complete flow: borrower wallet → Attestcoin verification →
 * AI decision → Policy validation → real ERC-20 token transfer →
 * repayment/default → reputation update → capital authority change →
 * affects next loan.
 *
 * The feedback loop (bottom → top) is the visual that tells the whole
 * story: "MIRA earns the right to manage capital."
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
    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-background to-muted/40 p-5 sm:p-7">
      {/* Linear flow (top → bottom) */}
      <Tier
        label="Borrower wallet"
        sub="Ethereum Sepolia · real financial activity"
        icon={<Wallet className="h-5 w-5" />}
        tone="amber"
      />

      <Connector label="Attestcoin proof" {...flowProps} />

      {/* Worker — the AI + Policy gate */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-emerald-950">
            <Server className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">MIRA worker</p>
            <p className="text-xs text-muted-foreground">The AI proposes — the Policy disposes</p>
          </div>
        </div>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li><span className="font-mono text-emerald-600">1</span> &nbsp;fetch + verify Sepolia activity via Attestcoin</li>
          <li><span className="font-mono text-emerald-600">2</span> &nbsp;bounded AI proposes loan terms</li>
          <li><span className="font-mono text-emerald-600">3</span> &nbsp;on-chain Policy independently validates</li>
          <li><span className="font-mono text-emerald-600">4</span> &nbsp;originate: real ERC-20 tokens move</li>
        </ol>
      </div>

      <Connector label="originate · real token transfer" {...flowProps} />

      {/* Three accountability pillars */}
      <div className="grid gap-2 sm:grid-cols-3">
        <PillarCard
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Decisions"
          sub="Policy validates"
          tone="emerald"
        />
        <PillarCard
          icon={<Coins className="h-3.5 w-3.5" />}
          label="Capital"
          sub="ERC-20 custody"
          tone="emerald"
        />
        <PillarCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Reputation"
          sub="On-chain ledger"
          tone="emerald"
        />
      </div>

      <Connector label="repay / default" {...flowProps} />

      {/* Feedback loop — the killer visual */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-amber-950">
            <RotateCcw className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Reputation → Capital authority
            </p>
            <p className="text-xs text-muted-foreground">
              Repayment raises the score → higher lending authority. Default lowers it → less capital. 5 defaults → auto-pause.
            </p>
          </div>
        </div>
        {/* The loop arrow */}
        <div className="mt-3 flex items-center justify-center">
          <motion.div
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-600"
            {...flowProps}
          >
            <ArrowDown className="h-3 w-3" />
            <span>feedback loop: the agent earns and loses the right to lend</span>
            <ArrowDown className="h-3 w-3" />
          </motion.div>
        </div>
      </div>

      {/* The two ledgers at the bottom */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Ledger
          label="Creditcoin CC3 Testnet"
          sub="Policy · Loan · AgentReputation · LiquidityPool"
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
    <div className={`rounded-xl border ${t.ring} ${t.bg} p-3`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 ${t.fg}`}>{icon}</span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function PillarCard({ icon, label, sub, tone }: { icon: React.ReactNode; label: string; sub: string; tone: Tone }) {
  const t = toneMap[tone];
  return (
    <div className={`rounded-lg border ${t.ring} ${t.bg} p-2.5 text-center`}>
      <div className={`flex justify-center ${t.fg}`}>{icon}</div>
      <p className="mt-1 text-xs font-semibold">{label}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Connector({ label, ...flowProps }: { label: string } & Record<string, unknown>) {
  return (
    <motion.div className="flex items-center justify-center py-1.5" {...flowProps}>
      <div className="flex flex-col items-center">
        <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
    </motion.div>
  );
}

export { ArrowRight };
