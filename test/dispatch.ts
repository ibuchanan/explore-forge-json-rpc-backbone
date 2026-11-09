import { createAdoptedRpc } from "../src/adoption";
import type { Caller, PrefixStore } from "../src/executor";

/** Single-call dispatch through the same package dispatcher the app runs. */
export const dispatch = (
  request: unknown,
  caller: Caller,
  store: PrefixStore,
) => createAdoptedRpc({ store }).dispatch(request, { caller, store });
