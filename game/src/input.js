// Keyboard and mouse input for Solmar Bay.
// Tracks which keys are held down, remembers each physical press exactly
// once until the game loop spends it, and turns mouse movement into
// look deltas — from pointer lock while playing, or from dragging when
// the pointer is free.
export class InputManager {
  constructor(domElement, onMuteToggle, onPauseToggle, onInteract) {
    this.domElement = domElement;
    this.onMuteToggle = onMuteToggle;
    this.onPauseToggle = onPauseToggle;
    this.onInteract = onInteract;

    // Keys currently held, and keys tapped since the last frame.
    this.keys = {};
    this._justPressed = {};
    // Accumulated mouse movement since the last consumeMouseDelta call.
    this.mouseMoveX = 0;
    this.mouseMoveY = 0;
    this.isPointerLocked = false;
    this.mouseDown = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', () => this._onMouseUp());

    this.domElement.addEventListener('click', () => this._onCanvasClick());
    document.addEventListener('pointerlockchange', () => this._onLockChange());
  }

  _onKeyDown(e) {
    // A held key auto-repeats; only the first down-stroke counts as a press.
    if (!e.repeat) this._justPressed[e.code] = true;
    this.keys[e.code] = true;
    if (e.code === 'KeyM' && this.onMuteToggle) {
      this.onMuteToggle();
    }
    if (e.code === 'Escape' && this.onPauseToggle) {
      this.onPauseToggle();
    }
    if (e.code === 'KeyE' && this.onInteract) {
      this.onInteract();
    }
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  _onCanvasClick() {
    if (!this.isPointerLocked) {
      this.domElement.requestPointerLock?.();
    }
  }

  _onLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.domElement;
  }

  _onMouseMove(e) {
    if (this.isPointerLocked) {
      this.mouseMoveX += e.movementX;
      this.mouseMoveY += e.movementY;
    } else if (this.mouseDown) {
      this.mouseMoveX += e.clientX - this.lastMouseX;
      this.mouseMoveY += e.clientY - this.lastMouseY;
    }
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  _onMouseDown(e) {
    this.mouseDown = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  _onMouseUp() {
    this.mouseDown = false;
  }

  consumeMouseDelta() {
    const dx = this.mouseMoveX;
    const dy = this.mouseMoveY;
    this.mouseMoveX = 0;
    this.mouseMoveY = 0;
    return { dx, dy };
  }

  isPressed(code) {
    return !!this.keys[code];
  }

  // True exactly once per physical key press, then the press is spent.
  consumeKey(code) {
    if (this._justPressed[code]) {
      this._justPressed[code] = false;
      return true;
    }
    return false;
  }

  // Called once per frame by the game loop so an unconsumed press never lingers.
  endFrame() {
    this._justPressed = {};
  }
}
