# Sit & Reach — Ground-truth validation protocol

Use this to build a dataset for IWL reporting (MAE, environment comparison).

**Order of work:** complete the **Pilot 5** below first → run MAE → then SynthDa offline replay (`synthda/README.md`).

## Pilot 5 — your first sessions (start here)

Copy `ground_truth.pilot.csv` and fill one row per session after each run.

| Session | Who | Where | Age group | Goal |
|---------|-----|-------|-----------|------|
| `sr-p01` | You | Bedroom (desk webcam) | Young adult | Baseline home setup |
| `sr-p02` | Friend / roommate | Bedroom | Young adult | Second person or different lighting |
| `sr-p03` | You | Centre-like (open floor, bright) | Young adult | SLEC-style proxy |
| `sr-p04` | Older volunteer (or parent) | Bedroom | Older adult | Slower reach + 2 s hold |
| `sr-p05` | Best available | Centre | Older adult (or repeat p03) | Repeatability / form checks |

### Per session checklist

1. **Setup** — laptop sideways, full test leg + both hands in frame; note camera height in `notes`
2. **Height** — measure or use profile (cm); enter in CV Sandbox if possible
3. **Ruler** — at toe line: `+` past toes, `−` short of toes → `manual_reach_cm`
4. **CV run** — `docker compose up cv-service` + frontend → Sit & Reach → copy final cm
5. **Log row** — use `record_session.py` or edit CSV directly:

```powershell
cd cv-service
python validation/record_session.py `
  --csv validation/ground_truth.pilot.csv `
  --session sr-p01 `
  --environment bedroom `
  --age-group young_adult `
  --height 170 `
  --manual 12.5 `
  --cv 11.8 `
  --notes "Evening desk light; full leg visible"
```

6. **After all 5** — compute MAE:

```powershell
python validation/compute_mae.py validation/ground_truth.pilot.csv
```

**Pilot targets:** MAE &lt; 3 cm is a reasonable first goal; bias near 0 cm (not always high or low).  
If one environment is worse, note it in the report and tune `sit_reach/strategy.py`.

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
