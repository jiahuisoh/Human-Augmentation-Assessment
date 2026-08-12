import { useState, type FormEvent } from "react";
import AuthLayout, { authPrimaryBtn, authNoticeCls, authLinkCls } from "../../components/AuthLayout";
import { FormField, inputCls } from "../../components/FormField";
import { PasswordInput } from "../../components/PasswordFields";
import { cls } from "../../utils/helpers";
import { userApi } from "../../utils/api";
import type { User } from "../../types";

interface LoginProps {
  onLogin: (user: User) => void;
  onCreateAccount: () => void;
  notice?: string;
}

export default function Login({ onLogin, onCreateAccount, notice }: LoginProps) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!email || !password) { setError("Please enter email and password."); return; }
    setLoading(true);
    setError("");
    try {
      const user = await userApi.login(email, password);
      onLogin(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed.";
      setError(msg === "BACKEND_UNREACHABLE" ? "Cannot reach the server. Make sure the backend is running." : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      footer={
        <p className="text-base text-gray-500">
          New Client?{" "}
          <button type="button" onClick={onCreateAccount} className={authLinkCls}>
            Create an Account
          </button>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate aria-label="Log In">
        {notice && !error && (
          <div role="status" className={cls(authNoticeCls, "bg-amber-50 border-amber-200 text-amber-800")}>
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className={cls(authNoticeCls, "bg-red-50 border-red-200 text-red-700")}>
            {error}
          </div>
        )}

        <FormField label="Email Address" id="email">
          <input
            id="email" type="email" value={email} autoComplete="email" autoFocus
            onChange={e => setEmail(e.target.value)}
            className={inputCls}
          />
        </FormField>

        <FormField label="Password" id="password">
          <PasswordInput
            id="password" value={password} onChange={setPassword}
            autoComplete="current-password"
          />
        </FormField>

        <button type="submit" disabled={loading} className={authPrimaryBtn}>
          {loading ? "Logging In…" : "Log In"}
        </button>
      </form>
    </AuthLayout>
  );
}
