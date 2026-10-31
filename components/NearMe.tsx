"use client";

import { useRef, useState } from "react";
import { areas } from "@/content/areas";
import {
  CUISINE_LABELS,
  DEFAULT_RADIUS_KM,
  RADII_KM,
  emptyMessage,
  errorMessage,
  formatDistance,
  mapsUrl,
  nextRadius,
  searchNearby,
  wheelRotation,
  type NearbyRequest,
  type Place,
} from "@/lib/near-me";
import { pickIndex } from "@/lib/pick";
import { AreaPicker } from "./AreaPicker";
import { Button } from "./Button";
import { Wheel } from "./Wheel";

type Centre = { lat: number; lon: number };
type Notice = { text: string; retryRadius: number | null };

// "/lapar-wheel/": a plain fetch path doesn't get the basePath on its own.
const base = import.meta.env.BASE_URL;
const MAX_SEGMENTS = 20;
const label = "rounded-sm border border-label-edge bg-surface-label p-4 shadow-label md:p-6";
const chip =
  "cursor-pointer rounded-md border-2 border-stamp px-4 py-2 text-button text-stamp has-checked:bg-stamp has-checked:text-on-stamp has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus";

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

/** The near me flow: where, filters, spin, result. The location lives in this state only, never in storage. */
export function NearMe() {
  const [mode, setMode] = useState<"unset" | "here" | "area">("unset");
  const [here, setHere] = useState<Centre | null>(null);
  const [areaId, setAreaId] = useState(areas[0].id);
  const [refused, setRefused] = useState(false);
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
  const fetchedFor = useRef("");
  const pending = useRef<Place | null>(null);

  async function askLocation(): Promise<Centre | null> {
    setLocating(true);
    const found = await locate();
    setLocating(false);
    if (found) {
      setHere(found);
      setMode("here");
      setRefused(false);
    } else {
      setMode("area");
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

    const area = areas.find((a) => a.id === areaId) ?? areas[0];
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
    let list = places;
    // Spin again with the same filters re-picks from the same results, with no new Google call.
    if (key !== fetchedFor.current) {
      const result = await searchNearby(request, base);
      if (!result.ok) {
        setNotice({ text: errorMessage(result.error), retryRadius: null });
        if (result.error === "outside_area" && mode !== "area") {
          setMode("area");
          setRefused(false);
        }
        return done();
      }
      list = result.places.slice(0, MAX_SEGMENTS);
      fetchedFor.current = key;
      setPlaces(list);
    }
    if (!list.length) {
      setNotice({ text: emptyMessage(radius), retryRadius: nextRadius(radius) });
      return done();
    }

    const index = pickIndex(list.length);
    pending.current = list[index];
    setRotation((r) => wheelRotation(r, index, list.length));
    // No transition runs under reduced motion, so show the same pick straight away.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) finishSpin();
  }

  function tryRadius(next: number) {
    setRadiusKm(next);
    void spin(next);
  }

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2 md:items-start">
      <section aria-label="Wheel" className="flex flex-col items-center gap-6">
        <Wheel names={places.map((p) => p.name)} rotation={rotation} onSpinEnd={finishSpin} />
        <Button variant="primary" pill onClick={() => void spin()} disabled={busy} aria-busy={busy}>
          {busy ? "Spinning…" : "Spin"}
        </Button>
      </section>

      <div className="flex flex-col gap-6">
        <div role="status" aria-live="polite" className="empty:hidden">
          {pick && (
            <article className={label}>
              <p className="text-body-sm text-ink-soft">The wheel picked</p>
              <h2 className="condensed mt-1 text-title break-words">{pick.name}</h2>
              <p className="mt-1">{formatDistance(pick.distanceM)} away, open now.</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a
                  href={mapsUrl(pick.name, pick.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stamp underline underline-offset-4 hover:decoration-2"
                >
                  Open in Maps
                </a>
                <Button onClick={() => void spin()} disabled={busy}>
                  Spin again
                </Button>
              </div>
              <p className="mt-4 text-body-sm text-ink-soft" translate="no">
                Google Maps
              </p>
            </article>
          )}
          {notice && (
            <div className={label}>
              <p>{notice.text}</p>
              {notice.retryRadius && (
                <Button className="mt-4" onClick={() => tryRadius(notice.retryRadius as number)} disabled={busy}>
                  Try {notice.retryRadius} km?
                </Button>
              )}
            </div>
          )}
        </div>

        <section className={label} aria-labelledby="where">
          <h2 id="where" className="condensed text-title">
            Where
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button onClick={() => void askLocation()} disabled={locating || busy}>
              {locating ? "Finding you…" : "Near me"}
            </Button>
            {mode === "here" && <p>Using your location.</p>}
          </div>
          {mode === "area" && <AreaPicker areaId={areaId} onChange={setAreaId} refused={refused} />}
          <p className="mt-4 text-body-sm text-ink-soft">Your location is only used for this search. It’s never stored.</p>

          <fieldset className="mt-6">
            <legend className="text-body-sm text-ink-soft">How far</legend>
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

          <label className="mt-6 block">
            <span className="block text-body-sm text-ink-soft">Cuisine</span>
            <select
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              className="mt-1 w-full rounded-sm border border-ink-soft bg-surface-label px-3 py-2 text-body"
            >
              {Object.entries(CUISINE_LABELS).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-6 flex items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={ratingOn}
              onChange={(e) => setRatingOn(e.target.checked)}
              className="size-5 accent-stamp"
            />
            Rated 4.0 and up
          </label>
        </section>
      </div>
    </div>
  );
}
