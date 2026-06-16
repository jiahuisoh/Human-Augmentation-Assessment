# Sit & Reach — Ground-truth validation protocol

Use this to build a dataset for IWL reporting (MAE, environment comparison).

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
| `notes` | Lighting, clothing, camera distance |

Copy `ground_truth.template.csv` → `ground_truth.csv` and fill one row per session.

## 2. Filming setup

**Camera:** laptop webcam, sideways to subject, full test leg + hands visible.

**Bedroom:** typical home desk height, personal clutter OK (note in notes).

**Centre:** open floor, fluorescent lighting, standard chair/floor space (SLEC-like).

**Older adults:** slower reach, allow full 30 s; hold furthest point ~2 s.

**Young adults:** faster movement; same protocol but note if hold detection misses.

## 3. Run CV and capture score

1. `docker compose up --build cv-service`
2. Frontend → clinician or developer → **sit reach**
3. Use patient height/age where possible (affects calibration + norms)
4. Copy final **measurement (cm)** into `cv_reach_cm`

## 4. Report MAE

```powershell
cd cv-service
python validation/compute_mae.py validation/ground_truth.csv
```

Target for write-up: report **MAE in cm** and split by **environment** and **age_group**.

## 5. When to tune code

If MAE is consistently high or biased in one environment only, adjust `sit_reach/strategy.py` (not SynthDa) and re-run the CSV.

Low **calibration_quality** (&lt; 0.5) in the outcome → exclude from MAE or flag for clinician review.
