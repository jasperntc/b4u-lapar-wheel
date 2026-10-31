/** Search centres for when location is refused. Coordinates are OSM place nodes (© OpenStreetMap contributors, ODbL),
 * from data/raw/osm-kk-areas-2026-10-24.json; the city centre is the `place=city` node 303545829. */
export type Area = { id: string; name: string; lat: number; lon: number };

export const areas: Area[] = [
  { id: "city-centre", name: "City centre", lat: 5.978, lon: 116.073 },
  { id: "likas", name: "Likas", lat: 5.988, lon: 116.102 },
  { id: "inanam", name: "Inanam", lat: 5.992, lon: 116.136 },
  { id: "menggatal", name: "Menggatal", lat: 6.03, lon: 116.158 },
  { id: "luyang", name: "Luyang", lat: 5.961, lon: 116.09 },
  { id: "damai", name: "Damai", lat: 5.97, lon: 116.09 },
  { id: "tanjung-aru", name: "Tanjung Aru", lat: 5.953, lon: 116.056 },
  { id: "kepayan", name: "Kepayan", lat: 5.924, lon: 116.059 },
  { id: "penampang", name: "Penampang", lat: 5.907, lon: 116.089 },
  { id: "putatan", name: "Putatan", lat: 5.883, lon: 116.05 },
];
