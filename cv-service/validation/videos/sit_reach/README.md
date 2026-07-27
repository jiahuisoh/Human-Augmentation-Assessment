# Sit & Reach validation videos

Put SynthDa exports or phone recordings here. **Large videos may be gitignored** — keep manifests and result JSON in git.

## Already present (SynthDa multi-angle)

Industry Colab renders (seed documented in `../synthda/sit_reach_synthda_manifest.json`):

- `animation_front_left.mp4`
- `animation_top_45.mp4`
- `animation_back.mp4`

Validate with short calib (see root `README.md` or `../../tools/README.md`).

## Step 1 — Get more clips (pick one)

### Option A — From a teammate (fastest)

Ask in your group chat for their export layout (chair stand: Yi Heng branches).

### Option B — Film yourself (works today, no SynthDa)

1. Phone or laptop **sideways** — full test leg + hands visible  
2. Sit & reach, hold max reach ~3 seconds  
3. Measure ruler at toe line → note **manual cm**  
4. Save as `sr-p01.webm` or `.mp4` in this folder  

### Option C — Export from SynthDa / Colab

1. Industry demo: https://colab.research.google.com/drive/150jzmeDh_8S7fw28umGom0QYrIE69Ct4  
2. Render multi-angle views → download `.mp4`  
3. Save here and add a row to `../../tools/sit_reach_manifest.csv` + provenance JSON  

---

## Step 2 — Run single-video validation

```powershell
cd cv-service\tools
.\validate_one_clip.ps1 `
  -Video "..\validation\videos\sit_reach\sr-p01.webm" `
  -ExpectedReachCm 12.5 `
  -HeightCm 164
```

**First run** downloads MediaPipe models (~15 MB) to `cv-service/models/`.

### Reading the result

- `"passed": true` — CV reach within tolerance of expected  
- `"predicted_reach_cm"` — what your strategy scored  
- `"status": "completed"` — video processed end-to-end  
- If `calibration_failed` on non-side SynthDa angles — often expected for sit-reach form gates  

Results go to `cv-service/validation/output/`.

---

## Next — batch suite

Fill `cv-service/tools/sit_reach_manifest.csv` and run:

```powershell
cd cv-service\tools
python run_sit_reach_validation_suite.py --manifest sit_reach_manifest.csv --output-dir ..\validation\output\sit_reach
```
