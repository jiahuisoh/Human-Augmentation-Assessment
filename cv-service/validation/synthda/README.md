# SynthDa — Sit & Reach offline validation

**Team standard:** use `cv-service/tools/` (same pattern as chair stand on branch `validation/synthda-chair-stand`).  
See **`../tools/README.md`** for video harness + manifest batch runs.

This folder keeps **JSONL landmark replay** for fast regression without re-running MediaPipe.

Workflow:
1. Export `.mp4` from SynthDa (or film a session)
2. Run through **`tools/validate_sit_reach_video.py`** (team standard) **or** extract to JSONL here
3. Compare CV cm vs label

**MAE with a real ruler** (`../PROTOCOL.md`) remains the primary IWL accuracy report.

## Team alignment

Same layout as **`validation/synthda-chair-stand`** (chair stand) and back scratch:

```
cv-service/tools/
  validation_common.py              # shared with chair stand
  validate_sit_reach_video.py       # sit-reach single video
  run_sit_reach_validation_suite.py # batch manifest
  sit_reach_manifest.template.csv
  inspect_validation_dataset.py     # shared video QA
```

## Setup SynthDa (when ready)

Follow [NVIDIA SynthDa setup wiki](https://github.com/NVIDIA/synthda/wiki/1.-Setting-Up-SynthDa).

Requirements are heavy (GPU, conda, several repos). Coordinate with whoever on the team already cloned it — **reuse their env** before duplicating setup.

## Sit-reach workflow

### 1. Demo without SynthDa (30 seconds)

```powershell
cd cv-service
python validation/synthda/generate_synth_sequences.py
python validation/synthda/batch_replay.py
```

### 2. From a real recording (MAE pilot)

Film with phone/webcam → save as `.webm` or `.mp4`, then one command:

```powershell
python validation/run_recording.py path\to\sr-p01.webm `
  --session sr-p01 `
  --environment bedroom `
  --age-group young_adult `
  --height 170 `
  --manual 12.5 `
  --notes "Desk webcam; sideways full leg"
```

This extracts landmarks → replays strategy → logs CSV → prints MAE.

Or step-by-step:

```powershell
python validation/synthda/extract_poses_from_video.py sr-p01.webm `
  --out validation/synthda/sequences/sr-p01.jsonl --label-reach 12.5 --session sr-p01
python validation/synthda/replay_landmarks.py validation/synthda/sequences/sr-p01.jsonl --height 170
python validation/record_session.py --session sr-p01 ... --manual 12.5 --cv <output>
```

### 3. From a SynthDa video

1. Export video (`.mp4`) from SynthDa or film a session
2. Run MediaPipe pose + hands on each frame (team script or notebook — align with mates)
3. Save one JSONL line per frame:

```json
{"elapsed_ms": 2500, "pose": [[x,y,z,vis], ...], "hands": [[[...]]], "label_reach_cm": 12.0}
```

4. Replay:

```powershell
python validation/synthda/replay_landmarks.py validation/synthda/sequences/my_clip.jsonl --height 170
```

### 3. When to use SynthDa vs MAE

| Goal | Use |
|------|-----|
| IWL report: accuracy in real homes/centres | **MAE protocol** + ruler |
| Dev: “did our last commit break reach math?” | **SynthDa replay** |
| Dev: tune form gates without filming | **SynthDa replay** |

## Next steps (after MAE pilot)

- [x] `extract_poses_from_video.py` — MediaPipe batch extract (models auto-download)
- [x] `generate_synth_sequences.py` — labelled synthetic clips
- [x] `run_recording.py` — video → CV score → CSV in one shot
- [ ] Agree JSONL export format with teammates (share one chair-stand example)
- [ ] 2–3 real SynthDa sit-reach clips with `label_reach_cm` when team env is ready
