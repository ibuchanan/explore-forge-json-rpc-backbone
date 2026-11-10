import { expect, it, vi } from "vitest";
import { createJiraAdminAuthenticator } from "../src/jira-admin-authenticator";

const authorization = `Basic ${Buffer.from("admin@example.com:token").toString("base64")}`;
const installation = { jiraSiteUrl: "https://example.atlassian.net" };
const identity = { status: 200, body: { accountId: "verified-user" } };

it.each([
  "Bearer legacy-secret",
  "Basic !!!",
  `Basic ${Buffer.from("not-an-email:token").toString("base64")}`,
])(
  "rejects malformed credentials without contacting Jira: %s",
  async (header) => {
    const requestJira = vi.fn();
    expect(
      await createJiraAdminAuthenticator(requestJira)(header, installation),
    ).toEqual({ kind: "unauthorized" });
    expect(requestJira).not.toHaveBeenCalled();
  },
);

it.each([
  "not-a-url",
  "http://example.atlassian.net",
  "https://user:password@example.atlassian.net",
  "https://example.atlassian.net/path",
  "https://example.atlassian.net/?redirect=elsewhere",
])("rejects unsafe configured site URLs: %s", async (jiraSiteUrl) => {
  const requestJira = vi.fn();
  expect(
    await createJiraAdminAuthenticator(requestJira)(authorization, {
      jiraSiteUrl,
    }),
  ).toEqual({ kind: "unavailable" });
  expect(requestJira).not.toHaveBeenCalled();
});

it.each(["myself", "mypermissions"])(
  "fails closed on invalid responses from %s",
  async (endpoint) => {
    for (const [response, kind] of [
      [{ status: 401, body: {} }, "unauthorized"],
      [{ status: 403, body: {} }, "unauthorized"],
      [{ status: 500, body: {} }, "unavailable"],
      [{ status: 200, body: {} }, "unavailable"],
      [{ status: 200, body: null }, "unavailable"],
    ] as const) {
      const requestJira = vi.fn(async (url: string) =>
        url.includes(endpoint) ? response : identity,
      );
      expect(
        await createJiraAdminAuthenticator(requestJira)(
          authorization,
          installation,
        ),
      ).toEqual({ kind });
    }
  },
);

it("treats Jira request failures as unavailable", async () => {
  const requestJira = vi.fn(async () => {
    throw new Error("private detail");
  });
  expect(
    await createJiraAdminAuthenticator(requestJira)(
      authorization,
      installation,
    ),
  ).toEqual({ kind: "unavailable" });
});

it("verifies identity and admin permission using only the trusted site and credentials", async () => {
  const requestJira = vi.fn(async (url: string) =>
    url.endsWith("/myself")
      ? identity
      : {
          status: 200,
          body: { permissions: { ADMINISTER: { havePermission: true } } },
        },
  );
  expect(
    await createJiraAdminAuthenticator(requestJira)(
      authorization,
      installation,
    ),
  ).toEqual({
    kind: "authenticated",
    principal: { accountId: "verified-user" },
  });
  expect(requestJira.mock.calls).toEqual([
    ["https://example.atlassian.net/rest/api/3/myself", authorization],
    [
      "https://example.atlassian.net/rest/api/3/mypermissions?permissions=ADMINISTER",
      authorization,
    ],
  ]);
});
