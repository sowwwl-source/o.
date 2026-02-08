// Uzyx-Time: Fibonacci mod 10, seed 3,1. Digit updates every second.
// IMPORTANT: do not reset on refresh if possible -> persist a,b in localStorage.

type TickFn = (digit: number) => void;

const LS_KEY = "uzyx_time_state_v1";

function loadState(): { a: number; b: number; digit: number } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { a: 3, b: 1, digit: 3 };
    const obj = JSON.parse(raw);
    if (
      typeof obj?.a === "number" &&
      typeof obj?.b === "number" &&
      typeof obj?.digit === "number"
    ) {
      return { a: obj.a % 10, b: obj.b % 10, digit: obj.digit % 10 };
    }
  } catch {}
  return { a: 3, b: 1, digit: 3 };
}

function saveState(s: { a: number; b: number; digit: number }) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

let state: { a: number; b: number; digit: number } | null = null;
let timer: number | null = null;
const listeners = new Set<TickFn>();

export function getUzyxTimeDigit(): number {
  if (typeof window === "undefined") return 3;
  if (!state) state = loadState();
  return state.digit;
}

export function startUzyxTime(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!state) state = loadState();

  if (timer !== null) {
    // already running
    return () => {};
  }

  // initial tick
  listeners.forEach((fn) => fn(state!.digit));

  timer = window.setInterval(() => {
    if (!state) state = loadState();
    const next = (state.a + state.b) % 10;
    state = { a: state.b, b: next, digit: next };
    saveState(state);
    listeners.forEach((fn) => fn(next));
  }, 1000);

  return () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function subscribeUzyxTime(fn: TickFn): () => void {
  listeners.add(fn);
  fn(getUzyxTimeDigit());
  return () => listeners.delete(fn);
}
