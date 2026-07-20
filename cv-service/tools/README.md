# CV validation tools (SynthDa / offline video harness)

Same pattern as teammate branch **`validation/synthda-chair-stand`** (chair stand) and back scratch.

Videos are run **frame-by-frame** through the real MediaPipe detectors + test strategy — not the live WebSocket app.

## Sit & reach files

| File | Purpose |
|------|---------|
| `validation_common.py` | Shared manifest CSV + JSON helpers |
| `validate_sit_reach_video.py` | Single video → pass/fail JSON |
| `run_sit_reach_validation_suite.py` | Batch run from manifest CSV |
| `sit_reach_manifest.template.csv` | Manifest template |

## Chair stand (teammate reference)

Branch: `origin/validation/synthda-chair-stand`

- `validate_chair_stand_video.py`
- `run_chair_stand_validation_suite.py`
- `inspect_validation_dataset.py`

## Quick start — sit & reach

### 1. Models (first run only)

MediaPipe `.task` files download to `cv-service/models/` automatically, or use Docker `/models/`.

### 2. Single SynthDa / recorded video

```powershell
cd cv-service/tools
python validate_sit_reach_video.py `
  --video ..\path\to\synthda_clip.mp4 `
  --expected-reach-cm 12.0 `
  --expected-validity valid_movement `
  --scenario full_reach `
  --camera-angle side `
  --user-height-cm 170 `
  --output-json ..\validation\output\clip_result.json
```

### 3. Batch suite (align with chair stand)

```powershell
cd cv-service/tools
python run_sit_reach_validation_suite.py `
  --manifest sit_reach_manifest.csv `
  --output-dir ..\validation\output\sit_reach `
  --summary-json ..\validation\output\sit_reach_summary.json
```

Manifest columns:

```
video_path,expected_reach_cm,expected_validity,scenario,camera_angle,user_height_cm,notes
```

`expected_validity`:

- `valid_movement` — CV reach should match `expected_reach_cm` (+/- tolerance)
- `invalid_movement` — label is what a *wrong* scorer might expect; use for regression cases
- `invalid_input` — black screen / no person → validator should **reject**

### 4. JSONL replay (optional, faster regression)

For landmark-only clips without re-running MediaPipe:

```powershell
cd cv-service
python validation/synthda/generate_synth_sequences.py
python validation/synthda/batch_replay.py
```

## MAE pilot (real ruler)

Still use `validation/run_recording.py` + `ground_truth.pilot.csv` for IWL reporting.

## Team alignment checklist

- [ ] Share SynthDa export folder layout with JH (back scratch) / Yi Heng (chair stand)
- [ ] Use same `validation_common.py` manifest CSV pattern
- [ ] Store clips under `validation/videos/sit_reach/` (gitignore large files)
- [ ] Commit manifest + summary JSON, not raw `.mp4` files
