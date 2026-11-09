import { kvs } from "@forge/kvs";
import type { PrefixStore } from "./executor";

export const store: PrefixStore = {
  get: () => kvs.get<string>("config.prefix"),
  set: (prefix: string) => kvs.set("config.prefix", prefix),
  reset: () => kvs.delete("config.prefix"),
};
