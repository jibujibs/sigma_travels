import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Root from "./Root";
import { PayPage } from "./pay/PayPage";
import "./styles.css";

const payToken = /^\/pay\/([A-Za-z0-9_-]{24,64})\/?$/.exec(window.location.pathname)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* /pay/<token> is the customer's payment page: public, no sign-in. Everything else needs sign-in. */}
    {payToken ? <PayPage token={payToken} /> : <Root />}
  </StrictMode>,
);
