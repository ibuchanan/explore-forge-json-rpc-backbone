import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scripts } from "../package.json";

const directories: string[] = [];
const root = process.cwd();
const nativeSecretSpec = spawnSync("secretspec", ["--version"]).status === 0;
const url = "https://fixture.example.test/config-rpc";

function fixture(native = false) {
  const dir = mkdtempSync(join(root, "tmp_rovo_scripts_"));
  directories.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const values = join(dir, "values.env");
  const events = join(dir, "events");
  const saved = join(dir, "saved-url");
  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}:${process.env["PATH"]}`,
    HOME: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
    XDG_CACHE_HOME: dir,
    XDG_STATE_HOME: dir,
    SECRETSPEC_FILE: native ? resolve("secretspec.toml") : "fixture.toml",
    SECRETSPEC_PROFILE: "default",
    SECRETSPEC_SCOPE: "runtime",
    FAKE_VALUES: values,
    FAKE_EVENTS: events,
    FAKE_SAVED: saved,
    FAKE_URL: url,
    RPC_VERIFY_URL: "https://ambient.example.test/do-not-use",
  };
  const tool = (name: string, body: string) =>
    writeFileSync(join(bin, name), `#!/bin/sh\nset -eu\n${body}\n`, {
      mode: 0o700,
    });
  if (!native) {
    tool(
      "secretspec",
      `
case "$1" in
  run)
    [ "$2" = --scope ] && [ "$3" = '' ] && [ "$4" = -- ]
    shift 4
    unset RPC_VERIFY_URL RPC_VERIFY_ISOLATION_URL
    set -a
    . "$FAKE_VALUES"
    set +a
    exec "$@" ;;
  set)
    [ "$*" = 'set --provider project_config --from-file - RPC_VERIFY_URL' ]
    echo store >> "$FAKE_EVENTS"
    if [ "\${FAKE_STORE_FAIL-}" = 1 ]; then
      echo 'private-provider-detail' >&2; exit 1
    fi
    value=$(cat)
    printf '%s' "$value" > "$FAKE_SAVED"
    printf "RPC_VERIFY_URL='%s'\\n" "$value" >> "$FAKE_VALUES" ;;
  *) exit 99 ;;
esac`,
    );
  }
  tool(
    "forge",
    `
echo forge >> "$FAKE_EVENTS"
[ "$*" = 'webtrigger create --site example.atlassian.net --product jira --environment development --functionKey config-rpc' ]
if [ "\${FAKE_FORGE_FAIL-}" = 1 ]; then
  echo 'private-forge-detail' >&2; exit 1
fi
printf '%s\\n' "\${FAKE_FORGE_OUTPUT-$FAKE_URL}"
`,
  );
  tool(
    "bun",
    `
[ "$*" = 'run test/deployed/run.ts' ]
[ "$RPC_BEARER_SECRET" = synthetic-test-token ]
[ "$RPC_VERIFY_URL" = "$FAKE_URL" ]
[ -z "\${RPC_VERIFY_ISOLATION_URL+x}" ]
echo verify >> "$FAKE_EVENTS"
printf '%s\\n' '{"status":"passed","fixture":true}'
exit "\${FAKE_VERIFY_STATUS-0}"
`,
  );
  const configure = (extra = "") =>
    writeFileSync(
      values,
      `
FORGE_SITE=example.atlassian.net
FORGE_PRODUCT=jira
FORGE_ENVIRONMENT=development
RPC_BEARER_SECRET=synthetic-test-token
RPC_VERIFY_URL=''
RPC_VERIFY_ISOLATION_URL=''
${extra}
`,
    );
  configure();
  const run = (script: "forge:webtrigger:upsert" | "test:deployed") =>
    spawnSync("sh", ["-c", scripts[script]], {
      cwd: root,
      env,
      encoding: "utf8",
    });
  const history = () => {
    try {
      return readFileSync(events, "utf8").trim().split("\n");
    } catch {
      return [];
    }
  };
  return { dir, bin, env, values, saved, configure, run, history };
}

afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("SecretSpec-backed operator scripts (fake Forge only)", () => {
  it("creates and stores a missing URL once, then trusts the saved value", () => {
    const f = fixture();
    const first = f.run("forge:webtrigger:upsert");
    expect(first.status, first.stderr).toBe(0);
    expect(readFileSync(f.saved, "utf8")).toBe(url);
    expect(f.history()).toEqual(["forge", "store"]);
    expect(f.run("forge:webtrigger:upsert").status).toBe(0);
    expect(f.history()).toEqual(["forge", "store"]);
    expect(first.stdout + first.stderr).not.toContain(url);
  });

  it("does not validate or rediscover an available URL", () => {
    const f = fixture();
    f.configure("RPC_VERIFY_URL='stored-value-is-trusted'");
    expect(f.run("forge:webtrigger:upsert").status).toBe(0);
    expect(f.history()).toEqual([]);
  });

  it("uses SecretSpec values, upserts before verification, and keeps exit status", () => {
    const f = fixture();
    f.env["FAKE_VERIFY_STATUS"] = "7";
    const result = f.run("test:deployed");
    expect(result.status, result.stderr).toBe(7);
    expect(f.history()).toEqual(["forge", "store", "verify"]);
    expect(result.stdout).toContain('"fixture":true');
    expect(result.stdout + result.stderr).not.toContain(url);
  });

  it("requires a development Jira target before creating a URL", () => {
    for (const extra of [
      "FORGE_ENVIRONMENT=production",
      "FORGE_ENVIRONMENT=staging",
      "FORGE_ENVIRONMENT=''",
      "FORGE_PRODUCT=confluence",
      "FORGE_PRODUCT=''",
      "FORGE_SITE='--invalid'",
    ]) {
      const f = fixture();
      f.configure(extra);
      const result = f.run("test:deployed");
      expect(result.status).not.toBe(0);
      expect(f.history()).toEqual([]);
    }
  });

  it("stops on Forge, ambiguous output, and storage failures without leaking details", () => {
    for (const overrides of [
      { FAKE_FORGE_FAIL: "1" },
      { FAKE_FORGE_OUTPUT: "No URL returned" },
      { FAKE_FORGE_OUTPUT: `${url}\nhttps://another.example.test/rpc` },
      { FAKE_STORE_FAIL: "1" },
    ]) {
      const f = fixture();
      Object.assign(f.env, overrides);
      const result = f.run("test:deployed");
      expect(result.status).not.toBe(0);
      expect(f.history()).not.toContain("verify");
      expect(result.stdout + result.stderr).not.toMatch(/private-|https:\/\//);
    }
  });

  it.skipIf(!nativeSecretSpec)(
    "resolves and persists with native SecretSpec in isolated providers",
    () => {
      const f = fixture(true);
      mkdirSync(join(f.dir, "secretspec"));
      const local = join(f.dir, "project.env");
      writeFileSync(
        join(f.dir, "secretspec", "config.toml"),
        `
[defaults.providers]
shared_config = "dotenv:${f.values}"
project_config = "dotenv:${local}"
project_secrets = "dotenv:${f.values}"
`,
      );
      // Synthetic credentials only; this fixture does not access real providers.
      f.configure();
      writeFileSync(local, "");
      const declaration = join(f.dir, "secretspec.toml");
      writeFileSync(
        declaration,
        readFileSync(resolve("secretspec.toml"), "utf8").replaceAll(
          "[profiles.default.",
          "[profiles.review.",
        ),
      );
      f.env["SECRETSPEC_FILE"] = declaration;
      f.env["SECRETSPEC_PROFILE"] = "review";
      const first = f.run("test:deployed");
      expect(first.status, first.stderr).toBe(0);
      expect(f.history()).toEqual(["forge", "verify"]);
      expect(readFileSync(local, "utf8")).toContain(url);
      expect(f.run("test:deployed").status).toBe(0);
      expect(f.history()).toEqual(["forge", "verify", "verify"]);
      const check = execFileSync(
        "secretspec",
        ["check", "--scope", "runtime", "--json"],
        { env: f.env, encoding: "utf8" },
      );
      expect(check).toContain("RPC_BEARER_SECRET");
      expect(check).not.toContain("RPC_VERIFY_URL");
      execFileSync(
        "secretspec",
        ["delete", "--provider", "project_config", "RPC_VERIFY_URL"],
        { env: f.env, stdio: "pipe" },
      );
      expect(f.run("forge:webtrigger:upsert").status).toBe(0);
      expect(f.history()).toEqual(["forge", "verify", "verify", "forge"]);
    },
  );
});
