import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertCircle, Loader } from "lucide-react";
import { cls } from "../utils/helpers";
import { drawSkeleton, drawHands } from "./landmarks";
import { CVServiceClient } from "./CVServiceClient";
import PoseCamera, { type PoseCameraHandle } from "./PoseCamera";
import type { Detection, Phase, TestOutcomeWire, UpdateMessage } from "./wireTypes";
import type { Sex, TestId } from "../types";
import { TESTS } from "../utils/constants";

function calibrationPromptFor(testId: TestId): string {
  return TESTS.find(t => t.id === testId)?.calibrationPrompt
    ?? "Stand straight, sideways to the camera.";
}

// Default matches the cv-service host port from docker-compose.yml (4501 → 8000 in container).
// Override via VITE_CV_WS_URL in frontend/.env if running the service on a different port.
const CV_WS_URL: string = import.meta.env.VITE_CV_WS_URL || "ws://localhost:4501";
const FRAME_JPEG_QUALITY = 0.7;

export interface TestRunnerProps {
  testId:     TestId;
  userAge:    number | null;
  userSex:    Sex;
  userHeight: number | null;
  /** When true, server runs in sandbox mode with de-identified data (Developer). */
  sandbox?:   boolean;
  onComplete: (outcome: TestOutcomeWire) => void;
  onBack:     () => void;
}

export default function TestRunner({
  testId, userAge, userSex, userHeight, sandbox = false, onComplete, onBack,
}: TestRunnerProps) {
  const [phase, setPhase]         = useState<Phase>("loading");
  const [update, setUpdate]       = useState<UpdateMessage | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");
  const [detection, setDetection] = useState<Detection>("missing");

  const cameraRef  = useRef<PoseCameraHandle>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const clientRef  = useRef<CVServiceClient | null>(null);
  const rafRef     = useRef<number | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const transitionPhase = useCallback((next: Phase) => setPhase(next), []);

  useEffect(() => {
    let cancelled = false;
    scratchRef.current = document.createElement("canvas");

    const captureLoop = async (): Promise<void> => {
      if (cancelled) return;
      const video   = cameraRef.current?.video;
      const client  = clientRef.current;
      const scratch = scratchRef.current;
      if (video && client && scratch && video.readyState >= 2 && video.videoWidth > 0) {
        scratch.width  = video.videoWidth;
        scratch.height = video.videoHeight;
        const ctx = scratch.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const blob = await new Promise<Blob | null>(resolve =>
            scratch.toBlob(b => resolve(b), "image/jpeg", FRAME_JPEG_QUALITY),
          );
          if (blob) await client.sendFrame(blob);
        }
      }
      rafRef.current = requestAnimationFrame(captureLoop);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = cameraRef.current?.video;
        if (video) { video.srcObject = stream; await video.play(); }

        const client = new CVServiceClient(CV_WS_URL, {
          onReady: () => {
            client.init(userAge, userSex, userHeight, sandbox);
            client.start();
          },
          onUpdate: (msg) => {
            setUpdate(msg);
            transitionPhase(msg.phase);
            if (msg.detection) setDetection(msg.detection);
            const v = cameraRef.current?.video;
            const c = cameraRef.current?.canvas ?? null;
            if (v) {
              drawSkeleton(c, v, msg.landmarks);
              drawHands(c, v, msg.hand_landmarks);
            }
          },
          onComplete: (msg) => {
            setPhase("done");
            onCompleteRef.current(msg.outcome);
          },
          onError: (msg) => {
            setErrorMsg(msg.message);
            setPhase("error");
          },
        });
        clientRef.current = client;
        await client.connect(testId);
        if (cancelled) { client.close(); return; }

        rafRef.current = requestAnimationFrame(captureLoop);
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException;
        setErrorMsg(
          e?.name === "NotAllowedError"
            ? "Camera permission was denied. Tap Back to return."
            : (e?.message || "Could not start the camera or connect to the CV service."),
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      clientRef.current?.close();
      clientRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      const video = cameraRef.current?.video;
      if (video) video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEarly = () => clientRef.current?.stopEarly();

  return (
    <div className="min-h-screen bg-gray-900 relative flex flex-col">
      {sandbox && (
        <div className="bg-amber-950/60 border-b border-amber-800 text-amber-300 text-xs px-4 py-2 text-center">
          SANDBOX MODE — synthetic user data, no live patient records
        </div>
      )}

      {phase === "test" && update && (
        <>
          <div className="h-2 bg-gray-700">
            <div className="h-full bg-violet-500 transition-all duration-200"
              style={{ width: `${((update.time_remaining ?? 0) / 30) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 gap-4">
            {update.reps !== undefined ? (
              <>
                <div>
                  <div className="text-gray-400 text-sm">REPS</div>
                  <div className="text-5xl font-black text-white leading-none">{update.reps}</div>
                </div>
                <div className="text-center">
                  {update.posture && <div className="text-yellow-400 text-lg font-bold uppercase">{update.posture}</div>}
                  {update.angle !== undefined && <div className="text-gray-500 text-sm">Hip angle: {Math.round(update.angle)}°</div>}
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-gray-400 text-sm">CURRENT</div>
                  <div className="text-4xl font-black text-white leading-none">{formatCm(update.measurement)}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-400 text-sm">BEST</div>
                  <div className="text-3xl font-black text-emerald-400 leading-none">{formatCm(update.best_measurement)}</div>
                </div>
              </>
            )}
            <div className="text-right">
              <div className="text-gray-400 text-sm">TIME LEFT</div>
              <div className={cls(
                "text-5xl font-black leading-none",
                (update.time_remaining ?? 99) <= 5 ? "text-red-400" : "text-white",
              )}>
                {Math.ceil(update.time_remaining ?? 0)}
              </div>
            </div>
          </div>
        </>
      )}

      {(phase === "calibrating" || phase === "countdown") && (
        <div className="px-4 pt-10 pb-2">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-white text-lg font-semibold min-h-[48px] mb-2">
            <ArrowLeft size={24} /> Back
          </button>
          {phase === "calibrating" && (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-1">Calibrating…</h2>
              <p className="text-gray-300 text-base text-center">{calibrationPromptFor(testId)}</p>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        <PoseCamera
          ref={cameraRef}
          overlayMessage={overlayMessageFor(phase, detection)}
          overlayTone="warning"
        />
      </div>

      {phase === "calibrating" && update && (
        <div className="max-w-2xl mx-auto w-full p-4">
          <p className="text-base text-center mb-2">
            <span className={cls(detection === "ok" ? "text-emerald-400" : "text-amber-400")}>
              {detection === "ok"
                ? `Gathering… ${update.calib_samples ?? 0} samples`
                : detection === "partial"
                ? "Move so your full body is visible"
                : "Step into frame so we can see you"}
            </span>
            {update.calib_remaining_s !== undefined && update.calib_remaining_s > 0 && (
              <span className="text-violet-300"> · {update.calib_remaining_s.toFixed(1)}s left</span>
            )}
          </p>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${(update.calib_progress ?? 0) * 100}%` }} />
          </div>
          {update.calib_quality !== undefined && (
            <p className={cls(
              "text-sm text-center mt-2",
              update.calib_quality >= 0.5 ? "text-emerald-400" : "text-amber-400",
            )}>
              Calibration quality: {Math.round(update.calib_quality * 100)}%
              {update.calib_quality < 0.5 && " — improve lighting or leg visibility"}
            </p>
          )}
        </div>
      )}

      {phase === "countdown" && update && (
        <div className="text-center p-6">
          <div className={cls(
            "font-black leading-none mb-2",
            (update.countdown ?? 0) > 0 ? "text-white text-8xl" : "text-green-400 text-6xl",
          )}>
            {(update.countdown ?? 0) > 0 ? update.countdown : "GO!"}
          </div>
          <p className="text-gray-300 text-xl">
            {(update.countdown ?? 0) > 0 ? "Get ready!" : "Begin!"}
          </p>
        </div>
      )}

      {phase === "test" && (
        <div className="p-4">
          <button type="button" onClick={stopEarly}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-lg font-bold py-3.5 rounded-xl min-h-[52px]">
            Stop Early
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col items-center justify-center gap-4 p-8">
          <Loader size={56} className="text-violet-400 animate-spin" />
          <p className="text-white text-xl font-semibold text-center">Connecting to camera and CV service…</p>
          <p className="text-gray-400 text-base text-center max-w-md">
            Frames stream privately to the HANA CV service.
          </p>
          <button type="button" onClick={onBack} className="text-gray-400 text-base mt-4 hover:text-white">Cancel</button>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 bg-gray-900 z-50 flex flex-col p-4 pt-10">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-white text-lg font-semibold min-h-[48px] mb-6">
            <ArrowLeft size={24} /> Back
          </button>
          <div className="bg-amber-900/40 border border-amber-500/40 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle size={22} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <p className="text-amber-100 text-base">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCm(cm: number | undefined): string {
  if (cm === undefined || cm === null) return "—";
  return (cm >= 0 ? "+" : "") + cm.toFixed(1) + " cm";
}

function overlayMessageFor(phase: Phase, detection: Detection): string | undefined {
  if (phase !== "calibrating" && phase !== "countdown" && phase !== "test") return undefined;
  if (detection === "ok") return undefined;
  if (detection === "missing") return "Step into frame so we can see you";
  return "Move so your full body is visible";
}
