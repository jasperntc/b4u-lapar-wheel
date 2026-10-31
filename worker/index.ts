// The Worker entry. The runtime treats every export here as an entrypoint, so only the
// fetch handler and the Durable Object class may be exported. Everything else is in api.ts.
import { handle } from "./api.ts";

export { Limits } from "./limits.ts";

const worker = { fetch: handle };
export default worker;
