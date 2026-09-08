import React from "react";
import { createRoot } from "react-dom/client";
import ViewerApp from "./ViewerApp.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import "../styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ViewerApp />
    </ErrorBoundary>
  </React.StrictMode>
);
