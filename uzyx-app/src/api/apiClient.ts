export type ApiPayload = Record<string, unknown>;
export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiErr<E = ApiPayload> = { ok: false; status: number; data: E };
export type ApiResult<T, E = ApiPayload> = ApiOk<T> | ApiErr<E>;

const API_BASE = "/api";

let csrf: string | null = null;

export function getCsrf(): string | null {
  return csrf;
}

export function setCsrf(next: string | null): void {
  csrf = next && String(next).trim() ? String(next).trim() : null;
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiRequest<T, E extends ApiPayload = ApiPayload>(
  path: string,
  init: RequestInit & { json?: unknown; csrf?: boolean } = {}
): Promise<ApiResult<T, E>> {
  const url = API_BASE + path;
  const headers = new Headers(init.headers || {});

  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  if (init.csrf) {
    const t = getCsrf();
    if (t) headers.set("x-csrf", t);
  }

  try {
    const res = await fetch(url, {
      ...init,
      body,
      headers,
      credentials: "include",
    });
    const data = await readJsonOrText(res);
    return res.ok ? ({ ok: true, status: res.status, data } as ApiOk<T>) : ({ ok: false, status: res.status, data } as ApiErr<E>);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e || "network");
    return { ok: false, status: 0, data: { error: "network_error", detail } as unknown as E };
  }
}

export type MeResponse = {
  user: {
    id: number;
    email: string;
    handle: string;
    comm_address: string;
    network_admin?: boolean;
    state_o?: string;
    flip_seq?: number;
  };
  csrf?: string;
};

export async function apiMe(): Promise<ApiResult<MeResponse>> {
  const r = await apiRequest<MeResponse>("/me", { method: "GET" });
  if (r.ok) {
    if (typeof r.data.csrf === "string") setCsrf(r.data.csrf);
  }
  return r;
}

export async function apiAuthRegister(email: string, code: string): Promise<ApiResult<ApiPayload>> {
  return apiRequest("/auth/register", { method: "POST", json: { email, password: code } });
}

export async function apiAuthLogin(email: string, code: string): Promise<ApiResult<ApiPayload>> {
  return apiRequest("/auth/login", { method: "POST", json: { email, password: code } });
}

export async function apiAuthLogout(): Promise<ApiResult<ApiPayload>> {
  // The API currently does not require CSRF for logout.
  return apiRequest("/auth/logout", { method: "POST", json: {} });
}

export type SoulTokenGetResponse = {
  token_set: boolean;
  token_hint?: string;
  config?: ApiPayload | null;
  updated_at?: string | null;
};

export type SoulTokenSetResponse = {
  ok: true;
  token_hint: string;
};

export type SoulUploadResponse = {
  ok: true;
  upload_id: number;
  archive: {
    name: string;
    bytes: number;
    sha256: string;
  };
  stored: {
    scope: "soul.cloud";
    path: string;
    manifest: boolean;
  };
};

export async function apiSoulTokenGet(): Promise<ApiResult<SoulTokenGetResponse>> {
  return apiRequest("/soul/token", { method: "GET" });
}

export async function apiSoulTokenSet(token: string, config?: unknown): Promise<ApiResult<SoulTokenSetResponse>> {
  const payload: Record<string, unknown> = { token };
  if (config !== undefined) payload.config = config;
  return apiRequest("/soul/token", { method: "POST", json: payload, csrf: true });
}

export async function apiSoulUpload(archive: File, manifest?: unknown): Promise<ApiResult<SoulUploadResponse>> {
  const form = new FormData();
  form.set("archive", archive, archive.name);
  if (manifest !== undefined) {
    form.set("manifest_json", JSON.stringify(manifest));
  }
  return apiRequest("/soul/upload", { method: "POST", body: form, csrf: true });
}

export type LandType = "A" | "B" | "C";

export type LandGetResponse = {
  created: boolean;
  land: {
    land_type: LandType | null;
    token?: string | null;
    glyph?: string | null;
    updated_at?: string | null;
  };
};

export async function apiLandGet(): Promise<ApiResult<LandGetResponse>> {
  return apiRequest("/land", { method: "GET" });
}

export async function apiLandCreate(land_type: LandType): Promise<ApiResult<ApiPayload>> {
  return apiRequest("/land/create", { method: "POST", json: { land_type }, csrf: true });
}

export type LandTheme = {
  glyph: string;
  hue: number;
  sat: number;
  lum: number;
  contrast: number;
  invertOnClick: boolean;
  theme_updated_at?: string | null;
};

export type LandThemeGetResponse = {
  theme: LandTheme | null;
};

export async function apiLandThemeGet(): Promise<ApiResult<LandThemeGetResponse>> {
  return apiRequest("/land/theme", { method: "GET" });
}

export type LandStateGetResponse = {
  land_type: LandType | null;
  lambda: number | null;
  beaute_text: string | null;
  beaute_updated_at: string | null;
};

export async function apiLandStateGet(): Promise<ApiResult<LandStateGetResponse>> {
  return apiRequest("/land/state", { method: "GET" });
}

export type LandStateSavePayload = {
  lambda?: number;
  beaute_text?: string;
};

export async function apiLandStateSave(payload: LandStateSavePayload): Promise<ApiResult<ApiPayload>> {
  return apiRequest("/land/state", { method: "POST", json: payload, csrf: true });
}

export type Qu3stGetResponse = {
  qu3st: {
    content: string;
    updated_at?: string | null;
  };
};

export type Qu3stSaveResponse = {
  status: "saved";
};

export async function apiQu3stGet(): Promise<ApiResult<Qu3stGetResponse>> {
  return apiRequest("/qu3st", { method: "GET" });
}

export async function apiQu3stSave(content: string): Promise<ApiResult<Qu3stSaveResponse>> {
  return apiRequest("/qu3st", { method: "POST", json: { content }, csrf: true });
}

export type QuestDeltaState = "IDLE" | "RUNNING" | "ENDED";

export type QuestDeltaAnswers = {
  beauty_text?: string | null;
  coherence_score?: number | null;
  passage_choice?: string | null;
  land_glyph?: string | null;
  o_seed_line?: string | null;
  seal?: string | null;
};

export type QuestDeltaGetResponse = {
  state: QuestDeltaState;
  step: number;
  answers: QuestDeltaAnswers;
  updated_at?: string | null;
};

export type QuestDeltaStartResponse = {
  state: "RUNNING";
  step: number;
};

export type QuestDeltaAnswerResponse = {
  ok: boolean;
  step: number;
  hint?: string;
  error?: string;
  max_words?: number;
  score?: number;
  ready_to_end?: boolean;
  glyph?: string;
  land_type?: LandType;
};

export type QuestDeltaEndResponse = {
  status: "ended";
  seal?: string;
  flip_seq?: number;
  theme?: LandTheme | null;
  bote_unlock_until?: string | null;
};

export async function apiQuestDeltaGet(): Promise<ApiResult<QuestDeltaGetResponse>> {
  return apiRequest("/quest/delta", { method: "GET" });
}

export async function apiQuestDeltaStart(): Promise<ApiResult<QuestDeltaStartResponse>> {
  return apiRequest("/quest/delta/start", { method: "POST", json: {}, csrf: true });
}

export async function apiQuestDeltaAnswer(answer: string): Promise<ApiResult<QuestDeltaAnswerResponse>> {
  return apiRequest("/quest/delta/answer", { method: "POST", json: { answer }, csrf: true });
}

export async function apiQuestDeltaEnd(): Promise<ApiResult<QuestDeltaEndResponse>> {
  return apiRequest("/quest/delta/end", { method: "POST", json: {}, csrf: true });
}
