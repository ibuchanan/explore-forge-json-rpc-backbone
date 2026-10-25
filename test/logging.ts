import type { ForgeLoggerOptions } from "@forge-ahead/logging";
import { beforeEach, vi } from "vitest";

const captures = vi.hoisted(
  () => [] as { records: Record<string, unknown>[] }[],
);
vi.mock("@forge-ahead/logging", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@forge-ahead/logging")>();
  const { createCapturingLogger } = await import(
    "@forge-ahead/logging/testing"
  );
  return {
    ...actual,
    createForgeLogger: (options: ForgeLoggerOptions) => {
      const capture = createCapturingLogger({
        ...options,
        env: { LOG_LEVEL: "info" },
      });
      captures.push(capture);
      return capture.logger;
    },
  };
});
beforeEach(() => {
  for (const capture of captures) capture.records.length = 0;
});

export const logRecords = () => captures.flatMap(({ records }) => records);
