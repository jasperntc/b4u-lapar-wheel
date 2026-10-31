import { areas } from "@/content/areas";

type Props = {
  areaId: string;
  onChange: (areaId: string) => void;
  /** True when location was refused or unavailable, rather than outside the area. */
  refused: boolean;
};

/** The search centre when location isn't available. Its coordinates are OSM place nodes, hence the credit. */
export function AreaPicker({ areaId, onChange, refused }: Props) {
  return (
    <div className="mt-4">
      {refused && <p>Couldn’t get your location. Pick an area instead.</p>}
      <label className="mt-2 block">
        <span className="block text-body-sm text-ink-soft">Area</span>
        <select
          value={areaId}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-sm border border-ink-soft bg-surface-label px-3 py-2 text-body"
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-body-sm text-ink-soft">Area centres © OpenStreetMap contributors</p>
    </div>
  );
}
