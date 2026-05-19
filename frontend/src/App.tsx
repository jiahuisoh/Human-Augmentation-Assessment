import { useState } from "react";
import Login from "./pages/public/Login";
import SignUp from "./pages/public/SignUp";
import Client from "./pages/client/ClientIndex";
import Staff from "./pages/staff/StaffIndex";
import Clinician from "./pages/clinician/ClinicianIndex";
import Developer from "./pages/developer/DevIndex";
import Administrator from "./pages/administrator/AdminIndex";
import { clearToken } from "./utils/tokenStore";
import type { User } from "./types";

type Screen = "login" | "signup";

export default function App() {
  const [user, setUser]     = useState<User | null>(null);
  const [screen, setScreen] = useState<Screen>("login");

  const handleSignOut = (): void => {
    clearToken();
    setUser(null);
    setScreen("login");
  };

  if (user === null) {
    if (screen === "signup") {
      return <SignUp onSignedUp={setUser} onBackToLogin={() => setScreen("login")} />;
    }
    return <Login onLogin={setUser} onCreateAccount={() => setScreen("signup")} />;
  }

  switch (user.role) {
    case "client":         return <Client        user={user} onSignOut={handleSignOut} />;
    case "staff":          return <Staff         user={user} onSignOut={handleSignOut} />;
    case "clinician":      return <Clinician     user={user} onSignOut={handleSignOut} />;
    case "developer":      return <Developer     user={user} onSignOut={handleSignOut} />;
    case "administrator":  return <Administrator user={user} onSignOut={handleSignOut} />;
  }
}
