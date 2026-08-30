export const SCORING_CONFIG: Readonly<{
  challengeWin: number;
  challengeLoss: number;
  standardSecret: number;
  hardSecret: number;
  targetLanding: number;
  targetOther: number;
}> = Object.freeze({
  challengeWin: 1,
  challengeLoss: 1,
  standardSecret: 3,
  hardSecret: 5,
  targetLanding: 2,
  targetOther: 1,
});
