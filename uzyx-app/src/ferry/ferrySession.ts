type FerryEventMap = {
  update: CustomEvent<FerryState>;
  message: CustomEvent<FerryMessage>;
};

export type FerryState = {
  code: string | null;
  status: "idle" | "lobby" | "boarding" | "enroute";
  participants: string[];
  destination?: string;
  me: string;
};

type FerryMessage =
  | { type: "join"; code: string; id: string }
  | { type: "leave"; code: string; id: string }
  | { type: "board"; code: string }
  | { type: "dest"; code: string; destination: string };

const CHANNEL = "o_ferry_v1";

const randId = () => Math.random().toString(36).slice(2, 8);

export class FerrySession extends EventTarget {
  private channel: BroadcastChannel | null = null;
  private state: FerryState;

  constructor() {
    super();
    this.state = {
      code: null,
      status: "idle",
      participants: [],
      me: randId(),
    };
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => this.onMessage(e.data as FerryMessage);
    }
  }

  getState() {
    return this.state;
  }

  private emitUpdate() {
    this.dispatchEvent(new CustomEvent("update", { detail: this.state }));
  }

  private post(msg: FerryMessage) {
    if (this.channel) this.channel.postMessage(msg);
    this.onMessage(msg);
  }

  private onMessage(msg: FerryMessage) {
    if (!this.state.code || msg.code !== this.state.code) return;
    switch (msg.type) {
      case "join": {
        if (!this.state.participants.includes(msg.id)) {
          this.state = {
            ...this.state,
            participants: [...this.state.participants, msg.id],
          };
        }
        break;
      }
      case "leave": {
        this.state = {
          ...this.state,
          participants: this.state.participants.filter((p) => p !== msg.id),
        };
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
    }
    this.emitUpdate();
  }

  create(code: string) {
    this.state = {
      ...this.state,
      code,
      status: "lobby",
      participants: [this.state.me],
    };
    this.emitUpdate();
  }

  join(code: string) {
    if (!code) return;
    this.state = {
      ...this.state,
      code,
      status: "lobby",
      participants: [this.state.me],
    };
    this.emitUpdate();
    this.post({ type: "join", code, id: this.state.me });
  }

  leave() {
    const code = this.state.code;
    if (!code) return;
    this.post({ type: "leave", code, id: this.state.me });
    this.state = { ...this.state, code: null, status: "idle", participants: [] };
    this.emitUpdate();
  }

  setDestination(destination: string) {
    const code = this.state.code;
    if (!code) return;
    this.post({ type: "dest", code, destination });
  }

  board() {
    const code = this.state.code;
    if (!code) return;
    this.post({ type: "board", code });
    window.setTimeout(() => {
      this.state = { ...this.state, status: "enroute" };
      this.emitUpdate();
    }, 900);
  }
}

export function shortCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}
