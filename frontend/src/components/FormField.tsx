import type { ReactNode } from "react";

export const inputCls =
  "w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg text-gray-900 " +
  "focus:border-violet-600 focus:outline-none min-h-[52px] bg-white";

interface FormFieldProps {
  label: string;
  id: string;
  error?: string | null;
  children: ReactNode;
}

export function FormField({ label, id, error, children }: FormFieldProps) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="block text-lg font-semibold text-gray-800 mb-2">
        {label}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-red-600 text-base mt-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
