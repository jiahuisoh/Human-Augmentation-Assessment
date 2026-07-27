const MIN_VIS = 0.5;

/** MediaPipe Pose landmark indices for foot tips. */
export const LEFT_FOOT_INDEX = 31;
export const RIGHT_FOOT_INDEX = 32;

/** Pick the more visible toe tip for overlay anchors (normalized 0–1). */
export function pickToeAnchor(
  landmarks: number[][] | undefined,
): { x: number; y: number } | null {
  if (!landmarks || landmarks.length < 33) return null;
  const left = landmarks[LEFT_FOOT_INDEX];
  const right = landmarks[RIGHT_FOOT_INDEX];
  const leftOk = left && (left[2] ?? 0) >= MIN_VIS;
  const rightOk = right && (right[2] ?? 0) >= MIN_VIS;
  if (!leftOk && !rightOk) return null;
  if (leftOk && rightOk) {
    const pick = (left[2] ?? 0) >= (right[2] ?? 0) ? left : right;
    return { x: pick[0], y: pick[1] };
  }
  const pick = leftOk ? left : right;
  return { x: pick[0], y: pick[1] };
}

const SKELETON_EDGES: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 23], [12, 24], [23, 24],   // torso
  [11, 13], [13, 15],                       // left arm
  [12, 14], [14, 16],                       // right arm
  [23, 25], [25, 27], [27, 31],             // left leg
  [24, 26], [26, 28], [28, 32],             // right leg
];

export function drawSkeleton(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  landmarks: number[][] | undefined,
  colour: string = "#a78bfa",
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width  !== w) canvas.width  = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  for (const [a, b] of SKELETON_EDGES) {
    const pa = landmarks[a], pb = landmarks[b];
    if (!pa || !pb) continue;
    if ((pa[2] ?? 0) < MIN_VIS || (pb[2] ?? 0) < MIN_VIS) continue;
    ctx.beginPath();
    ctx.moveTo(pa[0] * w, pa[1] * h);
    ctx.lineTo(pb[0] * w, pb[1] * h);
    ctx.stroke();
  }

  ctx.fillStyle = colour;
  for (const lm of landmarks) {
    if ((lm[2] ?? 0) < MIN_VIS) continue;
    ctx.beginPath();
    ctx.arc(lm[0] * w, lm[1] * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

const HAND_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function drawHands(
  canvas: HTMLCanvasElement | null,
  _video: HTMLVideoElement,
  hands: number[][][] | undefined,
  colour: string = "#f59e0b",
): void {
  if (!canvas || !hands || hands.length === 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;

  for (const hand of hands) {
    if (!hand || hand.length < 21) continue;

    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_EDGES) {
      const pa = hand[a], pb = hand[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa[0] * w, pa[1] * h);
      ctx.lineTo(pb[0] * w, pb[1] * h);
      ctx.stroke();
    }

    ctx.fillStyle = colour;
    for (const lm of hand) {
      ctx.beginPath();
      ctx.arc(lm[0] * w, lm[1] * h, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
