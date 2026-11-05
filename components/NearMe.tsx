"use client";

import { useEffect, useRef, useState } from "react";
import { areas, KK_BOX } from "@/content/areas";
import {
  CUISINE_LABELS,
  DEFAULT_RADIUS_KM,
  FIND_FOOD,
  RADII_KM,
  actionLabel,
  emptyActions,
  emptyBody,
  emptyKicker,
  errorNotice,
  filterSummary,
  foodSearchUrl,
  formatDistance,
  mapsUrl,
  refusedMessage,
  resetKicker,
  searchNearby,
  awaitSpin,
  cachedPlaces,
  type EmptyAction,
  type Filters,
  type NearbyRequest,
  type Place,
  type SpinCache,
} from "@/lib/near-me";
import { pickIndex } from "@/lib/pick";
import { buzz, chime, unlockAudio } from "@/lib/sound";
import { Spinner, landingTarget } from "@/lib/spin";
import {
  capMapsUrl,
  checkPlace,
  flashCopied,
  readShareId,
  sharePick,
  shareUrl,
  sharedView,
  withoutP,
  type SharedView,
} from "@/lib/share";
import { AreaPicker, field } from "./AreaPicker";
import { Button, buttonClass, buttonRow } from "./Button";
import { Notice } from "./Notice";
import { Wheel } from "./Wheel";

type Centre = { lat: number; lon: number };
// Nothing open reads the current filters: they only change through the sheet, whose close clears the notice.
type Shown = { kind: "empty" } | { kind: "error"; code: string };
// An opened share link. Only the ID ever reaches the url; the name lives here for this visit.
type Shared = { id: string; view: SharedView | "loading"; name: string | null; code: string };

// "/lapar-wheel/": a plain fetch path doesn't get the basePath on its own.
const base = import.meta.env.BASE_URL;
const MAX_SEGMENTS = 20;
const BUSY_LABEL = { locating: "Finding you…", searching: "Finding open places…", landing: "Spinning…" };
const mapsLink =
  "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-maps-edge bg-maps text-button font-extrabold text-on-maps";
const chip =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full border-(length:--edge) border-ghost-edge bg-ghost px-4 text-button text-ink has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus";

// A hidden page may never run animation frames, so it skips the animation like reduced motion: same pick, shown at once.
const motion = () => ({ hidden: document.hidden, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
const animates = (m: ReturnType<typeof motion>) => !m.hidden && !m.reducedMotion;

const insideKK = ({ lat, lon }: Centre) =>
  lat >= KK_BOX.south && lat <= KK_BOX.north && lon >= KK_BOX.west && lon <= KK_BOX.east;

/** Asks for the location only when called. Refused, unavailable or timed out all give null. */
function locate(): Promise<Centre | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

/** The near me flow: wheel, filters, spin, result. The location lives in this state only, never in storage. */
export function NearMe() {
  const [mode, setMode] = useState<"unset" | "here" | "area">("unset");
  const [here, setHere] = useState<Centre | null>(null);
  const [areaId, setAreaId] = useState(areas[0].id);
  const [refused, setRefused] = useState(false);
  // Only an earlier fix this visit tells us; we never guess from anything else.
  const [outsideKK, setOutsideKK] = useState(false);
  const [locating, setLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [cuisine, setCuisine] = useState("");
  const [ratingOn, setRatingOn] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Place | null>(null);
  const [notice, setNotice] = useState<Shown | null>(null);
  // Refs, so a second tap in the same tick can't start a second spin.
  const busyRef = useRef(false);
  const cache = useRef<SpinCache | null>(null);
  const [spinner] = useState(() => new Spinner());
  // What the Spin button says while busy, and the landed segment the wheel highlights.
  const [phase, setPhase] = useState<"locating" | "searching" | "landing">("landing");
  const [winner, setWinner] = useState<number | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const filtersAtOpen = useRef("");
  const summary = useRef<HTMLButtonElement>(null);
  const [shared, setShared] = useState<Shared | null>(null);
  const opened = useRef(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const cancelCopied = useRef(() => {});

  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const filters = JSON.stringify([mode, areaId, radiusKm, cuisine, ratingOn]);

  async function askLocation(): Promise<Centre | null> {
    setLocating(true);
    const found = await locate();
    setLocating(false);
    if (found) {
      setHere(found);
      setMode("here");
      setRefused(false);
      setOutsideKK(!insideKK(found));
    } else {
      // The KK area picker is no use to someone we know is elsewhere: the next spin asks for location again.
      setMode(outsideKK ? "unset" : "area");
      setRefused(true);
    }
    return found;
  }

  function done() {
    busyRef.current = false;
    setBusy(false);
  }

  /** No pick this time: a waiting wheel coasts to a stop. */
  function halt() {
    spinner.coast();
    done();
  }

  // Unmounting stops the frame loop.
  useEffect(() => () => spinner.snap(), [spinner]);

  /**
   * Spins with the current filters, or with `over` when a notice's button has just changed one.
   * `swipe` is a fast release's signed speed: the wheel keeps that direction.
   */
  async function spin(over: Partial<Filters> = {}, swipe = 0) {
    const f = { radiusKm, cuisine, ratingOn, ...over };
    if (busyRef.current) return;
    // Before any await: browsers only start audio inside the tap itself.
    unlockAudio();
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setPick(null);
    setWinner(null);
    cancelCopied.current();
    setCopied(null);
    setCopyFailed(false);
    // While the location and places are on their way, the wheel keeps turning.
    if (animates(motion())) spinner.wait(swipe);

    // Only a spin with no location yet has to find one first.
    setPhase(mode === "unset" ? "locating" : "searching");
    const centre = mode === "here" ? here : mode === "area" ? area : await askLocation();
    if (!centre) return halt();

    const request: NearbyRequest = {
      lat: centre.lat,
      lon: centre.lon,
      radiusKm: f.radiusKm,
      ...(f.cuisine && { cuisine: f.cuisine }),
      ...(!f.ratingOn && { minRating: null }),
    };
    const key = JSON.stringify(request);
    let list = cachedPlaces(cache.current, key);
    if (!list) {
      setPhase("searching");
      const result = await searchNearby(request, base);
      if (!result.ok) {
        setNotice({ kind: "error", code: result.error });
        return halt();
      }
      list = result.places.slice(0, MAX_SEGMENTS);
      cache.current = { key, places: list };
      setPlaces(list);
    }
    if (!list.length) {
      setNotice({ kind: "empty" });
      return halt();
    }

    // Pick first; the landing is computed from the pick and always ends on it.
    const index = pickIndex(list.length);
    const picked = list[index];
    spinner.setSegments(list.length);
    const target = landingTarget(spinner.angle, index, list.length, spinner.speed);
    const skip = motion();
    const animated = animates(skip);
    setPhase("landing");
    const finish = awaitSpin(() => {
      spinner.snap(target);
      setPick(picked);
      setWinner(index);
      done();
      // Sound isn't motion: the chime plays under reduced motion too.
      chime();
      // 70 ms and up: many phone motors can't render a 30 ms pulse at all.
      buzz(animated ? [70, 50, 110] : 70);
    }, skip);
    if (animated) spinner.land(target, finish);
  }

  /** A nothing-open button: loosen that one filter and spin at once. */
  function loosen(a: EmptyAction) {
    if (a.kind === "radius") setRadiusKm(a.km);
    if (a.kind === "cuisine") setCuisine("");
    if (a.kind === "rating") setRatingOn(false);
    void spin(a.kind === "radius" ? { radiusKm: a.km } : a.kind === "cuisine" ? { cuisine: "" } : { ratingOn: false });
  }

  /** An opened link's one call. "Try again" repeats it; it never asks for location or spins. */
  async function openShared(id: string) {
    setShared({ id, view: "loading", name: null, code: "" });
    const r = await checkPlace(id, base);
    setShared({ id, view: sharedView(r), name: r.ok ? r.name : null, code: r.ok ? "" : r.error });
  }

  // Read p once. The ref keeps React's dev double-run to a single call.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const link = readShareId(location.search);
    if (link && "drop" in link) history.replaceState(null, "", withoutP(location.href));
    // The static HTML has no p, so the url can only be read here, after hydration; one extra render is the cost.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (link) void openShared(link.id);
  }, []);

  /** Back to the normal start screen, without p. It doesn't spin. */
  function spinOwn() {
    history.replaceState(null, "", withoutP(location.href));
    setShared(null);
  }

  async function share(p: Place) {
    const outcome = await sharePick(navigator, { name: p.name, url: shareUrl(p.id) });
    if (outcome === "copied") {
      cancelCopied.current();
      cancelCopied.current = flashCopied(setCopied);
    }
    setCopyFailed(outcome === "failed");
  }

  function openSheet() {
    if (busyRef.current) return;
    filtersAtOpen.current = filters;
    sheet.current?.showModal();
  }

  // Escape, a backdrop tap and Done all close the dialog, so the check lives in its close event.
  function sheetClosed() {
    if (filters === filtersAtOpen.current) return;
    setPick(null);
    setNotice(null);
    setWinner(null);
    // The opener may have been the result card's Change filters link, which is now gone.
    requestAnimationFrame(() => summary.current?.focus());
  }

  function resetFilters() {
    setRadiusKm(DEFAULT_RADIUS_KM);
    setCuisine("");
    setRatingOn(true);
  }

  const showRefused = refused && !busy && !pick && !notice;
  const error = notice?.kind === "error" ? errorNotice(notice.code) : null;
  const sharedError = shared?.view === "error" ? errorNotice(shared.code) : null;
  const closed = Boolean(error?.cap) || shared?.view === "cap";

  // Out of spins, the night stall closes: the roof bulbs and neon title (in app/page.tsx) go off.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-closed", closed);
  }, [closed]);

  const findFood = (variant: "paper" | "paper-outline") => (
    <a key="maps" href={foodSearchUrl(cuisine)} target="_blank" rel="noopener noreferrer" className={buttonClass(variant)}>
      {FIND_FOOD}
    </a>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* The turning square's corners reach 1.41× its width mid-turn; clip them so the page never scrolls sideways. */}
      <section
        aria-label="Wheel"
        className={`overflow-x-clip ${
          notice || showRefused || (shared && shared.view !== "loading" && shared.view !== "shared") ? "wheel-dim" : ""
        }`}
      >
        <Wheel
          names={places.map((p) => p.name)}
          spinning={busy}
          spinner={spinner}
          // A swipe starts a spin wherever the Spin or Spin again button would.
          swipe={!busy && !notice && !showRefused && !shared ? (speed) => void spin({}, speed) : null}
          winner={winner}
        />
      </section>

      <div role="status" aria-live="polite" className="empty:hidden">
        {pick && (
          <article className="card rise flex flex-col gap-3 p-4">
            <p className="text-kicker text-accent">Go makan at</p>
            <h2 className="font-sign text-place break-words">{pick.name}</h2>
            <p>{formatDistance(pick.distanceM)} away, open now.</p>
            <a href={mapsUrl(pick.name, pick.id)} target="_blank" rel="noopener noreferrer" className={mapsLink}>
              Open in Maps
            </a>
            <div className={buttonRow}>
              <Button onClick={() => void spin()} disabled={busy}>
                Spin again
              </Button>
              <Button onClick={() => void share(pick)} disabled={busy}>
                {copied ?? "Share"}
              </Button>
            </div>
            {copyFailed && (
              <label className="flex flex-col gap-2">
                <span className="sr-only">Share link</span>
                <input readOnly value={shareUrl(pick.id)} onFocus={(e) => e.currentTarget.select()} className={field} />
              </label>
            )}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={openSheet}
              disabled={busy}
              className="min-h-11 cursor-pointer self-center px-3 text-notice-body font-semibold underline underline-offset-3"
            >
              Change filters
            </button>
            <p className="text-small text-ink-soft" translate="no">
              Google Maps
            </p>
          </article>
        )}
        {(shared?.view === "loading" || shared?.view === "shared" || shared?.view === "cap") && (
          // No rise: it shows on page load, and nothing moves on load.
          <article className="card flex flex-col gap-3 p-4" aria-busy={shared.view === "loading"}>
            <p className="text-kicker text-accent">Shared with you</p>
            {/* Bungee while loading too, so the card doesn't jump when the name arrives. */}
            <h2 className="font-sign text-place break-words">
              {shared.view === "loading" ? "Finding the place…" : shared.view === "cap" ? "A place picked for you" : shared.name}
            </h2>
            {shared.view === "shared" && shared.name && (
              <>
                <p>Picked on Lapar Wheel. Check the hours in Maps before you go.</p>
                <a href={mapsUrl(shared.name, shared.id)} target="_blank" rel="noopener noreferrer" className={mapsLink}>
                  Open in Maps
                </a>
                <Button onClick={spinOwn}>Spin your own</Button>
                <p className="text-small text-ink-soft" translate="no">
                  Google Maps
                </p>
              </>
            )}
            {shared.view === "cap" && (
              <>
                <p>Lapar Wheel is out of spins for today, so it can’t show the name here. Maps can.</p>
                <a href={capMapsUrl(shared.id)} target="_blank" rel="noopener noreferrer" className={mapsLink}>
                  Open in Maps
                </a>
              </>
            )}
          </article>
        )}
        {shared?.view === "gone" && (
          <Notice
            picture="cap"
            headline="Not available"
            body="This place isn’t available anymore. Spin for somewhere that’s open."
            actions={
              <Button variant="paper" onClick={spinOwn}>
                Spin your own
              </Button>
            }
          />
        )}
        {shared && sharedError && (
          <Notice
            headline={sharedError.headline}
            body={sharedError.body}
            actions={
              <Button variant="paper" onClick={() => void openShared(shared.id)}>
                Try again
              </Button>
            }
          />
        )}
        {notice?.kind === "empty" && (
          <Notice
            picture="empty"
            kicker={emptyKicker({ radiusKm, cuisine, ratingOn })}
            headline="Nothing open nearby"
            body={emptyBody(radiusKm)}
            actions={emptyActions({ radiusKm, cuisine, ratingOn }).map((a, i) =>
              a.kind === "maps" ? (
                findFood("paper")
              ) : (
                <Button key={a.kind} variant={i ? "paper-outline" : "paper"} onClick={() => loosen(a)}>
                  {actionLabel(a)}
                </Button>
              ),
            )}
          >
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={openSheet}
              className="min-h-11 cursor-pointer self-center px-3 text-notice-body font-semibold underline underline-offset-3"
            >
              Change filters
            </button>
          </Notice>
        )}
        {error && (
          <Notice
            picture={error.cap ? "cap" : undefined}
            kicker={error.cap ? resetKicker(new Date()) : undefined}
            headline={error.headline}
            body={error.body}
            actions={
              error.cap ? (
                findFood("paper")
              ) : (
                <Button variant="paper" onClick={() => void spin()}>
                  Try again
                </Button>
              )
            }
          />
        )}
        {showRefused && (
          <Notice
            headline="Location is off"
            body={
              <div className="flex flex-col gap-3">
                <p>{refusedMessage(outsideKK)}</p>
                {mode === "area" && <AreaPicker areaId={areaId} onChange={setAreaId} />}
              </div>
            }
            actions={
              <>
                {/* The Spin button hides while a notice shows, so the area picker brings its own. */}
                {mode === "area" && (
                  <Button variant="paper" onClick={() => void spin()}>
                    Spin
                  </Button>
                )}
                <Button
                  variant={mode === "area" ? "paper-outline" : "paper"}
                  onClick={() => void askLocation()}
                  disabled={locating}
                >
                  {locating ? "Finding you…" : "Try location again"}
                </Button>
              </>
            }
          />
        )}
      </div>

      {!pick && !notice && !showRefused && !shared && (
        <>
          <button
            ref={summary}
            type="button"
            aria-haspopup="dialog"
            onClick={openSheet}
            disabled={busy}
            className="panel flex min-h-13 w-full items-center justify-between gap-3 px-4 py-2 text-left disabled:cursor-wait"
          >
            <span>
              {filterSummary({ areaName: mode === "area" ? area.name : null, radiusKm, cuisine, ratingOn })}
            </span>
            <span className="font-extrabold text-accent underline underline-offset-4">Change</span>
          </button>
          <Button variant="spin" onClick={() => void spin()} disabled={busy} aria-busy={busy}>
            {busy ? BUSY_LABEL[phase] : "Spin"}
          </Button>
          <p className="text-center text-small">Or swipe the wheel</p>
        </>
      )}

      <dialog
        ref={sheet}
        aria-labelledby="sheet-title"
        onClose={sheetClosed}
        // A tap outside the inner box lands on the dialog itself: the backdrop.
        onClick={(e) => e.target === e.currentTarget && sheet.current?.close()}
        className="sheet mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[390px] rounded-t-sheet border-0 border-t-(length:--edge) border-card-edge bg-panel p-0 text-body text-ink"
      >
        <div className="flex flex-col gap-6 px-4 pt-6 pb-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="sheet-title" className="font-sign text-sheet-title">
              Filters
            </h2>
            <Button variant="small" onClick={resetFilters}>
              Reset
            </Button>
          </div>

          <section aria-labelledby="where" className="flex flex-col gap-3">
            <p id="where" className="font-extrabold">
              Where
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void askLocation()} disabled={locating}>
                {locating ? "Finding you…" : "Near me"}
              </Button>
              {mode === "here" && <p>Using your location.</p>}
            </div>
            {mode === "area" && <AreaPicker areaId={areaId} onChange={setAreaId} />}
            <p className="text-small text-ink-soft">Your location is only used for this search. It’s never stored.</p>
          </section>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-extrabold">How far?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {RADII_KM.map((r) => (
                <label key={r} className={chip}>
                  <input
                    type="radio"
                    name="radius"
                    value={r}
                    checked={radiusKm === r}
                    onChange={() => setRadiusKm(r)}
                    className="sr-only"
                  />
                  {r} km
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="font-extrabold">What kind?</span>
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} className={field}>
              {Object.entries(CUISINE_LABELS).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-13 items-center justify-between gap-3 font-semibold">
            Rated 4.0 and up
            <input
              type="checkbox"
              role="switch"
              checked={ratingOn}
              onChange={(e) => setRatingOn(e.target.checked)}
              className="size-6 accent-accent"
            />
          </label>

          <Button variant="action" onClick={() => sheet.current?.close()}>
            Done
          </Button>
        </div>
      </dialog>
    </div>
  );
}
