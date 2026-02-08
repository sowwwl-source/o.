import type { SessionIntent, UserPublic } from './users';

export type SocialState =
  | { kind: 'IDLE' }
  | { kind: 'KNOCKING'; targetUserId: string }
  | { kind: 'COUR'; targetUserId: string }
  | { kind: 'SALOON'; targetUserId: string }
  | { kind: 'FILES'; targetUserId: string };

export type OverlayAPI = {
  setPanel(panel: { title: string; body: string; actions: Array<{ id: string; label: string }> } | null): void;
};

export class SocialStateMachine {
  private state: SocialState = { kind: 'IDLE' };
  private intent: SessionIntent = { mode: null };
  private readonly overlay: OverlayAPI;
  private readonly usersById: Map<string, UserPublic>;

  constructor(overlay: OverlayAPI, users: UserPublic[]) {
    this.overlay = overlay;
    this.usersById = new Map(users.map((u) => [u.id, u]));
  }

  getState() {
    return this.state;
  }

  getIntent() {
    return this.intent;
  }

  knock(targetUserId: string) {
    this.state = { kind: 'KNOCKING', targetUserId };
    this.intent = { mode: null, targetUserId };
    this.showHostReply(targetUserId);
  }

  private showHostReply(targetUserId: string) {
    const u = this.usersById.get(targetUserId);
    const name = u ? u.publicCourName : targetUserId;
    this.overlay.setPanel({
      title: 'Reponse hote',
      body: `D0RS: ${name}\n\n1) REFUSER\n2) OUVRIR COUR\n3) PARLER\n4) RENTRER`,
      actions: [
        { id: 'REFUSE', label: 'REFUSER' },
        { id: 'COUR', label: 'OUVRIR COUR' },
        { id: 'SALOON', label: 'PARLER' },
        { id: 'FILES', label: 'RENTRER' },
      ],
    });
  }

  act(actionId: string) {
    const s = this.state;
    if (s.kind === 'IDLE') return;
    const targetUserId = (s as any).targetUserId as string;

    if (actionId === 'REFUSE') {
      this.state = { kind: 'IDLE' };
      this.intent = { mode: null };
      this.overlay.setPanel(null);
      return;
    }

    if (actionId === 'COUR') {
      this.state = { kind: 'COUR', targetUserId };
      this.intent = { mode: 'COUR', targetUserId };
      this.overlay.setPanel({
        title: 'COUR',
        body: 'Espace public (placeholder).\nAucun historique force.\nAucune interaction privee ici.',
        actions: [{ id: 'CLOSE', label: 'FERMER' }],
      });
      return;
    }

    if (actionId === 'SALOON') {
      this.state = { kind: 'SALOON', targetUserId };
      this.intent = { mode: 'SALOON', targetUserId };
      this.overlay.setPanel({
        title: 'SALOON',
        body: 'Texte temps reel (placeholder).\nAudio/video viendront apres.',
        actions: [{ id: 'CLOSE', label: 'FERMER' }],
      });
      return;
    }

    if (actionId === 'FILES') {
      this.state = { kind: 'FILES', targetUserId };
      this.intent = { mode: 'FILES', targetUserId };
      this.overlay.setPanel({
        title: 'FILES',
        body: 'Acces temporaire (placeholder).\nPas de duplication, juste une entree.',
        actions: [{ id: 'CLOSE', label: 'FERMER' }],
      });
      return;
    }

    if (actionId === 'CLOSE') {
      this.state = { kind: 'IDLE' };
      this.intent = { mode: null };
      this.overlay.setPanel(null);
    }
  }
}

