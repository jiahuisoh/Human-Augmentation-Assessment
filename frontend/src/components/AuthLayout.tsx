import { useEffect, type ReactNode } from "react";
import { HeartPulse } from "lucide-react";


export const authPrimaryBtn =
  "w-full bg-violet-600 hover:bg-violet-700 active:bg-violet-800 " +
  "disabled:opacity-60 disabled:cursor-not-allowed " +
  "text-white text-lg font-semibold py-3.5 rounded-xl min-h-[56px] transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2";


export const authLinkCls =
  "text-violet-600 font-semibold cursor-pointer hover:text-violet-800 underline underline-offset-2 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded";


export const authNoticeCls = "rounded-xl px-4 py-3 text-base mb-5 border";

interface AuthLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  useEffect(() => {
    document.documentElement.classList.add("auth-page");
    return () => document.documentElement.classList.remove("auth-page");
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="w-full max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HeartPulse size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">HANA Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Human Augmentation Neural Analytics</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
          {(title || subtitle) && (
            <div className="text-center mb-6">
              {title && <h2 className="text-2xl font-bold text-gray-900">{title}</h2>}
              {subtitle && <p className="text-base text-gray-500 mt-1">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>

        {footer && <div className="mt-5 text-center">{footer}</div>}
      </div>
    </div>
  );
}
