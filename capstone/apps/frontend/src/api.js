// api.js - every call to the API. The logged-in user's ID token goes in the
// Authorization header; API Gateway checks it before the Lambda runs.
import { fetchAuthSession } from "aws-amplify/auth";

export function createApi(baseUrl) {
  async function call(method, path, body) {
    const { tokens } = await fetchAuthSession(); // Amplify refreshes the token when needed
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: tokens.idToken.toString(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `request failed (${response.status})`);
    return data;
  }

  return {
    status: (id) => call("GET", `/device/${id}/status`),
    savings: (id) => call("GET", `/device/${id}/savings`),
    schedule: (id) => call("GET", `/device/${id}/schedule`),
    settings: (id) => call("GET", `/device/${id}/settings`),
    saveSettings: (id, settings) => call("PUT", `/device/${id}/settings`, settings),
    plugIn: (id) => call("POST", `/device/${id}/plug-in`),
    plugOut: (id) => call("POST", `/device/${id}/plug-out`),
  };
}
