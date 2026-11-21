// Solmar Bay — a third-person, open-world crime game in a bright coastal
// city, built for the make.fun gta6-01 bounty. Rico arrives in town with
// nothing, walks and drives through streets of glowing towers, neon signs,
// palms and a beachfront Malecón, and works his way up: five weapon slots,
// a two-station radio, a garage where cars get tuned, eight story jobs with
// Lena and Marco, a wanted system that sends police, a helicopter and
// roadblocks after him, plus a round minimap, a day counter with a running
// clock, and a respect meter that tracks his name on the street.
//
// This file is the hand-in step. The playable game is the plain static
// files in game/ next to this file — a desktop browser can load them
// offline (game/index.html and its ES modules, no library, no network
// request) — and this script gathers them for the judge. It copies game/
// and screenshots/ into the output directory and writes dossier.json there,
// using the vendored make.fun helper to build that summary.
//
// To try the game first, run `node serve.ts` and open http://localhost:8080.
// To hand it in outside the grader's container, point the output elsewhere:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's caps, taken from its own reference/gate.json. Only
// text_max_bytes changes the dossier's bytes; the rest are guards that
// refuse an entry the scorer would refuse anyway — more than 4 screenshots
// or one over 256 KiB; more than 993 files in game/ or 48 MiB of game files
// in total; or any path under game/ longer than 1000 bytes. game/ is
// counted beside /output's own 1000-entry cap, its screenshots/ and its
// dossier.json.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
