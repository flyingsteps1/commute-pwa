import React from "react";
import "./stitch-ui.css";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import "./index.css";
import { ensureRecordsMigrated } from "./storage/localDb";
import { I18nProvider } from "./i18n/I18nProvider";

// ê¸°ì¡´ ?¨ì¼ ?¬ìš©??ê¸°ë¡??admin ê³„ì •?¼ë¡œ ë§ˆì´ê·¸ë ˆ?´ì…˜ (1??
ensureRecordsMigrated();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </React.StrictMode>
);
