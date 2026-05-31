import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

setAuthTokenGetter(() => localStorage.getItem(TENANT_TOKEN_KEY));

// Mobile in-app checkout handoff: the NEXXUS mobile app opens authenticated
// web pages (e.g. /subscription) in a secure in-app browser by passing the
// tenant token in the URL *fragment* (#token=). The fragment is never sent to
// the server/proxy (so it can't leak into request logs or Referer headers),
// unlike a query param. Persist it before render so ProtectedRoute sees it,
// then strip it from the URL so it isn't left in history.
try {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const handoff = new URLSearchParams(hash).get("token");
  if (handoff) {
    localStorage.setItem(TENANT_TOKEN_KEY, handoff);
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", url.toString());
  }
} catch {
  /* ignore malformed URLs */
}

createRoot(document.getElementById("root")!).render(<App />);
