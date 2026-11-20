// Input handling (Keyboard & Mouse)
export class InputManager {
  constructor(domElement, onMuteToggle, onPauseToggle, onInteract) {
    this.domElement = domElement;
    this.onMuteToggle = onMuteToggle;
    this.onPauseToggle = onPauseToggle;
    this.onInteract = onInteract;
    
    this.keys = {};
    // Keys tapped since the last frame, so one physical press fires exactly once.
    this._justPressed = {};
    this.mouseMoveX = 0;
    this.mouseMoveY = 0;
    this.isPointerLocked = false;
    this.mouseDown = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('keydown', (e) => {
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
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.domElement.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.domElement.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseMoveX += e.movementX;
        this.mouseMoveY += e.movementY;
      } else if (this.mouseDown) {
        this.mouseMoveX += e.clientX - this.lastMouseX;
        this.mouseMoveY += e.clientY - this.lastMouseY;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
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
