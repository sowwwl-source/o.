export type Presence = 'offline' | 'idle' | 'present';
export type AuraType = 'noise' | 'click' | 'hum' | 'silence';

export type UserPublic = {
  id: string;
  tzOffsetMinutes: number; // minutes east of UTC, ex: +60, -300
  latBucket: number; // ex: -60,-40,...,60 (large bands)
  lonBucket: number; // ex: -180..180 (large steps)
  publicCourName: string;
  soundAura: { type: AuraType; seed: number };
  presence: Presence;
};

export type DoorState = {
  hovered: boolean;
  knocked: boolean;
  lastKnockAt?: number;
};

export type SessionIntent = {
  mode: 'COUR' | 'SALOON' | 'FILES' | null;
  targetUserId?: string;
};

function jsonUrl(rel: string) {
  return new URL(rel, import.meta.url).toString();
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Minimal mock router. Keeps a fetch-based API surface.
  if (path === '/api/users') {
    return fetch(jsonUrl('../mock/users.json'), { cache: 'no-store' });
  }
  if (path === '/api/knock' && (init?.method || 'GET') === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return fetch(path, init);
}

export async function fetchUsers(): Promise<UserPublic[]> {
  const res = await apiFetch('/api/users');
  if (!res.ok) throw new Error(`users_fetch_failed:${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error('users_invalid');
  return data as UserPublic[];
}

export async function sendKnock(targetUserId: string): Promise<{ ok: boolean }> {
  const res = await apiFetch('/api/knock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  });
  if (!res.ok) return { ok: false };
  return (await res.json()) as { ok: boolean };
}

