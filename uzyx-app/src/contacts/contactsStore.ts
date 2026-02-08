export type Contact = {
  id: string;
  handle: string;
  note?: string;
  createdAt: number;
};

const LS_KEY = "uzyx_contacts_v1";

function load(): Contact[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((c) => c && typeof c.handle === "string");
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

export function listContacts(): Contact[] {
  if (!cache) cache = load();
  return [...cache];
}

export function addContact(handle: string, note?: string): Contact {
  if (!cache) cache = load();
  const id = `${handle}-${Date.now()}`;
  const c: Contact = { id, handle, note, createdAt: Date.now() };
  cache = [c, ...cache];
  save(cache);
  return c;
}

export function removeContact(id: string) {
  if (!cache) cache = load();
  cache = cache.filter((c) => c.id !== id);
  save(cache);
}

export function updateContact(id: string, patch: Partial<Contact>) {
  if (!cache) cache = load();
  cache = cache.map((c) => (c.id === id ? { ...c, ...patch } : c));
  save(cache);
}
