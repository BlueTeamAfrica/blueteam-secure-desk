/**
 * Scans public/editorial and writes app/_lib/editorialImageManifest.ts
 * so the client bundle can use every image URL without fs at runtime.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const editorialDir = path.join(root, "public", "editorial");
const outFile = path.join(root, "app", "_lib", "editorialImageManifest.ts");

const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const EXCLUDE_RE = /(^|\/)(sf1\.png)$|logo|brand/i;

function main() {
  if (!fs.existsSync(editorialDir)) {
    fs.mkdirSync(editorialDir, { recursive: true });
  }
  const names = fs
    .readdirSync(editorialDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .filter((name) => !EXCLUDE_RE.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));

  const urls = names.map((f) => `/editorial/${f.replace(/\\/g, "/")}`);

  const src = `/**
 * Image URLs under \`/public/editorial\` (auto-generated).
 * Regenerate after adding files: \`node scripts/generate-editorial-manifest.mjs\`
 * (also runs from npm \`prebuild\` / start of \`dev\`).
 */
export const EDITORIAL_IMAGE_PATHS: readonly string[] = ${JSON.stringify(urls, null, 2)};
`;

  fs.writeFileSync(outFile, src);
  console.log(`Wrote ${urls.length} paths to app/_lib/editorialImageManifest.ts`);
}

main();
