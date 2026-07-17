import { useMemo, useState } from "react";
import {
  filterCatalog,
  type VersionCatalog,
  type VersionCategoryId,
} from "../../services/minecraft/versionCatalogService";
import { Field, FieldSelect } from "../../ui/Field";
import { cx } from "../../ui/cx";

const CATEGORY_TABS: { id: VersionCategoryId | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "release", label: "Release" },
  { id: "prerelease", label: "Pre-release" },
  { id: "snapshot", label: "Snapshot" },
  { id: "beta", label: "Beta" },
  { id: "alpha", label: "Alpha" },
];

export function VersionSelector({
  catalog,
  value,
  onChange,
  loading,
}: {
  catalog: VersionCatalog | null;
  value: string;
  onChange: (versionId: string) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<VersionCategoryId | "all">("all");

  const groups = useMemo(() => {
    if (!catalog) return [];
    return filterCatalog(catalog, query, category);
  }, [catalog, query, category]);

  const totalVisible = groups.reduce((n, g) => n + g.versions.length, 0);

  return (
    <div className="space-y-2">
      <Field
        label="Buscar versión"
        placeholder="p. ej. 1.20.1, b1.7.3, 24w…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading || !catalog}
      />

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={loading || !catalog}
            onClick={() => setCategory(tab.id)}
            className={cx(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
              category === tab.id
                ? "border-gold-500/50 bg-gold-haze text-gold-100"
                : "border-line bg-canvas-deep/50 text-ink-muted hover:border-line-strong",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FieldSelect
        label="Versión de Minecraft"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading || !catalog}
      >
        {loading && (
          <option value="" className="bg-canvas-deep">
            Cargando versiones…
          </option>
        )}
        {!loading && totalVisible === 0 && (
          <option value="" className="bg-canvas-deep">
            Sin coincidencias
          </option>
        )}
        {groups.map((group) => (
          <optgroup key={group.id} label={group.label}>
            {group.versions.map((v) => (
              <option key={v.id} value={v.id} className="bg-canvas-deep">
                {v.id}
              </option>
            ))}
          </optgroup>
        ))}
      </FieldSelect>

      {catalog && !loading && (
        <p className="text-[10px] text-ink-faint">
          {catalog.all.length} versiones en el manifiesto oficial · mostrando{" "}
          {totalVisible}
        </p>
      )}
    </div>
  );
}
