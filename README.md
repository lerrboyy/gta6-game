# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lerrboyy/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lerrboyy/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 3D third-person open-world action and driving game in the spirit of GTA, set in a
coastal Latin-Caribbean city at golden-hour sunset. Low-poly streets, warm lit
windows, neon signs, palm trees and the sea — all rendered in the browser with
Three.js, no downloads and no external assets.

## The game

You are Rico, a young driver in a teal jacket and a cap, trying to make a name for
himself in Solmar Bay. The city stretches along the Malecón, a wide palm-lined
waterfront boulevard, with a sandy beach, a pier jutting into the ocean, and blocky
buildings glowing warm yellow as the sun goes down.

Walk the streets, steal a car and drive it, shoot your way out of trouble, and run
an eight-job story chain with your crew — Lena and Marco. Each job pays money and
earns respect: deliveries, pickups under watch, chases, protection runs, high-speed
escapes, a night job, a favour for the garage, and one final big score.

Crime has consequences. A wanted level of one to five stars rises as you shoot,
steal and speed past the police. Cruisers spawn in and chase you — ramming,
pursuing, and at higher stars setting roadblocks. From three stars up, a helicopter
circles overhead with a visible spotlight cone. Get boxed in on foot or in a car
and you're busted; let your health hit zero and you're wasted.

Between jobs, stop by SOLMAR CUSTOMS, the garage, to upgrade your car's engine,
armour and nitro, or give it a fresh respray. Tune in to SOLMAR FM 98.6 for a
laid-back Latin groove, or switch to the faster electronic station. Your progress
— money, respect, the day and clock, car upgrades and completed jobs — is saved,
so you can pick up where you left off with Continue on the title screen.

## How to run it

No build step, no network requests — the game works fully offline.

```bash
node serve.ts
```

Then open http://localhost:8080 in your browser.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrow keys | Move on foot, drive the car |
| Shift | Run |
| E | Enter / exit a car |
| Space (or mouse) | Shoot |
| R | Switch radio station |
| 1–5 | Switch weapon slot |
| Esc | Pause |
| M | Mute |

## HUD guide

- **Top right** — money, the clock (day and time), and your wanted stars.
- **Top left** — the current job objective and the distance to its marker.
- **Bottom left** — five weapon slots, with the active one highlighted.
- **Bottom right** — a round minimap (streets, your arrow, police dots, the
  mission marker), plus your speed and the current radio station.
- **Centre right** — the police dispatch panel, listing active units with their
  distance in metres and their current tactic.
- **Bottom centre** — your respect meter and your armour and health bars.

## How it's built

The 3D world is built with Three.js (vendored in the repo), and the HUD is a
Canvas 2D overlay. Every building, car, palm tree and pedestrian is procedural
low-poly geometry, generated from a fixed seed so the city looks the same on
every load. All sound is synthesized live with WebAudio — engine hum, gunshots,
sirens, UI clicks, mission jingles and the two radio stations — so there are no
audio files at all.

## License

See [LICENSE](LICENSE).
