import { areas } from "@/content/areas";

type Props = {
  areaId: string;
  onChange: (areaId: string) => void;
};

export const field = "h-12 w-full rounded-panel border-(length:--edge) border-ghost-edge bg-field px-3 text-body text-ink";

/** The search centre when location is refused: greater KK only. Its coordinates are OSM place nodes, hence the credit. */
export function AreaPicker({ areaId, onChange }: Props) {
  return (
    <div>
      <label className="block">
        <span className="block font-extrabold">Pick an area in Kota Kinabalu</span>
        <select value={areaId} onChange={(e) => onChange(e.target.value)} className={`mt-2 ${field}`}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-small text-ink-soft">Area centres © OpenStreetMap contributors</p>
    </div>
  );
}
