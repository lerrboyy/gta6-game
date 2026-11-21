// Solmar Bay — story jobs.
//
// The story module owns the eight-job chain Rico runs with Lena and Marco.
// It knows nothing about rendering or input: the loop hands it the player's
// position and the state of the world each frame, and it answers back with
// the current objective, where the marker sits, and whether the job is done,
// failed, or still running. Payouts land straight on the shared world state.

import * as configModule from './config.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function distance2D(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// The config module exposes its tuning as a named `config` object; read
// the mission table from there and fall back to the numbers below.
const configValues = configModule.config ?? configModule.default ?? configModule;
const configPayouts = Array.isArray(configValues.missions)
  ? configValues.missions.map((job) => job.payout)
  : null;
const configRespect = Array.isArray(configValues.missions)
  ? configValues.missions.map((job) => job.respect)
  : null;

// ---------------------------------------------------------------------------
// Landmark keys
//
// Objectives point at a landmark by key instead of a hard-coded spot, so the
// loop can hand in the real positions from the city once it is built. The
// fallback coordinates below are sensible spots on the city grid and are
// only used until the loop supplies the real ones.
// ---------------------------------------------------------------------------

const FALLBACK_LANDMARKS = {
  safehouse: { x: -40, z: 60 },
  garage: { x: 60, z: 40 },
  pier: { x: -120, z: -140 },
  beach: { x: -100, z: -120 },
  market: { x: 20, z: -60 },
  docks: { x: 120, z: -120 },
  plaza: { x: 0, z: 0 },
  northGate: { x: 0, z: -160 },
  marina: { x: -140, z: -60 },
  hotel: { x: 80, z: -80 },
};

// ---------------------------------------------------------------------------
// The eight jobs
//
// Each job: a title, a short briefing in the crew's own voices, an ordered
// list of objectives, and what it pays. Objective kinds:
//   drive   — reach the marker
//   pickup  — reach the marker and take the package
//   shoot   — take down the given number of targets
//   escape  — lose the police (or reach the hideout marker)
//   deliver — reach the drop-off marker
// ---------------------------------------------------------------------------

function buildJobs() {
  const payouts = configPayouts;
  const respect = configRespect;

  const pay = (index, fallback) => (Array.isArray(payouts) ? (payouts[index] ?? fallback) : fallback);
  const rep = (index, fallback) => (Array.isArray(respect) ? (respect[index] ?? fallback) : fallback);

  return [
    {
      id: 'first-delivery',
      title: 'The First Drop',
      theme: 'a first delivery',
      briefing: [
        { speaker: 'Lena', line: 'Rico. One package, one drop. Easy money if you keep it simple.' },
        { speaker: 'Rico', line: 'Simple is my middle name. Where is it?' },
        { speaker: 'Marco', line: 'Pier end, under the lamp. Take it to the market. No detours.' },
        { speaker: 'Lena', line: 'And Rico? Do not stop for anyone.' },
      ],
      objectives: [
        { id: 'go-pier', kind: 'drive', text: 'Drive to the pier', markerKey: 'pier', radius: 7 },
        { id: 'take-package', kind: 'pickup', text: 'Pick up the package', markerKey: 'pier', radius: 4 },
        { id: 'drop-market', kind: 'deliver', text: 'Deliver the package to the market', markerKey: 'market', radius: 7 },
      ],
      payout: pay(0, 450),
      respect: rep(0, 10),
    },
    {
      id: 'watched-pickup',
      title: 'Eyes on the Street',
      theme: 'a pickup under watch',
      briefing: [
        { speaker: 'Marco', line: 'Somebody is watching the docks. So we move quiet and fast.' },
        { speaker: 'Rico', line: 'Watched by who?' },
        { speaker: 'Lena', line: 'Does it matter? Grab the case, do not wave at anyone.' },
        { speaker: 'Marco', line: 'If they get close, make them regret it. Then bring it home.' },
      ],
      objectives: [
        { id: 'go-docks', kind: 'drive', text: 'Drive to the docks', markerKey: 'docks', radius: 7 },
        { id: 'take-case', kind: 'pickup', text: 'Pick up the case', markerKey: 'docks', radius: 4 },
        { id: 'clear-watchers', kind: 'shoot', text: 'Deal with the watchers', count: 3, radius: 0 },
        { id: 'drop-safehouse', kind: 'deliver', text: 'Deliver the case to the safehouse', markerKey: 'safehouse', radius: 7 },
      ],
      payout: pay(1, 700),
      respect: rep(1, 14),
    },
    {
      id: 'the-chase',
      title: 'Tailspin',
      theme: 'a chase',
      briefing: [
        { speaker: 'Lena', line: 'A courier took our money and ran. He is in a grey coupe, north side.' },
        { speaker: 'Rico', line: 'I can catch anything with four wheels.' },
        { speaker: 'Marco', line: 'Catch him, stop him, get the bag. Try not to total the car.' },
        { speaker: 'Lena', line: 'Try. That is the whole plan.' },
      ],
      objectives: [
        { id: 'chase-courier', kind: 'drive', text: 'Chase the courier to the north gate', markerKey: 'northGate', radius: 9 },
        { id: 'stop-courier', kind: 'shoot', text: 'Stop the courier', count: 1, radius: 0 },
        { id: 'take-bag', kind: 'pickup', text: 'Pick up the money bag', markerKey: 'northGate', radius: 5 },
        { id: 'drop-plaza', kind: 'deliver', text: 'Bring the bag to the plaza', markerKey: 'plaza', radius: 7 },
      ],
      payout: pay(2, 950),
      respect: rep(2, 16),
    },
    {
      id: 'protection-run',
      title: 'Cover for Lena',
      theme: 'a protection run',
      briefing: [
        { speaker: 'Lena', line: 'I have a meet at the hotel. I need you watching my back, not my phone.' },
        { speaker: 'Rico', line: 'Nobody touches you while I am on the roof across the street.' },
        { speaker: 'Marco', line: 'If guns come out, they come out for them, not for her. Keep her safe.' },
        { speaker: 'Lena', line: 'And afterwards we drive out together. Slow. Calm. Like tourists.' },
      ],
      objectives: [
        { id: 'go-hotel', kind: 'drive', text: 'Drive Lena to the hotel', markerKey: 'hotel', radius: 7 },
        { id: 'cover-meet', kind: 'shoot', text: 'Cover the meet — stop the ambush', count: 4, radius: 0 },
        { id: 'escort-out', kind: 'deliver', text: 'Escort Lena back to the safehouse', markerKey: 'safehouse', radius: 7 },
      ],
      payout: pay(3, 1200),
      respect: rep(3, 20),
    },
    {
      id: 'high-speed-escape',
      title: 'Burning Rubber',
      theme: 'a high-speed escape',
      briefing: [
        { speaker: 'Marco', line: 'The job went loud. Cops everywhere. You have the goods, now vanish.' },
        { speaker: 'Rico', line: 'Vanishing is the fun part.' },
        { speaker: 'Lena', line: 'Lose them first. Then bring the goods to the garage. Not before.' },
        { speaker: 'Marco', line: 'If you lead them to the garage, I will bill you for the door.' },
      ],
      objectives: [
        { id: 'grab-goods', kind: 'pickup', text: 'Grab the goods at the marina', markerKey: 'marina', radius: 5 },
        { id: 'lose-cops', kind: 'escape', text: 'Lose the police', markerKey: 'safehouse', radius: 8 },
        { id: 'drop-garage', kind: 'deliver', text: 'Deliver the goods to the garage', markerKey: 'garage', radius: 7 },
      ],
      payout: pay(4, 1600),
      respect: rep(4, 24),
    },
    {
      id: 'night-job',
      title: 'Midnight Cargo',
      theme: 'a night job',
      briefing: [
        { speaker: 'Lena', line: 'Midnight. Beach side. A boat, a crate, no lights, no questions.' },
        { speaker: 'Rico', line: 'I like the sound of no questions.' },
        { speaker: 'Marco', line: 'The beach is quiet at night. Keep it that way. One crate, one drop.' },
        { speaker: 'Lena', line: 'If anyone follows you off the sand, lose them before the plaza.' },
      ],
      objectives: [
        { id: 'go-beach', kind: 'drive', text: 'Drive to the beach at night', markerKey: 'beach', radius: 7 },
        { id: 'take-crate', kind: 'pickup', text: 'Pick up the crate', markerKey: 'beach', radius: 4 },
        { id: 'drop-plaza-night', kind: 'deliver', text: 'Deliver the crate to the plaza', markerKey: 'plaza', radius: 7 },
      ],
      payout: pay(5, 1400),
      respect: rep(5, 22),
    },
    {
      id: 'garage-favour',
      title: 'A Favour for Customs',
      theme: 'a garage favour',
      briefing: [
        { speaker: 'Marco', line: 'The garage needs a part. A rare one. It is sitting at the docks.' },
        { speaker: 'Rico', line: 'So I am a delivery boy for your shop now?' },
        { speaker: 'Marco', line: 'You are a delivery boy with a fast car. Bring the part, I tune the car.' },
        { speaker: 'Lena', line: 'And do not scratch it. He cries about scratches.' },
      ],
      objectives: [
        { id: 'go-docks-part', kind: 'drive', text: 'Drive to the docks for the part', markerKey: 'docks', radius: 7 },
        { id: 'take-part', kind: 'pickup', text: 'Pick up the part', markerKey: 'docks', radius: 4 },
        { id: 'drop-garage-part', kind: 'deliver', text: 'Deliver the part to the garage', markerKey: 'garage', radius: 7 },
      ],
      payout: pay(6, 900),
      respect: rep(6, 18),
    },
    {
      id: 'big-score',
      title: 'The Big Score',
      theme: 'a final big score',
      briefing: [
        { speaker: 'Lena', line: 'This is the one. The marina vault, one night, everything we are owed.' },
        { speaker: 'Marco', line: 'We grab it, we hold the pier, we run. No heroes, no last stands.' },
        { speaker: 'Rico', line: 'Then we are done running small jobs. Say it again so I believe it.' },
        { speaker: 'Lena', line: 'One last job, Rico. Make it count.' },
      ],
      objectives: [
        { id: 'go-marina', kind: 'drive', text: 'Drive to the marina', markerKey: 'marina', radius: 8 },
        { id: 'take-vault', kind: 'pickup', text: 'Take the vault case', markerKey: 'marina', radius: 5 },
        { id: 'hold-pier', kind: 'shoot', text: 'Hold the pier — stop the guards', count: 6, radius: 0 },
        { id: 'lose-cops-final', kind: 'escape', text: 'Escape the police', markerKey: 'safehouse', radius: 8 },
        { id: 'drop-safehouse-final', kind: 'deliver', text: 'Deliver the score to the safehouse', markerKey: 'safehouse', radius: 7 },
      ],
      payout: pay(7, 5000),
      respect: rep(7, 40),
    },
  ];
}

// ---------------------------------------------------------------------------
// Reading the shared world state
//
// The loop owns the state object. These helpers tolerate the state carrying
// its numbers directly (state.money) or nested under a world object, so a
// small shape change upstream does not break payouts.
// ---------------------------------------------------------------------------

function readNumber(state, keys) {
  if (!state) return 0;
  for (const key of keys) {
    const value = state[key];
    if (typeof value === 'number') return value;
  }
  const nested = state.world ?? state.game ?? null;
  if (nested) {
    for (const key of keys) {
      const value = nested[key];
      if (typeof value === 'number') return value;
    }
  }
  return 0;
}

function addToState(state, keys, amount) {
  if (!state || !amount) return;
  for (const key of keys) {
    if (typeof state[key] === 'number') {
      state[key] += amount;
      return;
    }
  }
  const nested = state.world ?? state.game ?? null;
  if (nested) {
    for (const key of keys) {
      if (typeof nested[key] === 'number') {
        nested[key] += amount;
        return;
      }
    }
  }
  // Nothing held the number yet: plant it on the state itself.
  state[keys[0]] = (typeof state[keys[0]] === 'number' ? state[keys[0]] : 0) + amount;
}

function readPlayerPosition(state, context) {
  const fromContext = context?.playerPosition ?? context?.playerPos ?? context?.position ?? null;
  if (fromContext) return fromContext;
  const player = state?.player ?? null;
  if (!player) return null;
  return player.position ?? player.pos ?? player ?? null;
}

function readWanted(state, context) {
  if (typeof context?.wanted === 'number') return context.wanted;
  if (typeof context?.wantedLevel === 'number') return context.wantedLevel;
  return readNumber(state, ['wantedLevel', 'wanted', 'stars']);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMissions(state) {
  const jobs = buildJobs();
  const landmarks = { ...FALLBACK_LANDMARKS };

  let jobIndex = -1; // -1 means no job started yet
  let objectiveIndex = 0;
  let status = 'idle'; // idle | active | complete | failed | done
  let failReason = null;
  let targetsDown = 0;
  let paidJobId = null;

  function currentJob() {
    if (jobIndex < 0 || jobIndex >= jobs.length) return null;
    return jobs[jobIndex];
  }

  function currentObjective() {
    const job = currentJob();
    if (!job) return null;
    return job.objectives[objectiveIndex] ?? null;
  }

  function resolveMarker(objective, context) {
    if (!objective) return null;
    const supplied = context?.markers ?? context?.landmarks ?? null;
    if (objective.markerKey && supplied && supplied[objective.markerKey]) {
      return supplied[objective.markerKey];
    }
    if (objective.markerKey && landmarks[objective.markerKey]) {
      return landmarks[objective.markerKey];
    }
    if (objective.position) return objective.position;
    if (objective.kind === 'pickup') {
      return context?.packagePosition ?? context?.pickupPosition ?? null;
    }
    if (objective.kind === 'deliver') {
      return context?.dropOffPosition ?? context?.deliveryPosition ?? null;
    }
    if (objective.kind === 'drive') {
      return context?.markerPosition ?? null;
    }
    return null;
  }

  function objectiveDone(objective, context) {
    if (!objective) return false;
    const playerPosition = readPlayerPosition(state, context);

    if (objective.kind === 'shoot') {
      const remaining = context?.targetsRemaining ?? context?.targetsLeft ?? null;
      if (typeof remaining === 'number') return remaining <= 0;
      const destroyed = context?.targetsDestroyed ?? context?.targetsDown ?? targetsDown;
      return destroyed >= (objective.count ?? 1);
    }

    if (objective.kind === 'escape') {
      if (readWanted(state, context) <= 0) return true;
      // Reaching the hideout marker also shakes the tail.
      const marker = resolveMarker(objective, context);
      if (marker && playerPosition) {
        return distance2D(playerPosition, marker) <= (objective.radius ?? 8);
      }
      return false;
    }

    // drive / pickup / deliver all resolve by reaching the marker.
    const marker = resolveMarker(objective, context);
    if (!marker || !playerPosition) return false;
    return distance2D(playerPosition, marker) <= (objective.radius ?? 7);
  }

  function payOut(job) {
    if (!job || paidJobId === job.id) return false;
    paidJobId = job.id;
    addToState(state, ['money', 'cash', 'funds'], job.payout);
    addToState(state, ['respect'], job.respect);
    return true;
  }

  function fail(reason) {
    if (status !== 'active') return status;
    status = 'failed';
    failReason = reason;
    return status;
  }

  const module = {
    jobs,

    getJobs() {
      return jobs;
    },

    getJobCount() {
      return jobs.length;
    },

    getCurrentJob() {
      return currentJob();
    },

    getJobIndex() {
      return jobIndex;
    },

    getStatus() {
      return status;
    },

    isActive() {
      return status === 'active';
    },

    isComplete() {
      return status === 'complete' || status === 'done';
    },

    isFailed() {
      return status === 'failed';
    },

    getFailReason() {
      return failReason;
    },

    getBriefing(job) {
      const target = job ?? currentJob();
      return target ? target.briefing : [];
    },

    // Hand the loop the real city landmark positions (safehouse, garage,
    // pier, docks, market, plaza, beach, marina, hotel, northGate).
    setLandmarks(next) {
      if (!next) return;
      for (const key of Object.keys(next)) {
        if (next[key] && typeof next[key].x === 'number') landmarks[key] = next[key];
      }
    },

    setMarkers(next) {
      module.setLandmarks(next);
    },

    startJob(index) {
      const target = typeof index === 'number' ? index : jobIndex + 1;
      if (target < 0 || target >= jobs.length) return null;
      jobIndex = target;
      objectiveIndex = 0;
      status = 'active';
      failReason = null;
      targetsDown = 0;
      paidJobId = null;
      return currentJob();
    },

    startNextJob() {
      if (jobIndex + 1 >= jobs.length) {
        status = 'done';
        return null;
      }
      return module.startJob(jobIndex + 1);
    },

    // One frame of story logic. `context` is whatever the loop knows about
    // the world this frame: player position, remaining targets, package and
    // drop-off positions, wanted level, busted/wasted flags. Returns the
    // current status string.
    update(dt, context) {
      if (status !== 'active') return status;
      const job = currentJob();
      if (!job) return status;

      // Fail conditions first: busted, wasted, or the thing we were
      // protecting was destroyed.
      const busted = context?.busted ?? state?.busted ?? false;
      const wasted = context?.wasted ?? state?.wasted ?? false;
      const targetDestroyed = context?.targetDestroyed ?? context?.protectedTargetDestroyed ?? false;
      if (busted) return fail('busted');
      if (wasted) return fail('wasted');
      if (targetDestroyed) return fail('target-destroyed');

      if (typeof context?.targetsDestroyed === 'number') {
        targetsDown = context.targetsDestroyed;
      }
      if (typeof context?.targetsDown === 'number') {
        targetsDown = context.targetsDown;
      }

      const objective = currentObjective();
      if (!objective) {
        status = 'complete';
        payOut(job);
        return status;
      }

      if (objectiveDone(objective, context)) {
        objectiveIndex += 1;
        if (objectiveIndex >= job.objectives.length) {
          status = 'complete';
          payOut(job);
        }
      }
      return status;
    },

    getCurrentObjective() {
      return currentObjective();
    },

    // Text for the job tracker in the top-left of the HUD.
    getObjectiveText() {
      const job = currentJob();
      const objective = currentObjective();
      if (!job || !objective) {
        if (status === 'done') return 'Story complete — Solmar Bay is yours.';
        if (status === 'complete') return 'Job complete.';
        return 'No active job — start the next job.';
      }
      return `${job.title}: ${objective.text}`;
    },

    // Where the tracker arrow should point this frame. The loop may pass
    // the same context it passes to update() so live markers win.
    getMarkerPosition(context) {
      const objective = currentObjective();
      if (!objective) return null;
      if (objective.kind === 'shoot') return null;
      return resolveMarker(objective, context);
    },

    // Distance in metres from the player to the current marker, for the HUD.
    getMarkerDistance(context) {
      const marker = module.getMarkerPosition(context);
      const playerPosition = readPlayerPosition(state, context);
      if (!marker || !playerPosition) return null;
      return distance2D(playerPosition, marker);
    },

    getProgress() {
      const job = currentJob();
      if (!job) return { job: jobIndex + 1, totalJobs: jobs.length, objective: 0, totalObjectives: 0 };
      return {
        job: jobIndex + 1,
        totalJobs: jobs.length,
        objective: Math.min(objectiveIndex + 1, job.objectives.length),
        totalObjectives: job.objectives.length,
      };
    },

    // Pay out the current job's reward (also done automatically when the
    // last objective completes). Returns true when money actually moved.
    payOutCurrentJob() {
      const job = currentJob();
      return payOut(job);
    },

    completeCurrentJob() {
      const job = currentJob();
      if (!job || status !== 'active') return false;
      status = 'complete';
      objectiveIndex = job.objectives.length;
      payOut(job);
      return true;
    },

    failCurrentJob(reason) {
      return fail(reason ?? 'failed');
    },

    reset() {
      jobIndex = -1;
      objectiveIndex = 0;
      status = 'idle';
      failReason = null;
      targetsDown = 0;
      paidJobId = null;
    },
  };

  return module;
}

export default createMissions;
