import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AreaPicker } from "../components/AreaPicker";
import { areas, KK_BOX } from "../content/areas";

const render = () => renderToStaticMarkup(<AreaPicker areaId="city-centre" onChange={() => {}} />);

describe("AreaPicker", () => {
  it("offers every KK area under its title, with the OSM credit", () => {
    const html = render();
    expect(html).toContain("Pick an area in Kota Kinabalu");
    for (const a of areas) expect(html).toContain(`>${a.name}</option>`);
    expect(html).toContain("Area centres © OpenStreetMap contributors");
  });

  it("has the 10 spec areas, each inside the KK box", () => {
    expect(areas.map((a) => a.name)).toEqual([
      "City centre",
      "Likas",
      "Inanam",
      "Menggatal",
      "Luyang",
      "Damai",
      "Tanjung Aru",
      "Kepayan",
      "Penampang",
      "Putatan",
    ]);
    for (const a of areas) {
      expect(a.lat).toBeGreaterThanOrEqual(KK_BOX.south);
      expect(a.lat).toBeLessThanOrEqual(KK_BOX.north);
      expect(a.lon).toBeGreaterThanOrEqual(KK_BOX.west);
      expect(a.lon).toBeLessThanOrEqual(KK_BOX.east);
    }
  });
});
