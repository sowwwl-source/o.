import type { OCopy, OScore } from "./oNote.types";

export const O_COPY_TABLE: Record<OScore, OCopy> = {
  0: { o: 0, mode: "glyph", text: "O" },
  1: { o: 1, mode: "micro", text: "Entre." },
  2: { o: 2, mode: "micro", text: "Valide." },
  3: { o: 3, mode: "short", text: "Un geste." },
  4: { o: 4, mode: "short", text: "Ancre-toi ici." },
  5: { o: 5, mode: "short", text: "Entre dans l’eau." },
  6: { o: 6, mode: "short", text: "Un geste suffit." },
  7: { o: 7, mode: "short", text: "Qui es-tu ?" },
  8: { o: 8, mode: "short", text: "Pose ton empreinte." },
  9: { o: 9, mode: "plain", text: "Aucun mot de passe." },
  10: { o: 10, mode: "plain", text: "Ton téléphone est la clé." },
  11: { o: 11, mode: "plain", text: "Valide avec Face ID / Touch ID." },
};

