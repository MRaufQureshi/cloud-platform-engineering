// main.jsx - starts the app. Order matters:
//   1. download /config.json (written by Terraform: API address + login pool IDs)
//   2. tell Amplify about the login pool
//   3. show the app; it shows the login page until someone signs in
import React from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import App from "./App.jsx";
import { LangProvider } from "./LangContext.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));

async function start() {
  try {
    const response = await fetch("/config.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`config.json answered ${response.status}`);
    const config = await response.json();

    Amplify.configure({
      Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId } },
    });

    root.render(
      <LangProvider>
        <App config={config} />
      </LangProvider>
    );
  } catch (error) {
    root.render(<p className="fatal">Could not start the app: {error.message}</p>);
  }
}

start();
