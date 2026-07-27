# SynthDa — Sit & Reach offline validation

**Team standard:** use `cv-service/tools/` (same pattern as chair stand on branch `validation/synthda-chair-stand`).  
See **`../tools/README.md`** for video harness + manifest batch runs.

This folder keeps **JSONL landmark replay** for fast regression without re-running MediaPipe, plus a **provenance manifest** aligned with Yi Heng’s `source_type: real|synthda` style.

Workflow:
1. Export `.mp4` from SynthDa Colab (or film a session)
2. Run through **`tools/validate_sit_reach_video.py`** (team standard) **or** extract to JSONL here
3. Compare CV cm vs label (when labelled)

**MAE with a real ruler** (`../PROTOCOL.md`) remains the primary IWL accuracy report.

## Provenance (like chair-stand annotation pack)

See **`sit_reach_synthda_manifest.json`**:

- `source_type`: `synthda`
- Colab: Industry SynthDa Simplified Demo
- **seed:** `16428`
- Cases: `animation_front_left.mp4`, `animation_top_45.mp4`, `animation_back.mp4`

## Team alignment

```
cv-service/tools/
  validation_common.py
  validate_sit_reach_video.py
  run_sit_reach_validation_suite.py
  sit_reach_manifest.csv
```

Chair-stand reference branches: `validation/synthda-chair-stand`, `feat/cv/chair-stand-synthda-validation`.

## Setup SynthDa (Colab)

Industry demo notebook (multi-angle render; demo mode uses prepared poses):

https://colab.research.google.com/drive/150jzmeDh_8S7fw28umGom0QYrIE69Ct4

Full local NVIDIA stack (heavy): [SynthDa setup wiki](https://github.com/NVIDIA/synthda/wiki/1.-Setting-Up-SynthDa).

**Do not “Run all”** in the Industry notebook — stop at **Restart Kernel here!** then continue section by section.

## Sit-reach workflow

### 1. Labelled JSONL demo (30 seconds, no Colab)

```powershell
cd cv-service
python validation/synthda/generate_synth_sequences.py
python validation/synthda/batch_replay.py
```

Expect ~0 cm error on short / medium / long labelled clips.

### 2. From a real recording (MAE pilot)

```powershell
python validation/run_recording.py path\to\sr-p01.webm `
  --session sr-p01 `
  --environment bedroom `
  --age-group young_adult `
  --height 164 `
  --manual 12.5 `
  --notes "Desk webcam; sideways full leg"
```

### 3. From a SynthDa / Colab video

1. Place `.mp4` under `../videos/sit_reach/`
2. Validate with `tools/validate_sit_reach_video.py` (short clips: `--calibration-seconds 1 --countdown-seconds 0`)
3. Record case in `sit_reach_synthda_manifest.json` + `tools/sit_reach_manifest.csv`

### When to use SynthDa vs MAE

| Goal | Use |
|------|-----|
| IWL report: accuracy in real homes/centres | **MAE protocol** + ruler |
| Dev: “did our last commit break reach math?” | **JSONL replay** |
| Team parity: multi-angle SynthDa harness | **Colab renders** + video validator |
| Dev: tune form gates without filming | **JSONL / breaker angles** |

## Checklist

- [x] `extract_poses_from_video.py` — MediaPipe batch extract
- [x] `generate_synth_sequences.py` — labelled synthetic clips
- [x] `run_recording.py` — video → CV score → CSV
- [x] Multi-angle Colab renders validated via tools harness
- [x] Provenance manifest — `sit_reach_synthda_manifest.json` (seed `16428`)
- [x] Home MAE pilot locked (~3.6 cm post-fix, n=4)
- [ ] Optional: custom real-video → full SynthDa generate (if mates share upload cell)
