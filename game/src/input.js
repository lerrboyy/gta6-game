// input.js — keyboard and mouse input for Solmar Bay.
//
// The factory builds one input state by listening to the keyboard (and the
// mouse, for shooting). The game loop reads two views of every action:
//   held    — true while the key is down (movement, running, driving)
//   pressed — true only on the frame the key went down (enter car, shoot,
//             radio, weapons, pause, mute), cleared by update() each frame
// so a single tap never fires twice.
//
// Title screen buttons are plain DOM elements owned by the page; input only
// reports where the player clicked, in case the loop needs the position.

const ACTION_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enterExit: ['KeyE'],
  shoot: ['Space'],
  radio: ['KeyR'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  weapon5: ['Digit5'],
  pause: ['Escape'],
  mute: ['KeyM'],
};

// Keys whose default browser behaviour (page scroll, etc.) we suppress
// while the game has focus.
const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export const INPUT_ACTIONS = Object.keys(ACTION_KEYS);

export function createInput() {
  const held = {};
  const pressed = {};
  for (const action of INPUT_ACTIONS) {
    held[action] = false;
    pressed[action] = false;
  }

  // Mouse state. shoot is also driven by the mouse button so the player
  // can aim with the mouse; lastClick records where a click landed.
  // Keyboard and mouse each hold "shoot" independently, so releasing one
  // never cancels the other.
  let mouseDown = false;
  let shootKeyHeld = false;
  let lastClick = null;

  function syncShootHeld() {
    held.shoot = shootKeyHeld || mouseDown;
  }

  function actionForCode(code) {
    for (const action of INPUT_ACTIONS) {
      if (ACTION_KEYS[action].includes(code)) {
        return action;
      }
    }
    return null;
  }

  function onKeyDown(event) {
    const action = actionForCode(event.code);
    if (!action) return;
    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault();
    }
    // Ignore auto-repeat: a held key must not re-trigger pressed actions.
    if (event.repeat) return;
    if (!held[action]) {
      pressed[action] = true;
    }
    if (action === 'shoot') {
      shootKeyHeld = true;
      syncShootHeld();
    } else {
      held[action] = true;
    }
  }

  function onKeyUp(event) {
    const action = actionForCode(event.code);
    if (!action) return;
    if (action === 'shoot') {
      shootKeyHeld = false;
      syncShootHeld();
    } else {
      held[action] = false;
    }
  }

  function onBlur() {
    // The window losing focus must not leave a key stuck down.
    for (const action of INPUT_ACTIONS) {
      held[action] = false;
    }
    shootKeyHeld = false;
    mouseDown = false;
  }

  function onMouseDown(event) {
    // Only the primary button shoots, and only when the click lands on
    // the game canvas itself — clicks on menu buttons and panels must
    // never fire a shot (or raise the wanted level) as a side effect.
    if (event.button !== 0) return;
    if (event.target && event.target.tagName !== 'CANVAS') return;
    mouseDown = true;
    if (!held.shoot) {
      pressed.shoot = true;
    }
    syncShootHeld();
    lastClick = { x: event.clientX, y: event.clientY, time: Date.now() };
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    mouseDown = false;
    syncShootHeld();
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('contextmenu', onContextMenu);

  const input = {
    // Live state objects, read directly by the loop if it prefers.
    held,
    pressed,

    isHeld(action) {
      return Boolean(held[action]);
    },

    wasPressed(action) {
      return Boolean(pressed[action]);
    },

    // True while the primary mouse button is down.
    isMouseDown() {
      return mouseDown;
    },

    // The most recent click position ({x, y, time}) or null.
    getLastClick() {
      return lastClick;
    },

    // Take the pending click (if any) and clear it, so the loop consumes
    // each click exactly once.
    consumeClick() {
      const click = lastClick;
      lastClick = null;
      return click;
    },

    // Which weapon slot (1-5) was just tapped, or 0 when none was.
    pressedWeaponSlot() {
      for (let slot = 1; slot <= 5; slot += 1) {
        if (pressed[`weapon${slot}`]) {
          return slot;
        }
      }
      return 0;
    },

    // End-of-frame housekeeping: the loop calls this once per frame after
    // it has read the pressed flags, so one tap fires exactly once.
    update() {
      for (const action of INPUT_ACTIONS) {
        pressed[action] = false;
      }
    },

    // Detach all listeners (used when the game is torn down).
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
    },
  };

  return input;
}
