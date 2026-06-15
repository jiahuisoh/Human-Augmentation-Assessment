import { ShieldX, ShieldCheck, Clock } from "lucide-react";
import type { VerificationStatus } from "../types";

interface VerificationBannerProps {
  status: VerificationStatus;
}

export default function VerificationBanner({ status }: VerificationBannerProps) {
  if (status === "verified") return null;

  if (status === "suspended") {
    return (
      <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-5 flex items-start gap-4">
        <ShieldX size={28} className="text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-lg font-bold text-red-800">Account Suspended</h3>
          <p className="text-base text-red-700 mt-1">
            Your account has been suspended. Please contact your HANA administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 flex items-start gap-4">
      <Clock size={28} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-lg font-bold text-amber-900">
          Account Not Yet Verified
        </h3>
        <p className="text-base text-amber-800 mt-1 leading-relaxed">
          You can still explore the app, but some features remain limited until your identity is verified by HANA Staff.
        </p>
        <div className="mt-3 bg-white rounded-xl p-3 border border-amber-200">
          <p className="text-sm font-bold text-amber-900 mb-1">How to verify your account:</p>
          <ol className="text-sm text-amber-800 space-y-1 list-decimal list-inside">
            <li>Visit your assigned clinic</li>
            <li>Bring your <strong>NRIC or Pioneer Generation card</strong></li>
            <li>Ask any HANA Staff member to verify your account</li>
            <li>Your account unlocks immediately</li>
          </ol>
        </div>
      </div>
      <ShieldCheck size={22} className="text-amber-500 flex-shrink-0 mt-0.5" />
    </div>
  );
}
