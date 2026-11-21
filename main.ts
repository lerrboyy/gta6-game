// Solmar Bay — submission packer for the make.fun gta6-01 bounty.
//
// This is the program that hands the game in. It takes the game folder
// and the screenshots folder sitting beside this file, copies them into
// the output directory, and writes dossier.json there — the summary the
// judges read, produced by make.fun's own vendored library. Run it with
// `node main.ts`; outside the grading container, point it somewhere
// scratch with MAKEFUN_OUTPUT_DIR, e.g.
//   MAKEFUN_OUTPUT_DIR=/tmp/solmar-out node main.ts
// The caps below are the scorer's own limits (from its gate file): the
// text budget the dossier may hold, at most four screenshots of at most
// 256 KiB each, and the game tree's file, byte and path limits. Passing
// them along means this program refuses exactly where the scorer would.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repo root (this file's own folder) and where the hand-in goes.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output folder, then the two folders the entry is made of.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier, built from the copied folders under the scorer's caps.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solmar Bay packed into ${outputDir}`);
