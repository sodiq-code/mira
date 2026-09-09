import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, Zap, Wallet, LineChart, ArrowRight, Github, BookOpen } from "lucide-react";

const steps = [
  {
    n: "01",
    title: "Connect",
    body: "A borrower connects an Ethereum wallet. No paperwork, no off-chain identity — just a signed address.",
  },
  {
    n: "02",
    title: "Verify",
    body: "MIRA reads the wallet's Sepolia activity through Attestcoin and verifies every transaction against the Creditcoin BlockProver precompile.",
  },
  {
    n: "03",
    title: "Decide",
    body: "A bounded AI decision is validated against on-chain Policy, the loan is originated on Creditcoin, and the agent's reputation updates.",
  },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Cryptographically verified",
    body: "Every underwriting factor is backed by an Attestcoin inclusion proof. A borrower cannot claim activity they did not produce.",
  },
  {
    icon: LineChart,
    title: "Unfakeable reputation",
    body: "The agent's track record lives in an on-chain ledger. Every loan, repayment, and default updates a score the agent cannot tamper with.",
  },
  {
    icon: Zap,
    title: "One-block decisions",
    body: "Verification settles in a single synchronous Creditcoin block (~15s). The borrower sees a decision before the page reloads.",
  },
  {
    icon: Wallet,
    title: "Both directions",
    body: "MIRA reads Sepolia state via Attestcoin and triggers Creditcoin-initiated actions on default — the deeper half of the protocol.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-bold text-emerald-950">
              M
            </div>
            <span className="text-lg font-semibold tracking-tight">MIRA</span>
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">
              Creditcoin CC3 Testnet
            </Badge>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href="#how">How it works</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="#architecture">Architecture</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="https://docs.attestcoin.org" target="_blank" rel="noreferrer">
                <BookOpen className="mr-1.5 h-4 w-4" />
                Docs
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-60"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.12), transparent 70%)",
            }}
          />
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-5 border-emerald-500/40 text-emerald-500">
                Autonomous Verifiable Credit Agent
              </Badge>
              <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
                Credit decisions a borrower{" "}
                <span className="text-emerald-500">cannot fake</span>, and an agent{" "}
                <span className="text-emerald-500">cannot forget</span>.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
                MIRA reads a borrower&apos;s verified Ethereum history through the Attestcoin
                Protocol, decides a loan in one Creditcoin block, disburses it on-chain, and
                proves the decision was right by tracking repayments that update the agent&apos;s
                own reputation ledger.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" asChild>
                  <Link href="#how">
                    See how it works
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="https://github.com/sodiq-code/mira" target="_blank" rel="noreferrer">
                    <Github className="mr-2 h-4 w-4" />
                    View source
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Three steps, one screen
              </h2>
              <p className="mt-3 text-muted-foreground">
                From wallet connection to an on-chain loan in roughly fifteen seconds.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((s) => (
                <Card key={s.n} className="relative overflow-hidden">
                  <CardHeader>
                    <span className="text-sm font-mono text-emerald-500">{s.n}</span>
                    <CardTitle className="mt-1 text-xl">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{s.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Built on verification, not assertion
              </h2>
              <p className="mt-3 text-muted-foreground">
                The properties that make MIRA&apos;s credit decisions trustworthy.
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {features.map((f) => (
                <Card key={f.title} className="h-full">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                    <CardDescription className="text-sm">{f.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="border-t border-border/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Three components, one trust root
                </h2>
                <p className="mt-4 text-muted-foreground">
                  A Next.js frontend, a TypeScript worker, and Creditcoin smart contracts. The
                  worker is the only component that holds keys; the frontend never signs Creditcoin
                  transactions, and every factor it shows was verified by the BlockProver
                  precompile.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Frontend</strong> — borrower flow and agent reputation dashboard.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Worker</strong> — Attestcoin proofs, bounded AI decisioning, loan
                      lifecycle.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>
                      <strong>Contracts</strong> — Policy, Loan, and reputation ledgers on CC3
                      Testnet.
                    </span>
                  </li>
                </ul>
                <Separator className="my-8" />
                <Button variant="outline" asChild>
                  <Link href="https://github.com/sodiq-code/mira" target="_blank" rel="noreferrer">
                    Read the architecture docs
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-muted-foreground">
                    system overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
{`Borrower wallet (Ethereum Sepolia)
      │
      ▼
┌────────────────────────────────────────────────────┐
│  MIRA worker (Node.js + TypeScript)                │
│                                                    │
│  1. fetch verified Sepolia activity                │
│  2. generate Attestcoin inclusion proofs           │
│  3. verify via BlockProver precompile (CC3)        │
│  4. bounded AI decision → on-chain Policy check    │
│  5. originate loan + update reputation             │
└────────────────────────────────────────────────────┘
      │                                  │
      ▼                                  ▼
 Creditcoin CC3 Testnet          Ethereum Sepolia
 (loans · reputation · policy)   (verified activity ·
                                  writability on default)`}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Status */}
        <section className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <Card>
              <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                  <div>
                    <p className="font-medium">Attestcoin integration ready</p>
                    <p className="text-sm text-muted-foreground">
                      Proof generation and BlockProver verification are wired against live CC3
                      Testnet. Run the end-to-end check with{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        bun run worker:validate
                      </code>
                      .
                    </p>
                  </div>
                </div>
                <Button variant="outline" asChild>
                  <Link href="https://github.com/sodiq-code/mira" target="_blank" rel="noreferrer">
                    <Github className="mr-2 h-4 w-4" />
                    Repository
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-emerald-950">
              M
            </div>
            <span>MIRA — Autonomous Verifiable Credit Agent</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="https://docs.attestcoin.org" target="_blank" rel="noreferrer" className="hover:text-foreground">
              Attestcoin
            </Link>
            <Link href="https://creditcoin.org" target="_blank" rel="noreferrer" className="hover:text-foreground">
              Creditcoin
            </Link>
            <span className="text-muted-foreground/60">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
