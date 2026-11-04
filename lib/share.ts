// Share links: the url carries one place ID and nothing else (CLAUDE.md, Share links).

export const SHARE_BASE = "https://built4you.jasperntc.dev/lapar-wheel";
/**
 * A Google place ID: 16 to 256 URL-safe characters. The app drops anything else from a share link, and the
 * Worker answers it with 400 before the limits and before Google. One pattern for both, so they can't drift.
 */
export const PLACE_ID = /^[A-Za-z0-9_-]{16,256}$/;

export function shareUrl(id: string): string {
  return `${SHARE_BASE}?${new URLSearchParams({ p: id })}`;
}

/** `{ id }` for a valid `p`, `{ drop: true }` for one to remove from the url, `null` when there's none. */
export function readShareId(search: string): { id: string } | { drop: true } | null {
  const p = new URLSearchParams(search).get("p");
  if (p === null) return null;
  return PLACE_ID.test(p) ? { id: p } : { drop: true };
}

/** The same url without `p`, for history.replaceState. */
export function withoutP(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("p");
  return url.href;
}

export type PlaceCheck = { ok: true; name: string | null; available: boolean } | { ok: false; error: string };

/** GET /lapar-wheel/api/place/:id?check=status, the one call an opened link makes. Failures count as upstream. */
export async function checkPlace(id: string, base = "/lapar-wheel/"): Promise<PlaceCheck> {
  try {
    const res = await fetch(`${base}api/place/${id}?check=status`);
    const data = (await res.json()) as { name?: unknown; available?: unknown; error?: unknown } | null;
    if (res.ok && typeof data?.available === "boolean") {
      return { ok: true, name: typeof data.name === "string" ? data.name : null, available: data.available };
    }
    return { ok: false, error: typeof data?.error === "string" ? data.error : "upstream" };
  } catch {
    return { ok: false, error: "upstream" };
  }
}

export type SharedView = "shared" | "gone" | "cap" | "error";

/** Which screen an opened link shows. Open but nameless counts as gone: there'd be nothing to show. */
export function sharedView(r: PlaceCheck): SharedView {
  if (r.ok) return r.available && r.name ? "shared" : "gone";
  return r.error === "daily_cap" || r.error === "ip_daily_cap" ? "cap" : "error";
}

/** Out of spins we can't fetch the name, so Maps finds the place by ID alone. */
export function capMapsUrl(id: string): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: "restaurant", query_place_id: id })}`;
}

type ShareNav = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
};

/** The share sheet where there is one, else a copy. A dismissed sheet is "cancelled", not an error. */
export async function sharePick(
  nav: ShareNav,
  { name, url }: { name: string; url: string },
): Promise<"shared" | "cancelled" | "copied" | "failed"> {
  if (nav.share) {
    try {
      await nav.share({ title: "Lapar Wheel", text: `The wheel picked ${name}.`, url });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Not allowed or not supported here: fall through to the copy.
    }
  }
  try {
    if (!nav.clipboard) return "failed";
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export const COPIED = "Link copied";
export const COPIED_MS = 2000;

/** Shows "Link copied" on the Share button, then puts its label back. Returns a cancel for unmounts and re-taps. */
export function flashCopied(set: (label: string | null) => void, ms = COPIED_MS): () => void {
  set(COPIED);
  const timer = setTimeout(() => set(null), ms);
  return () => clearTimeout(timer);
}
