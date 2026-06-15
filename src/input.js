/* input.js — keyboard + mouse state shared with the game loop. */

const Input = {
  keys: {},
  mouse: { x: 0, y: 0, down: false, clicked: false },
  pressed: {}, // one-shot key presses consumed by the game each frame

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key))
        e.preventDefault();
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    };
    canvas.addEventListener("mousemove", toLocal);
    canvas.addEventListener("mousedown", (e) => {
      toLocal(e);
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener("mouseup", () => { this.mouse.down = false; });
  },

  // consume a one-shot press
  takePress(k) {
    if (this.pressed[k]) { this.pressed[k] = false; return true; }
    return false;
  },

  takeClick() {
    if (this.mouse.clicked) { this.mouse.clicked = false; return true; }
    return false;
  },

  endFrame() {
    this.pressed = {};
  },
};

window.Input = Input;
