import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AreaPicker } from "../components/AreaPicker";
import { areas } from "../content/areas";
import { KK_BOX } from "../worker/api";

const render = (refused: boolean) =>
  renderToStaticMarkup(<AreaPicker areaId="city-centre" onChange={() => {}} refused={refused} />);

describe("AreaPicker", () => {
  it("shows the fallback when location is refused: the message, every area and the OSM credit", () => {
    const html = render(true);
    expect(html).toContain("Couldn’t get your location. Pick an area instead.");
    for (const a of areas) expect(html).toContain(`>${a.name}</option>`);
    expect(html).toContain("Area centres © OpenStreetMap contributors");
  });

  it("leaves out the refused message when the location was only outside the area", () => {
    expect(render(false)).not.toContain("Couldn’t get your location");
  });

  it("has the 10 spec areas, each inside the Worker's KK box", () => {
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
