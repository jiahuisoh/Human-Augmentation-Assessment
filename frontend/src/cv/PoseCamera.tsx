import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { cls } from "../utils/helpers";

export interface PoseCameraHandle {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
}

export type CameraOverlayTone = "info" | "warning";

interface PoseCameraProps {
  privacyText?: string;
  overlayMessage?: string;
  overlayTone?: CameraOverlayTone;
  children?: ReactNode;
}

const PoseCamera = forwardRef<PoseCameraHandle, PoseCameraProps>(function PoseCamera(
  { privacyText = "Camera processed on this device only. No video is uploaded or recorded.", overlayMessage, overlayTone = "info", children },
  ref,
) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    get video()  { return videoRef.current; },
    get canvas() { return canvasRef.current; },
  }), []);

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[4/3] bg-black rounded-2xl overflow-hidden">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <div className="absolute top-3 left-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-xs z-10">
        <ShieldCheck size={16} className="text-emerald-400 flex-shrink-0" />
        <span>{privacyText}</span>
      </div>

      {children}

      {overlayMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-20">
          <div className={cls(
            "flex items-center gap-3 rounded-2xl px-5 py-4 text-white text-lg font-semibold shadow-lg",
            overlayTone === "warning" ? "bg-amber-600/90" : "bg-violet-700/90",
          )}>
            <AlertTriangle size={22} className="flex-shrink-0" />
            <span>{overlayMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default PoseCamera;
