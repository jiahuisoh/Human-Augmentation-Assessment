# Sit & Reach validation videos

Put SynthDa exports or phone recordings here. **Videos are gitignored** — only manifests and result JSON go in git.

## Step 1 — Get a clip (pick one)

### Option A — From a teammate (fastest)

Ask in your group chat (copy/paste):

> Hey — I'm wiring up sit-reach SynthDa validation in `cv-service/tools/` (same pattern as chair stand on `validation/synthda-chair-stand`).  
> Can you share:
> 1. One exported `.mp4` I can use as a reference  
> 2. Your folder path (e.g. `validation/videos/chair_stand/`)  
> 3. One row from your manifest CSV  
>
> I'll mirror the layout for sit-reach under `validation/videos/sit_reach/`.

Save their file here, e.g.:

```
cv-service/validation/videos/sit_reach/teammate_clip_01.mp4
```

### Option B — Film yourself (works today, no SynthDa)

1. Phone or laptop **sideways** — full test leg + hands visible  
2. Sit & reach, hold max reach ~2 seconds  
3. Measure ruler at toe line → note **manual cm** (e.g. `12.5`)  
4. Save video as `sr-p01.webm` or `.mp4` in this folder  

This is valid for the validator; use your ruler measurement as `--expected-reach-cm`.

### Option C — Export from SynthDa yourself

1. Clone / use teammate's SynthDa env: [NVIDIA SynthDa setup](https://github.com/NVIDIA/synthda/wiki/1.-Setting-Up-SynthDa)  
2. Generate or pick a **sit-and-reach / forward reach** motion clip (side camera if possible)  
3. Export **`.mp4`** (not `.fbx` alone — the validator needs video frames)  
4. Note the **labelled reach distance in cm** if SynthDa provides it; otherwise use a ruler on a real take later  

Save as:

```
cv-service/validation/videos/sit_reach/synthda_01.mp4
```

---

## Step 2 — Run single-video validation

From repo root, in PowerShell:

```powershell
cd cv-service\tools
.\validate_one_clip.ps1 `
  -Video "..\validation\videos\sit_reach\sr-p01.webm" `
  -ExpectedReachCm 12.5 `
  -HeightCm 170
```

Or without the helper script:

```powershell
cd cv-service\tools
python validate_sit_reach_video.py `
  --video "..\validation\videos\sit_reach\sr-p01.webm" `
  --expected-reach-cm 12.5 `
  --expected-validity valid_movement `
  --scenario full_reach `
  --camera-angle side `
  --user-height-cm 170 `
  --output-json "..\validation\output\sr-p01_result.json" `
  --debug-csv "..\validation\output\sr-p01_debug.csv"
```

**First run** downloads MediaPipe models (~15 MB) to `cv-service/models/`.

### Reading the result

- `"passed": true` — CV reach within **3 cm** of expected  
- `"predicted_reach_cm"` — what your strategy scored  
- `"reach_error_cm"` — CV minus label  
- `"status": "completed"` — video processed end-to-end  
- If `calibration_failed` or `no_pose_detected` — refilm sideways with full leg visible  

Results go to `cv-service/validation/output/`.

---

## Next — batch suite (step 3)

After 2–3 clips, fill `cv-service/tools/sit_reach_manifest.csv` and run:

```powershell
.\run_sit_reach_suite.ps1
```
