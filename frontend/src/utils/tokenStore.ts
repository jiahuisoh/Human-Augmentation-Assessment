const KEY = "hana.auth.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, token);
  } catch {
    /* storage disabled: silent fallthrough */
  }
}

export function clearToken(): void {
  setToken(null);
}
