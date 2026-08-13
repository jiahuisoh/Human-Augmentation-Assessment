import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Content-Security-Policy for the application origin.
 *
 * The backend sets its own policy on API responses, but that governs only the
 * JSON. This one governs the page that actually runs the code, which is where
 * an injected script would execute.
 *
 * connect-src is derived from the same variables the client reads, so moving a
 * service to another port cannot leave the policy pointing at the old one and
 * silently blocking the app.
 */
function buildCsp(env: Record<string, string>, dev: boolean): string {
  const api    = env.VITE_API_URL   || "http://localhost:4502";
  const cvWs   = env.VITE_CV_WS_URL || "ws://localhost:4501";
  // utils/api.ts derives the CV health probe from the socket URL, and the
  // developer dashboard fetches it, so both schemes have to be allowed.
  const cvHttp = cvWs.replace(/^ws/, "http");

  return [
    "default-src 'self'",
    // The production build emits no inline script, so the shipped policy needs
    // no hash, nonce or 'unsafe-inline'. Keeping it that way is the point.
    //
    // The dev server is the exception: @vitejs/plugin-react injects an inline
    // React Fast Refresh preamble that has to run before the app module, so
    // blocking it stops the app mounting at all. The relaxation is confined to
    // `vite dev` and never reaches a build.
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    // Vite injects stylesheets as inline <style> during development, and React
    // writes inline style attributes for things like a progress bar's width.
    // Inline styles cannot execute; inline scripts remain disallowed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${cvWs} ${cvHttp} https://api.pwnedpasswords.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Ignored when delivered in a meta tag, honoured in the header below. A
    // production host should send this policy as a header for that reason.
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Ship the policy in the page itself, so it travels with a static build. */
function cspMetaTag(csp: string): Plugin {
  return {
    name: "hana-csp-meta",
    transformIndexHtml() {
      return [{
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: csp },
        injectTo: "head-prepend",
      }];
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const csp = buildCsp(loadEnv(mode, ".", "VITE_"), command === "serve");
  return {
    plugins: [react(), cspMetaTag(csp)],
    // Sent as a real header while developing and previewing, so a violation
    // shows up here rather than for the first time in a deployment.
    server: { port: 4500, strictPort: false, headers: { "Content-Security-Policy": csp } },
    preview: { headers: { "Content-Security-Policy": csp } },
  };
});
