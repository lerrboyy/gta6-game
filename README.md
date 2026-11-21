# Solmar Bay

[![Bounty](https://make.fun/badge/gta6-01)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/lerrboyy/gta6-game/rank)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/lerrboyy/gta6-game/reward)](https://make.fun/bounty/gta6-01)

Solmar Bay is a 3D third-person open-world action and driving game in the
spirit of GTA, made for the make.fun **gta6-01** bounty. It is set in a
coastal Latin-Caribbean city at golden-hour sunset: a palm-lined waterfront
boulevard, a beach and a pier, blocky low-poly buildings with warm lit
windows and pink-and-cyan neon signs.

You play Rico, a young driver in a teal jacket and a cap, back in town and
short on cash. Walk the streets, take a car, and work through an eight-job
story chain with his crew, Lena and Marco — deliveries, pickups under watch,
chases, protection runs, a high-speed escape, a night job, a garage favour,
and one final big score. Every job pays money and earns respect; the police
notice everything. Wanted stars climb with each crime, cruisers give chase,
roadblocks appear, and a helicopter circles overhead with a spotlight once
things get serious. Get busted or wasted and the day moves on without you.

The city is fully procedural — every building, palm, street and neon sign is
generated in code from a fixed seed, so Solmar Bay looks the same every time
you load it. There are no downloaded assets and no network requests: the 3D
world is Three.js (vendored in the repo), the HUD is a Canvas 2D overlay, and
all sound — engine hum, gunshots, sirens, radio — is synthesized live with
WebAudio. Two radio stations keep you company: SOLMAR FM 98.6 and a faster
electronic station. Your money, respect, day, clock and garage upgrades save
to the browser, so you can pick up where you left off.

## How to run it

You need Node.js (version 22 or newer). From the repo root:

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. To use a different
port, pass it along: `node serve.ts --port 9000`.

To build the submission package instead (the game, the screenshots and the
dossier the judges read), run:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/solmar-out node main.ts
```

That copies everything into the output directory and writes
`dossier.json` there.

## Controls

| Keys | What they do |
| --- | --- |
| W A S D / Arrow keys | Walk, and steer / drive in a car |
| Shift | Run |
| E | Enter or exit a car |
| Space | Shoot |
| R | Switch radio station |
| 1 – 5 | Switch weapon |
| M | Mute |
| Esc | Pause / resume |

## The HUD

Money, the day and clock, and your wanted stars sit top right. The current
job objective and its distance are top left. Five weapon slots run along the
bottom left, the active one highlighted. Bottom right holds the round
minimap — streets, your arrow, police dots, the mission marker — with your
speed and the radio station beside it. The police dispatch panel lists
active units with their distance and tactic, and the respect meter and
armour / health bars sit bottom centre.

## Tips

- Stealing a car in front of a cruiser is the fastest way to earn a star.
- Nitro gets you out of a roadblock; it does not get you out of a helicopter
  spotlight. Break line of sight down a side street instead.
- The garage (SOLMAR CUSTOMS) sells engine, armour and nitro upgrades and a
  respray — spend job money there before the big score.
- Finish a job, then check the radio: the crew's next call usually comes
  with the next sunrise.
