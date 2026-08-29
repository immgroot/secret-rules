import type { RuleDifficulty } from "@secret-rules/shared";

export const SCORING_CONFIG: Readonly<{
  secretRuleSuccess: number;
  publicChallengeSuccess: number;
  difficultyBonus: Readonly<Record<RuleDifficulty, number>>;
  eligibleWildBonus: number;
}> = Object.freeze({
  secretRuleSuccess: 3,
  publicChallengeSuccess: 1,
  difficultyBonus: Object.freeze({ easy: 0, medium: 0, hard: 1 }),
  eligibleWildBonus: 2,
});
