"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { areas, KK_BOX } from "@/content/areas";
import {
  CUISINE_LABELS,
  DEFAULT_RADIUS_KM,
  RADII_KM,
  emptyMessage,
  errorMessage,
  filterSummary,
  formatDistance,
  mapsUrl,
  nextRadius,
  refusedMessage,
  searchNearby,
  awaitSpin,
  cachedPlaces,
  wheelRotation,
  type NearbyRequest,
  type Place,
  type SpinCache,
} from "@/lib/near-me";
import { pickIndex } from "@/lib/pick";
import { AreaPicker, field } from "./AreaPicker";
import { Button } from "./Button";
import { Wheel } from "./Wheel";

type Centre = { lat: number; lon: number };
type Notice = { text: string; retryRadius: number | null; picture: "empty" | "cap" | null };

// "/lapar-wheel/": a plain fetch path doesn't get the basePath on its own.
const base = import.meta.env.BASE_URL;
const MAX_SEGMENTS = 20;
const chip =
  "inline-flex min-h-11 cursor-pointer items-center rounded-full border-(length:--edge) border-ghost-edge bg-ghost px-4 text-button text-ink has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus";
const picture = "size-40 rounded-panel border-(length:--edge) border-panel-edge";

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
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Place | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Refs, so a second tap in the same tick can't start a second spin.
  const busyRef = useRef(false);
  const cache = useRef<SpinCache | null>(null);
  const pending = useRef<Place | null>(null);
  const spinEnd = useRef(() => {});
  const [animate, setAnimate] = useState(true);
  const sheet = useRef<HTMLDialogElement>(null);
  const filtersAtOpen = useRef("");
  const summary = useRef<HTMLButtonElement>(null);

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

  function finishSpin() {
    setPick(pending.current);
    done();
  }

  async function spin(radius = radiusKm) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setPick(null);

    const centre = mode === "here" ? here : mode === "area" ? area : await askLocation();
    if (!centre) return done();

    const request: NearbyRequest = {
      lat: centre.lat,
      lon: centre.lon,
      radiusKm: radius,
      ...(cuisine && { cuisine }),
      ...(!ratingOn && { minRating: null }),
    };
    const key = JSON.stringify(request);
    let list = cachedPlaces(cache.current, key);
    if (!list) {
      const result = await searchNearby(request, base);
      if (!result.ok) {
        const cap = result.error === "daily_cap" || result.error === "ip_daily_cap";
        setNotice({ text: errorMessage(result.error), retryRadius: null, picture: cap ? "cap" : null });
        return done();
      }
      list = result.places.slice(0, MAX_SEGMENTS);
      cache.current = { key, places: list };
      setPlaces(list);
    }
    if (!list.length) {
      setNotice({ text: emptyMessage(radius), retryRadius: nextRadius(radius), picture: "empty" });
      return done();
    }

    const index = pickIndex(list.length);
    pending.current = list[index];
    // A hidden page may never run the transition, so it skips the animation like reduced motion: same pick, shown at once.
    const skip = { hidden: document.hidden, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
    setAnimate(!skip.hidden && !skip.reducedMotion);
    setRotation((r) => wheelRotation(r, index, list.length));
    spinEnd.current = awaitSpin(finishSpin, skip);
  }

  function tryRadius(next: number) {
    setRadiusKm(next);
    void spin(next);
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
    // The opener may have been the result card's Filters button, which is now gone.
    requestAnimationFrame(() => summary.current?.focus());
  }

  function resetFilters() {
    setRadiusKm(DEFAULT_RADIUS_KM);
    setCuisine("");
    setRatingOn(true);
  }

  const showRefused = refused && !busy && !pick && !notice;

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Wheel">
        <Wheel
          names={places.map((p) => p.name)}
          rotation={rotation}
          animate={animate}
          spinning={busy}
          onSpinEnd={() => spinEnd.current()}
        />
      </section>

      <div role="status" aria-live="polite" className="empty:hidden">
        {pick && (
          <article className="card rise flex flex-col gap-3 p-4">
            <p className="text-kicker text-accent">Go makan at</p>
            <h2 className="font-sign text-place break-words">{pick.name}</h2>
            <p>{formatDistance(pick.distanceM)} away, open now.</p>
            <a
              href={mapsUrl(pick.name, pick.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-maps-edge bg-maps text-button font-extrabold text-on-maps"
            >
              Open in Maps
            </a>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => void spin()} disabled={busy}>
                Spin again
              </Button>
              <Button onClick={openSheet} disabled={busy} aria-haspopup="dialog">
                Filters
              </Button>
            </div>
            <p className="text-small text-ink-soft" translate="no">
              Google Maps
            </p>
          </article>
        )}
        {notice && (
          <div className="panel flex flex-col items-start gap-3 p-4">
            {notice.picture === "empty" && (
              <Image src={`${base}images/spot-empty-cup.jpg`} alt="" width={160} height={160} className={picture} />
            )}
            {notice.picture === "cap" && (
              <>
                <Image src={`${base}images/spot-shutter-day.jpg`} alt="" width={160} height={160} className={`${picture} night:hidden`} />
                <Image src={`${base}images/spot-stall-night.jpg`} alt="" width={160} height={160} className={`${picture} day:hidden`} />
              </>
            )}
            <p>{notice.text}</p>
            {notice.retryRadius && (
              <Button onClick={() => tryRadius(notice.retryRadius as number)} disabled={busy}>
                Try {notice.retryRadius} km?
              </Button>
            )}
          </div>
        )}
        {showRefused && (
          <div className="panel flex flex-col items-start gap-3 p-4">
            <p>{refusedMessage(outsideKK)}</p>
            {mode === "area" && (
              <div className="w-full">
                <AreaPicker areaId={areaId} onChange={setAreaId} />
              </div>
            )}
            <Button onClick={() => void askLocation()} disabled={locating}>
              {locating ? "Finding you…" : "Try location again"}
            </Button>
          </div>
        )}
      </div>

      {!pick && (
        <>
          {!notice && !showRefused && (
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
          )}
          <Button variant="spin" onClick={() => void spin()} disabled={busy} aria-busy={busy}>
            {busy ? "Spinning…" : "Spin"}
          </Button>
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
