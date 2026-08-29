import type { MatchStanding, PrivatePlayerRoundState, RoundScore } from "@secret-rules/shared";
import { SCORING_CONFIG } from "./config.ts";

export function secretRuleSucceeded(state: PrivatePlayerRoundState) {
  if (state.secretRule.category === "private_knowledge") return false;
  if (state.secretRule.category === "hidden_ability") {
    return state.hiddenAbilities.length > 0 && state.hiddenAbilities.every((ability) => ability.usesRemaining === 0);
  }
  return state.privateProgress.status === "completed";
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

export function scoreRound(input: {
  roundNumber: number;
  assignments: ReadonlyMap<string, PrivatePlayerRoundState>;
  previousScores: ReadonlyMap<string, number>;
  publicChallengeSucceeded: boolean;
  wildBonusEligible: (templateId: string) => boolean;
}) {
  const nextScores = new Map(input.previousScores);
  const entries = [...input.assignments.values()].map((state) => {
    const success = secretRuleSucceeded(state);
    const secretRulePoints = success ? SCORING_CONFIG.secretRuleSuccess : 0;
    const difficultyBonusPoints = success ? SCORING_CONFIG.difficultyBonus[state.secretRule.difficulty] : 0;
    const wildBonusPoints = success && state.secretRule.rarity === "wild" && input.wildBonusEligible(state.secretRule.templateId)
      ? SCORING_CONFIG.eligibleWildBonus : 0;
    const publicChallengePoints = input.publicChallengeSucceeded ? SCORING_CONFIG.publicChallengeSuccess : 0;
    const roundTotal = secretRulePoints + difficultyBonusPoints + wildBonusPoints + publicChallengePoints;
    const matchTotal = (nextScores.get(state.playerId) ?? 0) + roundTotal;
    nextScores.set(state.playerId, matchTotal);
    return {
      playerId: state.playerId,
      secretRuleResult: state.secretRule.category === "private_knowledge" ? "information_only" as const : success ? "success" as const : "failed" as const,
      secretRulePoints, difficultyBonusPoints, wildBonusPoints, publicChallengePoints, roundTotal, matchTotal,
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
