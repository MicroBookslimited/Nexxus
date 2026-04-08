import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

setAuthTokenGetter(() => localStorage.getItem(TENANT_TOKEN_KEY));

createRoot(document.getElementById("root")!).render(<App />);
