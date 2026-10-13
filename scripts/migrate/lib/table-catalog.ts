/**
 * Table metadata for the migration, derived from the live Drizzle schema (lib/db/schema.ts),
 * so the converter can never drift from the D1 migrations.
 */
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../../lib/db/schema";
import type { ColumnKind } from "./value-converters";

export interface CatalogColumn {
  name: string;
  kind: ColumnKind;
}

export interface CatalogTable {
  name: string;
  columns: CatalogColumn[];
  primaryKey: string[];
  /** Tables this one references through foreign keys (excluding itself). */
  dependsOn: string[];
}

function columnKind(columnType: string): ColumnKind {
  switch (columnType) {
    case "SQLiteTimestamp":
      return "timestamp_ms";
    case "SQLiteBoolean":
      return "boolean";
    case "SQLiteInteger":
      return "integer";
    case "SQLiteTextJson":
      return "json";
    case "SQLiteText":
      return "text";
    default:
      throw new Error(`Unsupported drizzle column type ${columnType}; extend scripts/migrate/lib/value-converters.ts`);
  }
}

export function loadCatalog(): CatalogTable[] {
  const tables: CatalogTable[] = [];
  for (const value of Object.values(schema)) {
    if (!(value instanceof SQLiteTable)) continue;
    const config = getTableConfig(value);
    const singlePk = config.columns.filter((column) => column.primary).map((column) => column.name);
    const compositePk = config.primaryKeys[0]?.columns.map((column) => column.name) ?? [];
    const primaryKey = compositePk.length > 0 ? compositePk : singlePk;
    if (primaryKey.length === 0) throw new Error(`Table ${config.name} has no primary key; verify needs one`);
    const dependsOn = [
      ...new Set(
        config.foreignKeys
          .map((fk) => getTableConfig(fk.reference().foreignTable).name)
          .filter((name) => name !== config.name)
      ),
    ];
    tables.push({
      name: config.name,
      columns: config.columns.map((column) => ({ name: column.name, kind: columnKind(column.columnType) })),
      primaryKey,
      dependsOn,
    });
  }
  return topologicalOrder(tables);
}

/** Parents before children, so inserts satisfy FKs and deletes can run in reverse. */
export function topologicalOrder(tables: CatalogTable[]): CatalogTable[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered: CatalogTable[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: CatalogTable) => {
    const current = state.get(table.name);
    if (current === "done") return;
    if (current === "visiting") throw new Error(`Foreign key cycle at ${table.name}`);
    state.set(table.name, "visiting");
    for (const parent of table.dependsOn) {
      const parentTable = byName.get(parent);
      if (parentTable) visit(parentTable);
    }
    state.set(table.name, "done");
    ordered.push(table);
  };
  [...tables].sort((a, b) => a.name.localeCompare(b.name)).forEach(visit);
  return ordered;
}
