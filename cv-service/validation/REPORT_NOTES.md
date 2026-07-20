# Sit & Reach — report snippets (for midway / final write-up)

Copy sections into your group report when ready.

---

## Usability vs validity

Strict leg-form gating improves measurement validity but hurts usability on uneven surfaces. We implemented **tiered scoring**:

- **Practice reach (grey)** — always shown while the user extends, even when form is imperfect
- **Official score (green)** — only from valid straight-leg holds locked for 2 seconds
- **Recording paused** — explicit feedback when form blocks official scoring (not a silent blank screen)

**Home vs clinic mode:** home uses slightly relaxed knee/alignment thresholds (155° vs 160°, 12% vs 10% line deviation) for uneven floors; clinic keeps strict clinical gates.

**Confidence flags:** low calibration quality or home environment can flag *"clinician review recommended"* while still returning a score.

---

## Gamification (sit & reach)

- **Reach for the star** — star stays fixed above the toe line; shines when reach reaches the feet (0 cm)
- **Distance bar** — fills toward the toes; brightens when the star is reached
- **Hold meter** — 2-second lock-in shown as a progress bar (*"Hold steady!"*)
- **Sidekick buddy** — simple on-screen character mirrors reach extension for engagement

**Design guardrails:** rewards tie to valid reps for the official score; practice reach is visible but labelled separately; UI explains why recording paused.

---

## SynthDa smoke test (Option A)

Ran 3 Industry Demo fall clips through offline validator:

| Clip | Result |
|------|--------|
| `animation_front_left` | Completed — pose pipeline OK |
| `animation_back` | Calibration failed — unsuitable back angle |
| `animation_top_45` | Calibration failed — top-down unsuitable |

Confirms harness works; fall demos are infrastructure smoke tests only, not sit-reach MAE ground truth.

---

## Live demo (Option C)

Developer CV Sandbox + Docker cv-service: live sit-reach with webcam, form hints, and tiered scoring validated end-to-end.

---

## Future work (Option B / D)

- **MAE pilot:** 5 ruler-labelled sessions (`ground_truth.pilot.csv`)
- **SynthDa sit-reach:** Brev Template with own seed video (not Industry fall demo)
