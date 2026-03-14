import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LandTheme, QuestDeltaAnswerResponse, QuestDeltaEndResponse, QuestDeltaGetResponse, QuestDeltaStartResponse } from "@/api/apiClient";
import { QuestDeltaPanel } from "../QuestDeltaPanel";

const mocks = vi.hoisted(() => ({
  apiQuestDeltaGet: vi.fn(),
  apiQuestDeltaStart: vi.fn(),
  apiQuestDeltaAnswer: vi.fn(),
  apiQuestDeltaEnd: vi.fn(),
  getCsrf: vi.fn(),
  dispatch: vi.fn(),
  applyLandTheme: vi.fn(),
}));

vi.mock("@/api/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/api/apiClient")>("@/api/apiClient");
  return {
    ...actual,
    apiQuestDeltaGet: mocks.apiQuestDeltaGet,
    apiQuestDeltaStart: mocks.apiQuestDeltaStart,
    apiQuestDeltaAnswer: mocks.apiQuestDeltaAnswer,
    apiQuestDeltaEnd: mocks.apiQuestDeltaEnd,
    getCsrf: mocks.getCsrf,
  };
});

vi.mock("@/oNote/oNote.hooks", () => ({
  useOEvent: () => mocks.dispatch,
}));

vi.mock("@/theme/landTheme", () => ({
  applyLandTheme: mocks.applyLandTheme,
}));

vi.mock("@/quest/questVoiceAgent", () => ({
  useQuestVoiceAgent: () => ({
    activate: () => false,
    holdHandlers: {
      onPointerDown: () => undefined,
      onPointerMove: () => undefined,
      onPointerUp: () => undefined,
      onPointerCancel: () => undefined,
    },
  }),
}));

vi.mock("@/quest/QuestStep2Strates", () => ({
  QuestStep2Strates: () => <div data-testid="quest-step-2">step2</div>,
}));

function ok<T>(data: T) {
  return { ok: true as const, status: 200, data };
}

function fail(status: number, data: Record<string, unknown>) {
  return { ok: false as const, status, data };
}

function questState(state: QuestDeltaGetResponse["state"], step: number, answers: QuestDeltaGetResponse["answers"] = {}): QuestDeltaGetResponse {
  return { state, step, answers };
}

describe("QuestDeltaPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCsrf.mockReturnValue("csrf-token");
    mocks.apiQuestDeltaGet.mockResolvedValue(ok(questState("IDLE", 0)));
    mocks.apiQuestDeltaStart.mockResolvedValue(ok<QuestDeltaStartResponse>({ state: "RUNNING", step: 1 }));
  });

  it("renders the step 2 strates block only when step 2 is active", async () => {
    mocks.apiQuestDeltaGet.mockResolvedValueOnce(ok(questState("RUNNING", 2)));

    render(<QuestDeltaPanel landType={null} refreshSession={() => undefined} />);

    expect(await screen.findByTestId("quest-step-2")).toBeInTheDocument();
  });

  it("refreshes the session instead of starting when csrf is missing", async () => {
    const refreshSession = vi.fn();
    mocks.getCsrf.mockReturnValue(null);

    render(<QuestDeltaPanel landType={null} refreshSession={refreshSession} />);

    fireEvent.click(await screen.findByRole("link", { name: "start delta" }));

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.apiQuestDeltaStart).not.toHaveBeenCalled();
    expect(await screen.findByText("csrf: …")).toBeInTheDocument();
  });

  it("surfaces initial sync network failures", async () => {
    mocks.apiQuestDeltaGet.mockResolvedValueOnce(fail(0, { error: "network_error" }));

    render(<QuestDeltaPanel landType={null} refreshSession={() => undefined} />);

    expect(await screen.findByText("réseau: fragile")).toBeInTheDocument();
    expect(mocks.dispatch).toHaveBeenCalledWith("network_error");
  });

  it("sends the inferred passage from the land type at step 3", async () => {
    mocks.apiQuestDeltaGet
      .mockResolvedValueOnce(ok(questState("RUNNING", 3)))
      .mockResolvedValueOnce(ok(questState("RUNNING", 4, { passage_choice: "culbu1on" })));
    mocks.apiQuestDeltaAnswer.mockResolvedValueOnce(ok<QuestDeltaAnswerResponse>({ ok: true, step: 4 }));

    render(<QuestDeltaPanel landType="A" refreshSession={() => undefined} />);

    fireEvent.click(await screen.findByRole("link", { name: "passage" }));

    await waitFor(() => expect(mocks.apiQuestDeltaAnswer).toHaveBeenCalledWith("c"));
    expect(await screen.findByRole("textbox", { name: "answer" })).toBeInTheDocument();
  });

  it("shows land type conflicts returned at step 3", async () => {
    mocks.apiQuestDeltaGet.mockResolvedValueOnce(ok(questState("RUNNING", 3))).mockResolvedValueOnce(ok(questState("RUNNING", 3)));
    mocks.apiQuestDeltaAnswer.mockResolvedValueOnce(
      ok<QuestDeltaAnswerResponse>({ ok: false, step: 3, error: "land_type_conflict", land_type: "B" })
    );

    render(<QuestDeltaPanel landType={null} refreshSession={() => undefined} />);

    fireEvent.click(await screen.findByRole("link", { name: "passage c" }));

    expect(await screen.findByText("land_type_conflict")).toBeInTheDocument();
  });

  it("auto-ends after a valid seed and applies the returned theme", async () => {
    const theme: LandTheme = {
      glyph: "δ",
      hue: 51,
      sat: 34,
      lum: 76,
      contrast: 1.24,
      invertOnClick: true,
    };

    mocks.apiQuestDeltaGet
      .mockResolvedValueOnce(ok(questState("RUNNING", 5, { land_glyph: "δ" })))
      .mockResolvedValueOnce(ok(questState("RUNNING", 5, { land_glyph: "δ", o_seed_line: "O. seed" })))
      .mockResolvedValueOnce(ok(questState("ENDED", 0, { seal: "Δ", land_glyph: "δ", o_seed_line: "O. seed" })));
    mocks.apiQuestDeltaAnswer.mockResolvedValueOnce(ok<QuestDeltaAnswerResponse>({ ok: true, step: 5, ready_to_end: true }));
    mocks.apiQuestDeltaEnd.mockResolvedValueOnce(ok<QuestDeltaEndResponse>({ status: "ended", seal: "Δ", theme }));

    render(<QuestDeltaPanel landType={null} refreshSession={() => undefined} />);

    const input = await screen.findByRole("textbox", { name: "answer" });
    fireEvent.change(input, { target: { value: "O. seed" } });
    fireEvent.click(screen.getByRole("link", { name: "send answer" }));

    await waitFor(() => expect(mocks.apiQuestDeltaAnswer).toHaveBeenCalledWith("O. seed"));
    await waitFor(() => expect(mocks.apiQuestDeltaEnd).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.applyLandTheme).toHaveBeenCalledWith(theme));
    expect(await screen.findByText("seal:Δ")).toBeInTheDocument();
  });

  it("shows seed validation errors returned at step 5", async () => {
    mocks.apiQuestDeltaGet.mockResolvedValueOnce(ok(questState("RUNNING", 5))).mockResolvedValueOnce(ok(questState("RUNNING", 5)));
    mocks.apiQuestDeltaAnswer.mockResolvedValueOnce(ok<QuestDeltaAnswerResponse>({ ok: false, step: 5, error: "must_start_with_O" }));

    render(<QuestDeltaPanel landType={null} refreshSession={() => undefined} />);

    const input = await screen.findByRole("textbox", { name: "answer" });
    fireEvent.change(input, { target: { value: "seed" } });
    fireEvent.click(screen.getByRole("link", { name: "send answer" }));

    expect(await screen.findByText("must_start_with_O")).toBeInTheDocument();
  });
});
