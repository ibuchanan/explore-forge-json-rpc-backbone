import api, {
  fetch,
  getAppContext,
  route,
  type WebTriggerRequest,
  type WebTriggerResponse,
} from "@forge/api";
import { createAdoptedWebtrigger } from "./adoption";
import { store } from "./store";

const trigger = createAdoptedWebtrigger({
  store,
  requestJira: async (url, authorization) => {
    const response = await fetch(url, {
      headers: { Authorization: authorization },
      redirect: "manual",
    });
    return { status: response.status, body: await response.json() };
  },
});

export async function run(
  event: WebTriggerRequest,
): Promise<WebTriggerResponse> {
  let installation: { id: string; jiraSiteUrl: string } | undefined;
  try {
    // Resolve the site through Forge, never from caller-controlled HTTP input.
    const id = getAppContext().installationAri.toString();
    if (!/^ari:cloud:ecosystem::installation\/[^/\s]+$/.test(id))
      throw new Error("Installation context unavailable");
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/serverInfo`);
    if (response.ok) {
      const body: unknown = await response.json();
      const baseUrl = (body as { baseUrl?: unknown } | null)?.baseUrl;
      if (
        typeof baseUrl === "string" &&
        /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/i.test(baseUrl)
      )
        installation = { id, jiraSiteUrl: new URL(baseUrl).origin };
    }
  } catch {
    // Discovery failure must never forward caller credentials or access storage.
  }
  return trigger(event, { installation });
}
