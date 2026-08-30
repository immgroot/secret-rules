import type { MatchStanding, PrivatePlayerRoundState, RoundScore } from "@secret-rules/shared";
import { SCORING_CONFIG } from "./config.ts";

export type PlayerRoundLedger = { challengePoints: number; challengePenalties: number; targetPoints: number };

export function createRoundLedger(playerIds: readonly string[]) {
  return new Map(playerIds.map((playerId) => [playerId, { challengePoints: 0, challengePenalties: 0, targetPoints: 0 } satisfies PlayerRoundLedger]));
}

export function applyScoreDelta(scores: Map<string, number>, playerId: string, delta: number) {
  const next = Math.max(0, (scores.get(playerId) ?? 0) + delta);
  scores.set(playerId, next);
  return next;
}

export function rankedStandings(scores: ReadonlyMap<string, number>): MatchStanding[] {
  const ordered = [...scores].sort((left, right) => right[1] - left[1]);
  let previousScore: number | null = null;
  let previousRank = 0;
  return ordered.map(([playerId, score], index) => {
    const rank = score === previousScore ? previousRank : index + 1;
    previousScore = score;
    previousRank = rank;
    return { rank, playerId, score };
  });
}

export function scoreButtonV2Round(input: {
  roundNumber: number;
  assignments: ReadonlyMap<string, PrivatePlayerRoundState>;
  liveScores: ReadonlyMap<string, number>;
  ledgers: ReadonlyMap<string, PlayerRoundLedger>;
  publicChallengeSucceeded: boolean;
}) {
  const nextScores = new Map(input.liveScores);
  const entries = [...input.assignments.values()].map((state) => {
    const success = state.privateProgress.status === "completed";
    const secretDifficulty = state.secretRule.difficulty === "hard" ? "hard" as const : "standard" as const;
    const secretPoints = success ? secretDifficulty === "hard" ? SCORING_CONFIG.hardSecret : SCORING_CONFIG.standardSecret : 0;
    applyScoreDelta(nextScores, state.playerId, secretPoints);
    const ledger = input.ledgers.get(state.playerId) ?? { challengePoints: 0, challengePenalties: 0, targetPoints: 0 };
    return {
      playerId: state.playerId, secretRuleResult: success ? "success" as const : "failed" as const, secretDifficulty,
      challengePoints: ledger.challengePoints, challengePenalties: ledger.challengePenalties, targetPoints: ledger.targetPoints,
      secretPoints, roundTotal: ledger.challengePoints - ledger.challengePenalties + ledger.targetPoints + secretPoints,
      matchTotal: nextScores.get(state.playerId) ?? 0,
    };
  });
  const roundScore: RoundScore = {
    roundNumber: input.roundNumber,
    publicChallengeSucceeded: input.publicChallengeSucceeded,
    entries,
    standings: rankedStandings(nextScores),
  };
  return { nextScores, roundScore };
}

export function winners(standings: readonly MatchStanding[]) {
  const winningScore = standings[0]?.score;
  return winningScore === undefined ? [] : standings.filter((standing) => standing.score === winningScore).map((standing) => standing.playerId);
}
