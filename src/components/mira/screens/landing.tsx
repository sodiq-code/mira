'use client';

/**
 * Landing view for the MIRA app.
 *
 * This is the marketing entry — the existing polished landing (hero, how-it-
 * works, features, architecture, live validation) — with a prominent
 * &quot;Launch the agent&quot; CTA wired to the borrower flow. The borrower flow
 * lives behind the CTA so the landing stays clean for first-time visitors.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ShieldCheck,
  Zap,
  Wallet,
  LineChart,
  ArrowRight,
  Github,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { Reveal } from '@/components/landing/reveal';
import { ArchitectureDiagram } from '@/components/landing/architecture-diagram';
import { LiveValidationCard } from '@/components/landing/live-validation-card';
import { MiraWordmark } from '@/components/mira/ui/mira-mark';

const steps = [
  {
    n: '01',
    title: 'Connect',
    body: 'A borrower connects an Ethereum wallet. No paperwork, no off-chain identity — just a signed address.',
  },
  {
    n: '02',
    title: 'Verify',
    body: 'MIRA reads the wallet\'s Sepolia activity through Attestcoin and verifies every transaction against the Creditcoin BlockProver precompile. A borrower cannot claim activity they did not produce.',
  },
  {
    n: '03',
    title: 'Decide',
    body: 'A bounded AI proposes terms. The on-chain Policy independently validates them. Real ERC-20 tokens move from the liquidity pool to the borrower. The agent\'s reputation updates — and so does its lending authority.',
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: 'Decisions are cryptographically accountable',
    body: 'Every underwriting factor is backed by an Attestcoin inclusion proof. The AI sees evidence, not assertions. The Policy contract independently validates every decision — the LLM cannot approve a loan above the agent\'s authority or below the rate floor.',
  },
  {
    icon: Wallet,
    title: 'Capital is cryptographically accountable',
    body: 'The LiquidityPool holds real ERC-20 tokens. Origination moves them to the borrower; repayment moves them back. Every transaction is a real on-chain transfer — not a counter increment. The pool\'s available balance is a live read from the contract.',
  },
  {
    icon: LineChart,
    title: 'Reputation is cryptographically accountable',
    body: 'The agent\'s track record lives in an on-chain ledger it cannot tamper with. Every verified repayment raises its score — and its lending authority. A fresh agent can only lend $25; a proven agent (score 650+) earns $100. Five defaults auto-pause the agent.',
  },
  {
    icon: Zap,
    title: 'We don\'t trust the AI',
    body: 'Five adversarial attacks prove the system rejects malicious LLM output, fake proofs, wrong borrowers, expired evidence, and insufficient liquidity. The headline is literal: MIRA cannot approve a loan its own Policy contract does not independently validate.',
  },
];

const EXT_REL = 'noopener noreferrer';

export function Landing({
  onLaunch,
  onOpenReputation,
}: {
  onLaunch: () => void;
  onOpenReputation: () => void;
}) {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden" aria-labelledby="hero-title">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(55% 45% at 50% 0%, rgba(16,185,129,0.14), transparent 70%), radial-gradient(40% 30% at 85% 10%, rgba(16,185,129,0.06), transparent 60%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
            backgroundSize: '32px 32px',
            maskImage:
              'radial-gradient(ellipse 70% 50% at 50% 0%, black 40%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 50% at 50% 0%, black 40%, transparent 80%)',
          }}
          aria-hidden
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <Badge
                variant="outline"
                className="mb-6 border-emerald-500/40 bg-emerald-500/[0.04] text-emerald-600"
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Self-Accountable Credit Agent
              </Badge>
            </Reveal>
            <Reveal delay={0.05}>
              <h1
                id="hero-title"
                className="text-balance text-4xl font-bold tracking-tight sm:text-6xl"
              >
                What happens when an AI agent is given money to lend?
              </h1>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-xl font-medium text-emerald-600">
                You shouldn&apos;t trust the AI.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mx-auto mt-3 max-w-2xl text-pretty text-lg text-muted-foreground">
                You should trust the evidence, the policy, and the agent&apos;s track record.
                MIRA is an autonomous lender whose decisions, capital, and reputation are
                cryptographically accountable — on Creditcoin, verified by Attestcoin.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" onClick={onLaunch}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Launch the live demo
                </Button>
                <Button size="lg" variant="outline" onClick={onOpenReputation}>
                  View agent reputation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="ghost" asChild>
                  <Link
                    href="https://github.com/sodiq-code/mira"
                    target="_blank"
                    rel={EXT_REL}
                  >
                    <Github className="mr-2 h-4 w-4" />
                    View source
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60 py-24 sm:py-28" aria-labelledby="how-title">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                The flow
              </p>
              <h2 id="how-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                Evidence, policy, and reputation
              </h2>
              <p className="mt-3 text-muted-foreground">
                Three steps, one trust root — every decision is independently verifiable on-chain.
              </p>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <Card className="group relative h-full overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/[0.04]">
                  <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-emerald-500 transition-transform duration-300 group-hover:scale-x-100" />
                  <CardHeader>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 font-mono text-sm font-semibold text-emerald-600 transition-colors group-hover:bg-emerald-500 group-hover:text-emerald-950">
                      {s.n}
                    </span>
                    <CardTitle className="mt-4 text-xl">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        className="border-t border-border/60 bg-muted/30 py-24 sm:py-28"
        aria-labelledby="features-title"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                The properties
              </p>
              <h2 id="features-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                Decisions, capital, and reputation — all on-chain
              </h2>
              <p className="mt-3 text-muted-foreground">
                MIRA doesn&apos;t claim to be trustworthy. It earns the right to manage capital.
              </p>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 2) * 0.08}>
                <Card className="group h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/[0.04]">
                  <CardHeader>
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:bg-emerald-500/15">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{f.body}</CardDescription>
                  </CardHeader>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section
        id="architecture"
        className="border-t border-border/60 py-24 sm:py-28"
        aria-labelledby="arch-title"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <Reveal>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                  The system
                </p>
                <h2 id="arch-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Three components, one trust root
                </h2>
                <p className="mt-4 text-muted-foreground">
                  A Next.js frontend, a TypeScript worker, and Creditcoin smart contracts. The
                  worker is the only component that holds keys; the frontend never signs Creditcoin
                  transactions, and every factor it shows was verified by the BlockProver
                  precompile. The AI proposes — the Policy disposes.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Frontend</strong> — borrower flow and agent reputation dashboard.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Worker</strong> — Attestcoin proofs, bounded AI decisioning, loan
                      lifecycle.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Contracts</strong> — Policy, Loan, and reputation ledgers on CC3
                      Testnet.
                    </span>
                  </li>
                </ul>
                <Separator className="my-8" />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={onLaunch}>
                    Try the live demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" asChild>
                    <Link
                      href="https://docs.attestcoin.org"
                      target="_blank"
                      rel={EXT_REL}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      Read the docs
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <ArchitectureDiagram />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Live validation */}
      <section
        className="border-t border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 py-20 sm:py-24"
        aria-labelledby="status-title"
      >
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <Reveal>
            <div className="mb-8 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                Live
              </p>
              <h2 id="status-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                Verification status
              </h2>
              <p className="mt-3 text-muted-foreground">
                The Attestcoin read path is exercised against live CC3 Testnet. The card below
                reflects the most recent validation run.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <LiveValidationCard />
          </Reveal>
        </div>
      </section>

      {/* Footer wordmark is rendered by the shell; this section closes the landing */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6">
        <div className="flex items-center justify-center">
          <MiraWordmark />
        </div>
      </div>
    </>
  );
}
