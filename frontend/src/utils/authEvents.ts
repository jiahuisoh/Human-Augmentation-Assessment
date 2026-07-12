type AuthFailureHandler = (message?: string) => void;

let handler: AuthFailureHandler | null = null;

export function onAuthFailure(h: AuthFailureHandler): () => void {
  handler = h;
  return () => { if (handler === h) handler = null; };
}

export function emitAuthFailure(message?: string): void {
  handler?.(message);
}
