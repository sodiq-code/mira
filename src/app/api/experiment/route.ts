/**
 * GET /api/experiment
 *
 * Runs the AI measurability experiment: compares three underwriting
 * strategies (collateral-only, static-score, MIRA AI) on a set of test
 * borrowers and returns the comparison results.
 *
 * This proves the AI isn't just a gimmick — it makes measurably better
 * capital-allocation decisions than simpler rules.
 */

import { NextResponse } from 'next/server';
import { runExperiment, type StrategyResult } from '@/lib/mira/experiment';

export async function GET() {
  try {
    const results = await runExperiment();
    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Experiment failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
