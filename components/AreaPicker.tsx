import { areas } from "@/content/areas";

type Props = {
  areaId: string;
  onChange: (areaId: string) => void;
};

/** The search centre when location is refused: greater KK only. Its coordinates are OSM place nodes, hence the credit. */
export function AreaPicker({ areaId, onChange }: Props) {
  return (
    <div className="mt-4">
      <label className="block">
        <span className="block text-body-sm text-ink-soft">Pick an area in Kota Kinabalu</span>
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
