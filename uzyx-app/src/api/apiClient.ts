export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiErr = { ok: false; status: number; data: any };
export type ApiResult<T> = ApiOk<T> | ApiErr;

const API_BASE = "/api";

let csrf: string | null = null;

export function getCsrf(): string | null {
  return csrf;
}

export function setCsrf(next: string | null): void {
  csrf = next && String(next).trim() ? String(next).trim() : null;
}

async function readJsonOrText(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: any; csrf?: boolean } = {}
): Promise<ApiResult<T>> {
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
    return res.ok ? ({ ok: true, status: res.status, data } as ApiOk<T>) : ({ ok: false, status: res.status, data } as ApiErr);
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: "network_error", detail: String(e?.message || e || "network") } };
  }
}

export type MeResponse = {
  user: {
    id: number;
    email: string;
    handle: string;
    comm_address: string;
    state_o?: string;
    flip_seq?: number;
  };
  csrf?: string;
};

export async function apiMe(): Promise<ApiResult<MeResponse>> {
  const r = await apiRequest<MeResponse>("/me", { method: "GET" });
  if (r.ok) {
    const token = (r.data as any)?.csrf;
    if (typeof token === "string") setCsrf(token);
  }
  return r;
}

export async function apiAuthRegister(email: string, code: string): Promise<ApiResult<any>> {
  return apiRequest("/auth/register", { method: "POST", json: { email, password: code } });
}

export async function apiAuthLogin(email: string, code: string): Promise<ApiResult<any>> {
  return apiRequest("/auth/login", { method: "POST", json: { email, password: code } });
}

export async function apiAuthLogout(): Promise<ApiResult<any>> {
  // The API currently does not require CSRF for logout.
  return apiRequest("/auth/logout", { method: "POST", json: {} });
}

export type LandGetResponse = {
  created: boolean;
  land: {
    land_type: "A" | "B" | "C" | null;
    token?: string | null;
    glyph?: string | null;
    updated_at?: string | null;
  };
};

export async function apiLandGet(): Promise<ApiResult<LandGetResponse>> {
  return apiRequest("/land", { method: "GET" });
}

export async function apiLandCreate(land_type: "A" | "B" | "C"): Promise<ApiResult<any>> {
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
  land_type: "A" | "B" | "C" | null;
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

export async function apiLandStateSave(payload: LandStateSavePayload): Promise<ApiResult<any>> {
  return apiRequest("/land/state", { method: "POST", json: payload, csrf: true });
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

export async function apiQuestDeltaGet(): Promise<ApiResult<QuestDeltaGetResponse>> {
  return apiRequest("/quest/delta", { method: "GET" });
}

export async function apiQuestDeltaStart(): Promise<ApiResult<any>> {
  return apiRequest("/quest/delta/start", { method: "POST", json: {}, csrf: true });
}

export async function apiQuestDeltaAnswer(answer: string): Promise<ApiResult<any>> {
  return apiRequest("/quest/delta/answer", { method: "POST", json: { answer }, csrf: true });
}

export async function apiQuestDeltaEnd(): Promise<ApiResult<any>> {
  return apiRequest("/quest/delta/end", { method: "POST", json: {}, csrf: true });
}
