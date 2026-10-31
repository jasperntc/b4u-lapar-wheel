import type { Env } from "../../worker/api.ts";
import { Limits } from "../../worker/limits.ts";

/** A Worker env with a real Limits object over in-memory storage, and a stand-in for static assets. */
export function fakeEnv() {
  const store = new Map<string, unknown>();
  const limits = new Limits({
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, value),
    },
  });
  const env: Env = {
    GOOGLE_PLACES_API_KEY: "test-key",
    LIMITS: { idFromName: () => "limits", get: () => limits },
    ASSETS: { fetch: async () => new Response("static asset") },
  };
  return { env, store, limits };
}
