import { AlertCircle, Shield } from "lucide-react";
import FAQAccordion from "../components/FAQAccordion";
import { FAQ_SECTIONS, CONTACT_CHANNELS } from "../data/helpContent";

export default function Help() {
  return (
    <div className="space-y-4">
      {/* Safety banner */}
      <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-700">Your Health Comes First</h3>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">
              If you feel dizzy, short of breath, or experience pain, stop the test immediately and tap
              <strong> Stop Early</strong>. Your safety matters more than the score.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ sections */}
      {FAQ_SECTIONS.map(s => (
        <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <s.Icon size={16} className="text-violet-600" />
            </span>
            {s.heading}
          </h3>
          <FAQAccordion faqs={s.faqs} />
        </div>
      ))}

      {/* Contact channels */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Contact Us</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CONTACT_CHANNELS.map(c => (
            <div key={c.label} className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <c.Icon size={14} className="text-violet-600" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-gray-400 tracking-wide">{c.label}</div>
                <div className="text-sm font-bold text-gray-900 break-words">{c.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.sub}</div>
              </div>
              {c.href && (
                <a href={c.href} className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                  {c.label.toLowerCase().includes("email") ? "Send email →" : "Call now →"}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PDPA footer */}
      <div className="bg-gray-100 rounded-2xl p-4 flex items-start gap-3">
        <Shield size={16} className="text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong>Data Protection:</strong> HANA is designed around Singapore's
          <strong> Personal Data Protection Act (PDPA)</strong>.
          Your health data is never sold or shared with third parties. Access is restricted by role,
          and sensitive actions on your records are logged.
          You may request deletion of your account at any time through HANA Administrator.
        </p>
      </div>
    </div>
  );
}
