/**
 * Mutable input state shared by the keyboard, the pointer and (later) the
 * touch controls. Read inside physics/frame loops; never put in React state.
 */
export const input = {
  keys: new Set<string>(),
  /** Desired move vector in camera space: x right, y forward, each in [-1, 1]. */
  move: { x: 0, y: 0 },
  joystick: { x: 0, y: 0, active: false },
  slide: false,
  /** Physics step at which jump was last pressed; buffered in simulation steps so a frame hitch never eats a press. */
  jumpQueuedAtStep: Number.NEGATIVE_INFINITY,
  /** Accumulated pointer drag, consumed by the camera every frame. */
  look: { dx: 0, dy: 0 },
  /** Accumulated wheel delta, consumed by the camera every frame. */
  zoom: 0,
  dragging: false,
};

/** Simulation step counter, advanced by the penguin controller every physics step. */
export const sim = { step: 0 };

const FORWARD = ["KeyW", "ArrowUp"];
const BACK = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];

const any = (codes: string[]) => codes.some((c) => input.keys.has(c));

export function recomputeMove() {
  if (input.joystick.active) {
    input.move.x = input.joystick.x;
    input.move.y = input.joystick.y;
    return;
  }
  let x = 0;
  let y = 0;
  if (any(FORWARD)) y += 1;
  if (any(BACK)) y -= 1;
  if (any(RIGHT)) x += 1;
  if (any(LEFT)) x -= 1;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  input.move.x = x;
  input.move.y = y;
}

export function queueJump() {
  input.jumpQueuedAtStep = sim.step;
}

/** Returns true once if a jump was pressed within the last `bufferSteps` physics steps. */
export function consumeJump(bufferSteps: number): boolean {
  if (sim.step - input.jumpQueuedAtStep <= bufferSteps) {
    input.jumpQueuedAtStep = Number.NEGATIVE_INFINITY;
    return true;
  }
  return false;
}

export function clearInput() {
  input.keys.clear();
  input.joystick.active = false;
  input.joystick.x = 0;
  input.joystick.y = 0;
  input.move.x = 0;
  input.move.y = 0;
  input.slide = false;
  input.jumpQueuedAtStep = Number.NEGATIVE_INFINITY;
  input.look.dx = 0;
  input.look.dy = 0;
  input.zoom = 0;
  input.dragging = false;
}

export const MOVE_CODES = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT]);
