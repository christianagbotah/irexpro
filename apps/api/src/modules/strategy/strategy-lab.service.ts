import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  STRATEGY_LAB_DATASET,
  STRATEGY_LAB_DATASET_SHA256,
  StrategyLabDatasetCandidate,
  StrategyLabDatasetScenario,
} from './datasets/strategy-lab.v1';
import {
  StrategyLabCandidateDto,
  StrategyLabConstraintResultDto,
  StrategyLabResponseDto,
  StrategyLabScorecardDto,
} from './dto/strategy-lab-response.dto';

const WEIGHTS = {
  expectedReturn: 0.25,
  profitFactor: 0.25,
  drawdownProtection: 0.25,
  stability: 0.15,
  winRate: 0.1,
} as const;

const CONSTRAINTS = {
  maxDrawdownPct: 12,
  minProfitFactor: 1.1,
  maxExposurePct: 35,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class StrategyLabService {
  constructor() {
    this.assertDatasetIntegrity();
  }

  getSnapshot(): StrategyLabResponseDto {
    return {
      dataset: {
        id: STRATEGY_LAB_DATASET.id,
        version: STRATEGY_LAB_DATASET.version,
        asOf: STRATEGY_LAB_DATASET.asOf,
        checksumSha256: `sha256:${STRATEGY_LAB_DATASET_SHA256}`,
        methodologyVersion: STRATEGY_LAB_DATASET.methodologyVersion,
      },
      methodology: {
        objective:
          'Rank deterministic historical strategy fixtures by return quality, drawdown protection, stability, and hard risk constraints.',
        weights: { ...WEIGHTS },
        constraints: { ...CONSTRAINTS },
      },
      scenarios: STRATEGY_LAB_DATASET.scenarios.map((scenario) =>
        this.scoreScenario(scenario),
      ),
      disclaimer:
        'Strategy Lab is a deterministic historical simulation surface for comparison and testing. It does not place trades, alter live risk limits, or predict future performance.',
    };
  }

  private assertDatasetIntegrity(): void {
    const actual = createHash('sha256')
      .update(JSON.stringify(STRATEGY_LAB_DATASET))
      .digest('hex');
    if (actual !== STRATEGY_LAB_DATASET_SHA256) {
      throw new Error('Strategy Lab dataset checksum mismatch');
    }
  }

  private scoreScenario(scenario: StrategyLabDatasetScenario) {
    const ranked = scenario.candidates
      .map((candidate) => this.scoreCandidate(candidate))
      .sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (a.score !== b.score) return b.score - a.score;
        return a.strategyCode.localeCompare(b.strategyCode);
      })
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    const recommended = ranked.find((candidate) => candidate.eligible) ?? ranked[0];
    const hasEligible = ranked.some((candidate) => candidate.eligible);

    return {
      id: scenario.id,
      name: scenario.name,
      marketRegime: scenario.marketRegime,
      volatility: scenario.volatility,
      description: scenario.description,
      recommendation: {
        strategyCode: recommended.strategyCode,
        summary: hasEligible
          ? `${recommended.name} ranks first after applying the ${STRATEGY_LAB_DATASET.methodologyVersion} scorecard and all hard constraints.`
          : `No candidate passed every hard constraint; ${recommended.name} is shown only as the highest-scoring comparison candidate.`,
      },
      candidates: ranked,
    };
  }

  private scoreCandidate(
    candidate: StrategyLabDatasetCandidate,
  ): Omit<StrategyLabCandidateDto, 'rank'> {
    const scorecard: StrategyLabScorecardDto = {
      expectedReturn: round1(clamp01(candidate.expectedReturnPct / 15) * 100),
      profitFactor: round1(clamp01((candidate.profitFactor - 0.8) / 1.2) * 100),
      drawdownProtection: round1(clamp01(1 - candidate.maxDrawdownPct / 20) * 100),
      stability: round1(clamp01(candidate.stability) * 100),
      winRate: round1(clamp01(candidate.winRate) * 100),
    };

    const constraints: StrategyLabConstraintResultDto[] = [
      {
        code: 'MAX_DRAWDOWN',
        label: 'Maximum drawdown',
        passed: candidate.maxDrawdownPct <= CONSTRAINTS.maxDrawdownPct,
        actual: candidate.maxDrawdownPct,
        limit: CONSTRAINTS.maxDrawdownPct,
      },
      {
        code: 'MIN_PROFIT_FACTOR',
        label: 'Minimum profit factor',
        passed: candidate.profitFactor >= CONSTRAINTS.minProfitFactor,
        actual: candidate.profitFactor,
        limit: CONSTRAINTS.minProfitFactor,
      },
      {
        code: 'MAX_EXPOSURE',
        label: 'Maximum exposure',
        passed: candidate.exposurePct <= CONSTRAINTS.maxExposurePct,
        actual: candidate.exposurePct,
        limit: CONSTRAINTS.maxExposurePct,
      },
    ];

    const score = round1(
      scorecard.expectedReturn * WEIGHTS.expectedReturn +
        scorecard.profitFactor * WEIGHTS.profitFactor +
        scorecard.drawdownProtection * WEIGHTS.drawdownProtection +
        scorecard.stability * WEIGHTS.stability +
        scorecard.winRate * WEIGHTS.winRate,
    );
    const failed = constraints.filter((constraint) => !constraint.passed);
    const strongest = Object.entries(scorecard).sort(([, a], [, b]) => b - a)[0][0];

    return {
      strategyCode: candidate.strategyCode,
      name: candidate.name,
      timeframe: candidate.timeframe,
      eligible: failed.length === 0,
      score,
      metrics: {
        expectedReturnPct: candidate.expectedReturnPct,
        maxDrawdownPct: candidate.maxDrawdownPct,
        winRate: candidate.winRate,
        profitFactor: candidate.profitFactor,
        stability: candidate.stability,
        exposurePct: candidate.exposurePct,
      },
      scorecard,
      constraints,
      rationale: [
        `Composite score ${score}/100 using fixed ${STRATEGY_LAB_DATASET.methodologyVersion} weights.`,
        `Strongest normalized component: ${strongest}.`,
        failed.length === 0
          ? 'All hard Strategy Lab constraints passed.'
          : `Hard constraint failures: ${failed.map((constraint) => constraint.label).join(', ')}.`,
      ],
      tradeoffs: this.describeTradeoffs(candidate),
    };
  }

  private describeTradeoffs(candidate: StrategyLabDatasetCandidate): string[] {
    const tradeoffs: string[] = [];
    if (candidate.expectedReturnPct >= 10) {
      tradeoffs.push('Higher modeled return potential increases sensitivity to regime changes.');
    }
    if (candidate.maxDrawdownPct >= 10) {
      tradeoffs.push('Drawdown is elevated relative to the lower-risk candidates in the fixture.');
    } else {
      tradeoffs.push('Lower modeled drawdown improves capital preservation in this scenario.');
    }
    if (candidate.winRate >= 0.6) {
      tradeoffs.push(
        'Higher win rate does not by itself guarantee the strongest risk-adjusted score.',
      );
    } else if (candidate.profitFactor >= 1.3) {
      tradeoffs.push(
        'Lower win frequency is offset by stronger aggregate payoff quality in the fixture.',
      );
    }
    return tradeoffs;
  }
}
