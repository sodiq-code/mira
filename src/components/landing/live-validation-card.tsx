"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";

interface StatusResponse {
  status: "verified" | "failed" | "pending" | "error";
  chainKey?: number;
  sepoliaTxHash?: string;
  sepoliaBlock?: number | null;
  headerNumber?: number | null;
  proofSource?: "hosted" | "raw";
  readonlyVerification?: boolean;
  onchainTxHash?: string | null;
  cc3BlockNumber?: number;
  explorerUrl?: string | null;
  sepoliaExplorerUrl?: string | null;
  verifiedAt?: string | null;
  fetchedAt?: string;
  message?: string;
}

/**
 * Live Attestcoin validation card.
 *
 * Fetches the latest validation result from /api/status on mount and renders
 * a compact summary: verification status, the Sepolia transaction that was last
 * proven, the CC3 block it was verified against, and the timestamp. Re-fetches
 * every 60s so a freshly-run `bun run worker:validate` shows up without a
 * manual refresh.
 *
 * This is purely a *display* of the Task 0 feasibility gate — it does not run
 * the protocol path itself, which keeps the page fast and the precompile free
 * of unnecessary calls.
 */
export function LiveValidationCard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: StatusResponse = await res.json();
        if (active) setData(json);
      } catch {
        if (active) setData({ status: "error", message: "Unable to reach status endpoint" });
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const config = getStatusConfig(data?.status);

  return (
    <motion.div
      className={`rounded-2xl border ${config.border} ${config.bg} p-6`}
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5">
            {config.spinner ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : data?.status === "verified" ? (
              <span className="relative flex h-5 w-5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <CheckCircle2 className="relative h-5 w-5 text-emerald-500" />
              </span>
            ) : (
              <AlertCircle className={`h-5 w-5 ${config.icon}`} />
            )}
          </span>
          <div>
            <p className="font-medium">{config.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{config.subtitle}</p>
          </div>
        </div>

        {data?.status === "verified" && (
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {data.explorerUrl && (
              <a
                href={data.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:text-foreground hover:border-border"
              >
                View on CC3
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {data.sepoliaTxHash && (
              <a
                href={data.sepoliaExplorerUrl ?? `https://sepolia.etherscan.io/tx/${data.sepoliaTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:text-foreground hover:border-border"
              >
                View on Etherscan
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {data?.status === "verified" && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/40 pt-5 text-xs sm:grid-cols-4">
          <Field label="Proof source" value={data.proofSource ?? "hosted"} mono />
          <Field label="CC3 block" value={data.cc3BlockNumber != null ? `#${data.cc3BlockNumber.toLocaleString()}` : "—"} mono />
          <Field label="Precompile" value="verifyAndEmitSingle" mono />
          <Field label="Status" value="confirmed" mono />
          <Field
            label="CC3 transaction"
            value={data.onchainTxHash ? shortenHash(data.onchainTxHash) : "—"}
            mono
            className="col-span-2"
          />
          <Field
            label="Sepolia tx proven"
            value={data.sepoliaTxHash ? shortenHash(data.sepoliaTxHash) : "—"}
            mono
            className="col-span-2"
          />
        </dl>
      )}

      {data?.status === "verified" && data.message && (
        <p className="mt-4 rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          {data.message}
        </p>
      )}

      {data?.status === "error" && data.message && (
        <p className="mt-4 text-xs text-destructive">{data.message}</p>
      )}
    </motion.div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</dt>
      <dd className={`mt-1 truncate text-foreground/90 ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function getStatusConfig(status?: StatusResponse["status"]) {
  switch (status) {
    case "verified":
      return {
        title: "Attestcoin verification live",
        subtitle: "A real Sepolia transaction was proven and accepted by the CC3 BlockProver precompile.",
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/[0.06]",
        icon: "text-emerald-500",
        spinner: false,
      };
    case "failed":
      return {
        title: "Last validation failed",
        subtitle: "Run `bun run worker:validate` to retry the end-to-end check.",
        border: "border-destructive/40",
        bg: "bg-destructive/[0.04]",
        icon: "text-destructive",
        spinner: false,
      };
    case "pending":
      return {
        title: "Querying CC3 Testnet…",
        subtitle: "Reading the on-chain verification state from the BlockProver precompile.",
        border: "border-border/70",
        bg: "bg-muted/40",
        icon: "text-muted-foreground",
        spinner: false,
      };
    case "error":
      return {
        title: "Status unavailable",
        subtitle: "Could not reach the CC3 Testnet RPC to check the verification state.",
        border: "border-border/70",
        bg: "bg-muted/40",
        icon: "text-muted-foreground",
        spinner: false,
      };
    default:
      return {
        title: "Checking validation status…",
        subtitle: "",
        border: "border-border/70",
        bg: "bg-muted/40",
        icon: "text-muted-foreground",
        spinner: true,
      };
  }
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}
