# CV validation tools (SynthDa / offline video harness)

Same pattern as teammate branch **`validation/synthda-chair-stand`** (chair stand) and
`feat/cv/chair-stand-synthda-validation` (annotation / `source_type: real|synthda`).

Videos are run **frame-by-frame** through the real MediaPipe detectors + test strategy — not the live WebSocket app.

## Sit & reach files

| File | Purpose |
|------|---------|
| `validation_common.py` | Shared manifest CSV + JSON helpers |
| `validate_sit_reach_video.py` | Single video → pass/fail JSON |
| `run_sit_reach_validation_suite.py` | Batch run from manifest CSV |
| `sit_reach_manifest.csv` | Active sit-reach clip list (incl. SynthDa angles) |
| `sit_reach_manifest.template.csv` | Empty template |
| `validate_one_clip.ps1` | PowerShell helper for one clip |

Provenance (seed / `source_type`): `../validation/synthda/sit_reach_synthda_manifest.json`

## Chair stand (teammate reference)

Branches:

- `origin/validation/synthda-chair-stand` — video harness
- `origin/feat/cv/chair-stand-synthda-validation` — annotation pack + SynthDa provenance fields

## Quick start — sit & reach

### 1. Models (first run only)

MediaPipe `.task` files download to `cv-service/models/` automatically, or use Docker `/models/`.

### 2. Single SynthDa / recorded video

Short Industry-demo renders (~4 s / 129 frames) need shorter calib/countdown:

```powershell
cd cv-service/tools
python validate_sit_reach_video.py `
  --video ..\validation\videos\sit_reach\animation_front_left.mp4 `
  --expected-reach-cm 0 `
  --expected-validity valid_movement `
  --scenario synthda_multi_angle `
  --camera-angle front_left `
  --user-height-cm 164 `
  --calibration-seconds 1 `
  --countdown-seconds 0 `
  --output-json ..\validation\output\animation_front_left_result.json
```

Longer real recordings:

```powershell
.\validate_one_clip.ps1 `
  -Video "..\validation\videos\sit_reach\sr-p01.webm" `
  -ExpectedReachCm 12.5 `
  -HeightCm 164
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
- `invalid_movement` — non-side / breaker angles (form fail is informative)
- `invalid_input` — black screen / no person → validator should **reject**

### 4. JSONL replay (optional, faster regression)

```powershell
cd cv-service
python validation/synthda/generate_synth_sequences.py
python validation/synthda/batch_replay.py
```

## MAE pilot (real ruler)

```powershell
cd cv-service
python validation/compute_mae.py validation/ground_truth.pilot.post_fix.csv
```

See `../validation/PROTOCOL.md`.

## Team alignment checklist

- [x] Mirror chair-stand harness pattern (`validate_*_video.py` + manifest CSV)
- [x] Store clips under `validation/videos/sit_reach/` (gitignore large files)
- [x] SynthDa provenance manifest with `source_type` + seed (`sit_reach_synthda_manifest.json`)
- [x] Commit manifests / summary JSON; keep raw `.mp4` local when large
- [ ] Optional: share JSONL export format with JH / Yi Heng
