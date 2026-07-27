# Sit & Reach — Ground-truth validation protocol

Use this to build a dataset for IWL reporting (MAE, environment comparison).

**Order of work:** MAE pilot (ruler) → then SynthDa / offline replay (`synthda/README.md`).

## Status (home pilot)

| File | Use |
|------|-----|
| `ground_truth.pilot.csv` | Full log (includes pre-fix rows for history) |
| `ground_truth.pilot.post_fix.csv` | **Report MAE from this** (post axis / toe-line / chair-leg fixes) |

Post-fix home sessions (n=4, height 164 cm): **MAE ≈ 3.6 cm**, **bias ≈ −1.8 cm**.

```powershell
cd cv-service
python validation/compute_mae.py validation/ground_truth.pilot.post_fix.csv
```

**Pilot targets:** MAE &lt; 3 cm is a reasonable first goal; bias near 0 cm.  
~3.6 cm is an acceptable first lock; add more sessions later to tighten.

---

## Pilot sessions (template)

Copy `ground_truth.pilot.csv` and fill one row per session after each run.

| Session | Who | Where | Age group | Goal |
|---------|-----|-------|-----------|------|
| `sr-p01`… | You / volunteer | Bedroom or centre | Young / older | See CSV notes |

### Per session checklist

1. **Setup** — laptop sideways, full test leg + both hands in frame; note camera height in `notes`
2. **Height** — measure or use profile (cm); enter in CV Sandbox if possible
3. **Ruler** — at toe line: `+` past toes, `−` short of toes → `manual_reach_cm`
4. **CV run** — `docker compose up cv-service` + frontend → Sit & Reach → copy final cm
5. **Log row** — edit the CSV, or:

```powershell
python validation/run_recording.py path\to\sr-p01.webm `
  --session sr-p01 --environment bedroom --age-group young_adult `
  --height 164 --manual 12.5 --notes "Desk webcam sideways"
```

6. **Compute MAE** (prefer post-fix file for reporting):

```powershell
python validation/compute_mae.py validation/ground_truth.pilot.post_fix.csv
```

---

## 1. Ground truth dataset (target: 10–20 sessions)

For each session record:

| Field | How |
|-------|-----|
| `session_id` | Unique label, e.g. `sr-001` |
| `environment` | `bedroom` or `centre` |
| `age_group` | `older_adult` (60+) or `young_adult` (tester) |
| `user_height_cm` | From profile or measured |
| `manual_reach_cm` | Clinician / ruler at toe line (+ past toes, − short) |
| `cv_reach_cm` | Outcome from CV Sandbox or clinician live run |
| `notes` | Lighting, clothing, camera distance, seating (chair/floor) |

Copy `ground_truth.template.csv` → `ground_truth.csv` and fill one row per session.

## 2. Filming setup

**Camera:** laptop webcam, sideways to subject.

**Chair:** front edge of chair; one foot flat; other leg extended, heel down, knee straight; stacked hands; hold furthest reach **3 s**.

**Floor:** both legs extended when visible; same hold and scoring.

**Scoring:** cm from toes (− short, 0 at toes, + past) plus traffic-light Position 1 / 2 / 3.

**Bedroom:** typical home desk height, personal clutter OK (note in notes).

**Centre:** open floor, bright lighting, standard chair/floor space (SLEC-like).

## 3. Run CV and capture score

1. `docker compose up --build cv-service`
2. Frontend → clinician or developer → **sit reach**
3. Use patient height/age where possible (affects calibration + norms)
4. Copy final **measurement (cm)** into `cv_reach_cm`

## 4. Report MAE

Prefer:

```powershell
cd cv-service
python validation/compute_mae.py validation/ground_truth.pilot.post_fix.csv
```

For a larger dataset later, use `validation/ground_truth.csv`.

Target for write-up: report **MAE in cm** and split by **environment** / seating when you have enough rows.

## 5. When to tune code

If MAE is consistently high or biased in one environment only, adjust `sit_reach/strategy.py` (not SynthDa) and re-run the CSV.

Low **calibration_quality** (&lt; 0.5) in the outcome → exclude from MAE or flag for clinician review.

## 6. SynthDa (offline)

See `synthda/README.md` and `sit_reach_synthda_manifest.json` (`source_type: synthda`, seed `16428`).  
MAE with a ruler remains the primary accuracy claim; SynthDa supports offline regression and multi-angle harness checks.
