# SynthDa — Sit & Reach offline replay (phase 2)

SynthDa ([NVIDIA/synthda](https://github.com/NVIDIA/synthda)) generates synthetic human-motion **videos**.  
For sit-reach we do **not** plug SynthDa into the live app. We use it to:

1. Generate or obtain clips with known reach distance (cm)
2. Extract pose landmarks offline (MediaPipe)
3. Replay landmarks through `SitReachStrategy` via `replay_landmarks.py`
4. Compare CV cm vs label — regression testing without live camera

**MAE with a real ruler** (`../PROTOCOL.md`) remains the primary IWL accuracy report.

## Team alignment

If teammates clone SynthDa into their branches for chair stand / back scratch, use the **same folder layout**:

```
cv-service/validation/synthda/
  README.md
  replay_landmarks.py      # sit-reach: feed JSONL landmarks → strategy
  sequences/               # exported .jsonl per clip (gitignore large files)
```

Chair stand may add `replay_chair_stand.py` with rep-count labels instead of cm.

## Setup SynthDa (when ready)

Follow [NVIDIA SynthDa setup wiki](https://github.com/NVIDIA/synthda/wiki/1.-Setting-Up-SynthDa).

Requirements are heavy (GPU, conda, several repos). Coordinate with whoever on the team already cloned it — **reuse their env** before duplicating setup.

## Sit-reach workflow

### 1. Demo without SynthDa

```powershell
cd cv-service
python validation/synthda/replay_landmarks.py --demo
```

### 2. From a SynthDa or recorded video

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

- [ ] Agree JSONL export format with teammates (share one chair-stand example)
- [ ] Add `extract_poses_from_video.py` once MediaPipe batch script exists
- [ ] 2–3 SynthDa sit-reach clips with `label_reach_cm` for regression
