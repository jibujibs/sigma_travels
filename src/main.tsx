import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Root from "./Root";
import { PayPage } from "./pay/PayPage";
import { ChoosePage } from "./choose/ChoosePage";
import "./styles.css";

const payToken = /^\/pay\/([A-Za-z0-9_-]{24,64})\/?$/.exec(window.location.pathname)?.[1];
const chooseToken = /^\/choose\/([A-Za-z0-9_-]{24,64})\/?$/.exec(window.location.pathname)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* /pay/<token> (payment) and /choose/<token> (choose a flight) are the customer's public pages, no sign-in. Everything else needs sign-in. */}
    {payToken ? <PayPage token={payToken} /> : chooseToken ? <ChoosePage token={chooseToken} /> : <Root />}
  </StrictMode>,
);
