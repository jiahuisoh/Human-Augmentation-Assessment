import { useState, type KeyboardEvent } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";
import { cls } from "../../utils/helpers";
import { userApi } from "../../utils/api";
import type { User } from "../../types";

interface LoginProps {
  onLogin: (user: User) => void;
  onCreateAccount: () => void;
}

export default function Login({ onLogin, onCreateAccount }: LoginProps) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [visible,  setVisible]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const inputCls = "w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:border-violet-500 focus:outline-none";

  const handleLogin = async (): Promise<void> => {
    if (!email || !password) { setError("Please enter email and password."); return; }
    setLoading(true);
    setError("");
    try {
      const user = await userApi.login(email, password);
      onLogin(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setError(msg === "BACKEND_UNREACHABLE" ? "Cannot reach the server. Start the backend or use mock mode." : msg);
    } finally {
      setLoading(false);
    }
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void handleLogin(); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">HANA Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Human Augmentation Neural Analytics</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
            {error}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              id="email" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={onEnter}
              placeholder="you@example.com" className={inputCls} autoFocus
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                id="password" type={visible ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={onEnter}
                placeholder="Enter your password"
                className={cls(inputCls, "pr-12")}
              />
              <button
                type="button" onClick={() => setVisible(v => !v)}
                aria-label={visible ? "Hide password" : "Show password"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button" onClick={handleLogin} disabled={loading}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white text-base font-bold py-3.5 rounded-xl transition-all"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="mt-4 text-center">
          <button type="button" onClick={onCreateAccount}
            className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
            New client? Create an account
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 text-center space-y-1">
          <div>5 role access levels: Client · Staff · Clinician · Developer · Administrator</div>
          <div>All sessions are logged and audited</div>
        </div>
      </div>
    </div>
  );
}
