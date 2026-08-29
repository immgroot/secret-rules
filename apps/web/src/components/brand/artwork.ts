// Original "Blind Fold" artwork. Both SVG assets and React components use this source.
export const markPath = "M13 4H38L56 22V55Q56 60 51 60H13Q8 60 8 55V9Q8 4 13 4ZM38 9V22H51ZM15 35Q31 20 49 35Q31 50 15 35Z";
export const pupilPath = "M36 35A4.5 4.5 0 1 1 27 35A4.5 4.5 0 1 1 36 35Z";

// Cut-corner letterforms, drawn on a 20 × 28 grid. No external font in the logo.
const glyphs: Record<string, string> = {
  S: "M20 0H4L0 4V12L4 16H14V22H0V28H16L20 24V16L16 12H6V6H20Z",
  E: "M0 0H20V6H6V11H17V17H6V22H20V28H0Z",
  C: "M20 0H4L0 4V24L4 28H20V22H6V6H20Z",
  R: "M0 0H16L20 4V13L16 17L22 28H15L9 18H6V28H0ZM6 6V12H14V6Z",
  T: "M0 0H22V6H14V28H8V6H0Z",
  U: "M0 0H6V22H14V0H20V24L16 28H4L0 24Z",
  L: "M0 0H6V22H20V28H0Z",
};

export const wordmarkPaths = [
  ...Array.from("SECRET", (letter, index) => ({ d: glyphs[letter]!, transform: `translate(${76 + index * 24} 1)` })),
  ...Array.from("RULES", (letter, index) => ({ d: glyphs[letter]!, transform: `translate(${76 + index * 29} 35) scale(1.2 1)` })),
];
