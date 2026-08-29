import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { info } from "node:console";
import { markPath, pupilPath, wordmarkPaths } from "../apps/web/src/components/brand/artwork.ts";

const directory = new URL("../apps/web/public/brand/", import.meta.url);
await mkdir(directory, { recursive: true });
const mark = `<path d="${markPath}" fill-rule="evenodd"/><path d="${pupilPath}"/>`;
const words = wordmarkPaths.map(({ d, transform }) => `<path d="${d}" transform="${transform}" fill-rule="evenodd"/>`).join("");
const svg = (viewBox, content, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${content}</svg>\n`;
const assets = {
  "full-logo.svg": svg("0 0 220 64", `<g fill="#d4f462">${mark}</g><g fill="#f5f1e7">${words}</g>`, "SECRET RULES"),
  "logo-mark.svg": svg("0 0 64 64", `<g fill="#d4f462">${mark}</g>`, "SECRET RULES — Blind Fold mark"),
  "monochrome-logo.svg": svg("0 0 220 64", `<g fill="currentColor">${mark}${words}</g>`, "SECRET RULES"),
  "favicon.svg": svg("0 0 64 64", `<rect width="64" height="64" rx="13" fill="#131610"/><g fill="#d4f462" transform="translate(4 4) scale(.875)">${mark}</g>`, "SECRET RULES"),
};
for (const [name, content] of Object.entries(assets)) await writeFile(new URL(name, directory), content);
info(`Generated ${Object.keys(assets).length} original SVG assets in ${fileURLToPath(directory)}.`);
