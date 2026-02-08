// contacts store
export type Contact = { id: string; note?: string; createdAt: number };

const LS_KEY = "o_contacts_v1";

function load(): Contact[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((c) => c && typeof c.id === "string")
      .map((c) => ({
        id: String(c.id),
        note: typeof c.note === "string" ? c.note : undefined,
        createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

function save(list: Contact[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {}
}

let cache: Contact[] | null = null;

function ensure() {
  if (!cache) cache = load();
  return cache;
}

export const contactsStore = {
  add(c: Contact) {
    const list = ensure();
    const next: Contact = { id: c.id, note: c.note, createdAt: c.createdAt || Date.now() };
    cache = [next, ...list.filter((x) => x.id !== next.id)];
    save(cache);
    return next;
  },
  remove(id: string) {
    const list = ensure();
    cache = list.filter((c) => c.id !== id);
    save(cache);
  },
  list() {
    const list = ensure();
    return [...list];
  },
  update(id: string, patch: Partial<Contact>) {
    const list = ensure();
    cache = list.map((c) => (c.id === id ? { ...c, ...patch } : c));
    save(cache);
  },
};

