// Web Speech API voice with immediate stop on user action.
// Voice: low volume, no chime, neutral.

let speaking = false;
let currentUtter: SpeechSynthesisUtterance | null = null;

export function stopVoice(): void {
  speaking = false;
  currentUtter = null;
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {}
}

export function isSpeaking(): boolean {
  return speaking;
}

export type SpeakParams = {
  text: string;
  note: number; // 0..9 (rhythm)
  towardO: boolean; // prosody capacity
};

function computeRate(note: number): number {
  // high note (near O) => slower, calmer
  // range: 0.72..0.98
  const t = note / 9;
  return 0.98 - t * 0.26;
}

function computePitch(note: number, towardO: boolean): number {
  // towardO => slightly more "present" but still subtle
  const base = 0.92 + (note / 9) * 0.10; // 0.92..1.02
  return towardO ? Math.min(1.10, base + 0.06) : base;
}

function computeVolume(note: number): number {
  // always low: 0.14..0.28
  const t = note / 9;
  return 0.14 + t * 0.14;
}

export function speakVoice(p: SpeakParams): boolean {
  if (typeof window === "undefined") return false;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;

  stopVoice();

  const utter = new SpeechSynthesisUtterance(p.text);
  utter.rate = computeRate(p.note);
  utter.pitch = computePitch(p.note, p.towardO);
  utter.volume = computeVolume(p.note);

  // Choose a voice that sounds neutral if available.
  // Do not hardcode language; keep it subtle.
  try {
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /neutral|compact/i.test(v.name)) ??
      voices.find((v) => /fr|en/i.test(v.lang)) ??
      voices[0];
    if (preferred) utter.voice = preferred;
  } catch {}

  speaking = true;
  currentUtter = utter;

  utter.onend = () => {
    speaking = false;
    currentUtter = null;
  };
  utter.onerror = () => {
    speaking = false;
    currentUtter = null;
  };

  window.speechSynthesis.speak(utter);
  return true;
}
