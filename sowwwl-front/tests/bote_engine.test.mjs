import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PHASES,
  createInjectionSchedule,
  isAllowedWord,
  pickInjectedWord,
} from '../assets/js/bote-engine.mjs';

test('schedule phases advance by quota', () => {
  const s = createInjectionSchedule(DEFAULT_PHASES);
  assert.equal(s.snapshot().intervalMs, 11000);
  assert.equal(s.snapshot().quota, 3);
  assert.equal(s.snapshot().phaseIndex, 0);

  s.recordInjection();
  s.recordInjection();
  const after2 = s.snapshot();
  assert.equal(after2.phaseIndex, 0);
  assert.equal(after2.injectedInPhase, 2);

  s.recordInjection(); // hits quota 3 -> phase2
  const after3 = s.snapshot();
  assert.equal(after3.phaseIndex, 1);
  assert.equal(after3.intervalMs, 8000);
  assert.equal(after3.injectedInPhase, 0);
  assert.equal(after3.quota, 2);

  s.recordInjection();
  s.recordInjection(); // hits quota 2 -> phase3
  assert.equal(s.snapshot().phaseIndex, 2);
  assert.equal(s.snapshot().intervalMs, 5000);
});

test('word filter length + banned', () => {
  const banned = new Set(['merde', 'google']);
  assert.equal(isAllowedWord('ok', banned), false);
  assert.equal(isAllowedWord('a'.repeat(20), banned), false);
  assert.equal(isAllowedWord('merde', banned), false);
  assert.equal(isAllowedWord('grain', banned), true);
});

test('pickInjectedWord respects recent and banned', () => {
  const dictionaries = {
    fr: ['grain', 'silence', 'merde', 'trop-long-mot-ici'],
    en: ['calm', 'google'],
  };
  const banned = new Set(['merde', 'google']);
  const recent = new Set(['grain']);

  const w = pickInjectedWord({ dictionaries, languages: ['fr', 'en'], banned, recent });
  assert.ok(w === 'silence' || w === 'calm');
});

