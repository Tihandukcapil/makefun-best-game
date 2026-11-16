// Keyboard + mouse for DAWNWISP. Movement comes from WASD/arrows or from the
// mouse (the wisp glides toward the pointer); Space or click fires the Nova;
// P or Escape pauses; M mutes; R restarts on end screens; 1/2/3 pick an upgrade.
// Actions are edge-triggered: takeActions() returns what was pressed since the
// last call, then clears it.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOVA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_PICK_1 = 32;
export const ACTION_PICK_2 = 64;
export const ACTION_PICK_3 = 128;
export const ACTION_ENDLESS = 256;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM | ACTION_NOVA,
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  Digit1: ACTION_PICK_1,
  Digit2: ACTION_PICK_2,
  Digit3: ACTION_PICK_3,
  KeyE: ACTION_ENDLESS,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseMovedAt = -10;
  let mouseDown = false;
  let clock = 0;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 720,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) {
      actions |= action;
      if (event.code === 'Space') event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });
  canvas.addEventListener('mousemove', (event) => {
    const pos = toLogical(event);
    mouseX = pos.x;
    mouseY = pos.y;
    mouseMovedAt = clock;
  });
  canvas.addEventListener('mousedown', (event) => {
    const pos = toLogical(event);
    mouseX = pos.x;
    mouseY = pos.y;
    mouseMovedAt = clock;
    mouseDown = true;
    actions |= ACTION_CONFIRM | ACTION_NOVA;
    event.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function keyDirection() {
    let x = 0;
    let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  return {
    // Advance the input clock (call once per frame with the world time).
    tick(time) {
      clock = time;
    },
    // Movement vector for this frame: keyboard wins while held, else glide
    // toward the mouse when it moved recently, else drift nowhere.
    moveVector(playerX, playerY) {
      const key = keyDirection();
      if (key.x !== 0 || key.y !== 0) return key;
      if (clock - mouseMovedAt < 2.5) {
        const dx = mouseX - playerX;
        const dy = mouseY - playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > 12) {
          const strength = Math.min(1, dist / 90);
          return { x: (dx / dist) * strength, y: (dy / dist) * strength };
        }
      }
      return { x: 0, y: 0 };
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
  };
}
