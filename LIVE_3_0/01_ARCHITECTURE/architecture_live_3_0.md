# Architecture LIVE_3_0

## Vue d'ensemble
LIVE_3_0 est structure autour de trois machines (son, moteurs, lumiere) et d'une couche de controle (iPad + RPi). Le routage relie audio, OSC, MIDI et DMX.

## Couches (rappel 5 strates)
- Experience: dramaturgie, public, intention
- Interfaces: iPad, gestures/voix (a preciser)
- Logique: scenes, timelines, mappings
- Signal: audio/OSC/MIDI/DMX, reseau
- Materiel: machines, RPi, projecteur, hazer

## Liens
- `05_MACHINES/schema_global_trilogie.md`
- `09_AUDIO_ROUTING/master_structure.md`
- `07_IPAD_CONTROL/osc_mapping.md`

## Open questions
- Clock master et sync globale
- Failover et mode degrade
