import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Lightweight status endpoint that surfaces the latest Attestcoin validation
 * result. The validation script writes a JSON artifact to the local research/
 * directory after each run; this route reads it (if present) and returns a
 * trimmed summary so the frontend can display a real, live "last verified"
 * badge without re-running the protocol path on every page load.
 *
 * If no validation artifact exists yet, the route returns a "pending" status
 * rather than an error — the absence of a run is itself useful information.
 */

const VALIDATION_PATH = join(process.cwd(), "research", "attestcoin-validation.json");

interface ValidationArtifact {
  success: boolean;
  startedAt: string;
  finishedAt: string;
  chainKey: number;
  sepoliaTxHash: string;
  sepoliaBlock: number;
  headerNumber: number;
  proofSource: "hosted" | "raw";
  readonlyVerification: boolean;
  onchainTxHash?: string;
  cc3ExplorerTxUrl?: string;
}

export async function GET() {
  try {
    if (!existsSync(VALIDATION_PATH)) {
      return NextResponse.json({
        status: "pending",
        message: "No validation run yet. Run `bun run worker:validate` to populate.",
        timestamp: new Date().toISOString(),
      });
    }

    const raw = readFileSync(VALIDATION_PATH, "utf8");
    const data = JSON.parse(raw) as ValidationArtifact;

    return NextResponse.json({
      status: data.success ? "verified" : "failed",
      chainKey: data.chainKey,
      sepoliaTxHash: data.sepoliaTxHash,
      sepoliaBlock: data.sepoliaBlock,
      headerNumber: data.headerNumber,
      proofSource: data.proofSource,
      readonlyVerification: data.readonlyVerification,
      onchainTxHash: data.onchainTxHash ?? null,
      verifiedAt: data.finishedAt,
      explorerUrl: data.cc3ExplorerTxUrl ?? null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Failed to read validation artifact",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
