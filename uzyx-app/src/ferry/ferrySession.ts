export type FerryState = {
  code: string | null;
  status: "idle" | "lobby" | "boarding" | "enroute";
  participants: string[];
  invites: string[];
  destination?: string;
  me: string;
};

type FerryMessage =
  | { type: "join"; code: string; id: string }
  | { type: "leave"; code: string; id: string }
  | { type: "board"; code: string }
  | { type: "dest"; code: string; destination: string }
  | { type: "invite"; code: string; contactId: string }
  | { type: "sync:req"; code: string; from: string }
  | { type: "sync:state"; code: string; to: string; participants: string[]; destination?: string; status?: FerryState["status"] };

const LS_LAST_CODE = "o_ferry:lastCode";

const randId = () => Math.random().toString(36).slice(2, 8);

const bus = new EventTarget();

// FERRY: BroadcastChannel mock
const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("O_FERRY") : null;
if (ch) {
  ch.onmessage = (e) => {
    bus.dispatchEvent(new CustomEvent("message", { detail: e.data }));
  };
}

function emit(evt: any) {
  ch?.postMessage(evt); /* fallback EventTarget */
  bus.dispatchEvent(new CustomEvent("message", { detail: evt }));
}

export function getLastFerryCode(): string | null {
  try {
    const v = localStorage.getItem(LS_LAST_CODE);
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

function setLastFerryCode(code: string) {
  try {
    localStorage.setItem(LS_LAST_CODE, code);
  } catch {}
}

export function shortCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function emitInvite(contactId: string, code?: string) {
  const c = (code || getLastFerryCode() || "").trim().toUpperCase();
  if (!c) return;
  emit({ type: "invite", code: c, contactId } satisfies FerryMessage);
}

export class FerrySession extends EventTarget {
  private state: FerryState;
  private onMessageBound: (e: Event) => void;

  constructor(opts?: { me?: string }) {
    super();
    const me = (opts?.me || randId()).slice(0, 8);
    this.state = {
      code: null,
      status: "idle",
      participants: [],
      invites: [],
      me,
    };

    this.onMessageBound = (e: Event) => {
      const msg = (e as CustomEvent<FerryMessage>).detail;
      this.onMessage(msg);
    };

    // EventTarget fallback also serves as same-tab fanout.
    bus.addEventListener("message", this.onMessageBound as any);
  }

  dispose() {
    bus.removeEventListener("message", this.onMessageBound as any);
  }

  getState(): FerryState {
    return this.state;
  }

  private emitUpdate() {
    this.dispatchEvent(new CustomEvent("update", { detail: this.state }));
  }

  private onMessage(msg: FerryMessage) {
    if (!this.state.code || msg.code !== this.state.code) return;
    switch (msg.type) {
      case "join": {
        if (!this.state.participants.includes(msg.id)) {
          this.state = { ...this.state, participants: [...this.state.participants, msg.id] };
        }
        break;
      }
      case "leave": {
        this.state = { ...this.state, participants: this.state.participants.filter((p) => p !== msg.id) };
        break;
      }
      case "board": {
        this.state = { ...this.state, status: "boarding" };
        break;
      }
      case "dest": {
        this.state = { ...this.state, destination: msg.destination };
        break;
      }
      case "invite": {
        if (!this.state.invites.includes(msg.contactId)) {
          this.state = { ...this.state, invites: [msg.contactId, ...this.state.invites].slice(0, 12) };
        }
        break;
      }
      case "sync:req": {
        if (msg.from === this.state.me) break;
        emit({
          type: "sync:state",
          code: msg.code,
          to: msg.from,
          participants: this.state.participants,
          destination: this.state.destination,
          status: this.state.status,
        } satisfies FerryMessage);
        break;
      }
      case "sync:state": {
        if (msg.to !== this.state.me) break;
        const merged = Array.from(new Set([...this.state.participants, ...msg.participants]));
        this.state = {
          ...this.state,
          participants: merged,
          destination: msg.destination ?? this.state.destination,
          status: msg.status ?? this.state.status,
        };
        break;
      }
    }
    this.emitUpdate();
  }

  create(code: string) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLastFerryCode(c);
    this.state = {
      ...this.state,
      code: c,
      status: "lobby",
      participants: [this.state.me],
      invites: [],
    };
    this.emitUpdate();
  }

  join(code: string) {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLastFerryCode(c);
    this.state = {
      ...this.state,
      code: c,
      status: "lobby",
      participants: [this.state.me],
      invites: [],
    };
    this.emitUpdate();
    emit({ type: "join", code: c, id: this.state.me } satisfies FerryMessage);
    emit({ type: "sync:req", code: c, from: this.state.me } satisfies FerryMessage);
  }

  leave() {
    const code = this.state.code;
    if (!code) return;
    emit({ type: "leave", code, id: this.state.me } satisfies FerryMessage);
    this.state = { ...this.state, code: null, status: "idle", participants: [], invites: [] };
    this.emitUpdate();
  }

  setDestination(destination: string) {
    const code = this.state.code;
    if (!code) return;
    emit({ type: "dest", code, destination } satisfies FerryMessage);
  }

  invite(contactId: string) {
    const code = this.state.code;
    if (!code) return;
    emit({ type: "invite", code, contactId } satisfies FerryMessage);
  }

  board() {
    const code = this.state.code;
    if (!code) return;
    emit({ type: "board", code } satisfies FerryMessage);
    window.setTimeout(() => {
      this.state = { ...this.state, status: "enroute" };
      this.emitUpdate();
    }, 900);
  }
}
