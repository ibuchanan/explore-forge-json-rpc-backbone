import type { WebTriggerRequest, WebTriggerResponse } from "@forge/api";
import { createAdoptedWebtrigger } from "./adoption";
import { store } from "./store";

// A site URL is never derived from a request. A missing or mismatched
// installation/site configuration keeps the webtrigger unavailable.
const installationId = process.env["RPC_INSTALLATION_ARI"];
const jiraSiteUrl = process.env["RPC_JIRA_SITE_URL"];
const trigger = createAdoptedWebtrigger({
  store,
  installation:
    installationId &&
    jiraSiteUrl &&
    /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/i.test(jiraSiteUrl)
      ? { id: installationId, jiraSiteUrl }
      : undefined,
  requestJira: async (url, authorization) => {
    const response = await fetch(url, {
      headers: { Authorization: authorization },
      redirect: "manual",
    });
    return { status: response.status, body: await response.json() };
  },
});

export function run(
  event: WebTriggerRequest,
  context?: { installContext: string },
): Promise<WebTriggerResponse> {
  return trigger(event, context);
}
