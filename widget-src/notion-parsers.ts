/**
 * Flatten Notion property values to display strings for the table.
 * Write-back builds the correct Notion API payload per type.
 */

/** Human-readable label for Notion property types. */
export const NOTION_TYPE_LABELS: Record<string, string> = {
  title: "Title",
  rich_text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi",
  checkbox: "Check",
  date: "Date",
  url: "URL",
  status: "Status",
  formula: "Formula",
  rollup: "Rollup",
  people: "People",
};

/** Format cell value for display with type-specific representation. */
export function formatCellForDisplay(type: string, value: string): string {
  if (!value) return "—";
  switch (type) {
    case "checkbox":
      return /^(1|true|yes)$/i.test(value.trim()) ? "✓" : "—";
    case "date":
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
      } catch {
        /* fall through */
      }
      return value;
    case "number":
      const n = parseFloat(value);
      return isNaN(n) ? value : n.toLocaleString();
    case "url":
      return value; // Could truncate long URLs
    default:
      return value;
  }
}

/** Whether the property type is read-only (formula, rollup, people). */
export function isReadOnlyType(type: string): boolean {
  return type === "formula" || type === "rollup" || type === "people";
}

/** Notion color names to hex for pill styling. */
export const NOTION_PILL_COLORS: Record<string, { bg: string; text: string }> = {
  default: { bg: "#F3F4F6", text: "#374151" },
  gray: { bg: "#E5E7EB", text: "#374151" },
  brown: { bg: "#E7D5C4", text: "#5C4033" },
  orange: { bg: "#FFE4CC", text: "#C2410C" },
  yellow: { bg: "#FEF3C7", text: "#92400E" },
  green: { bg: "#D1FAE5", text: "#065F46" },
  blue: { bg: "#DBEAFE", text: "#1E40AF" },
  purple: { bg: "#EDE9FE", text: "#5B21B6" },
  pink: { bg: "#FCE7F3", text: "#9D174D" },
  red: { bg: "#FEE2E2", text: "#991B1B" },
};
import type {
  NotionPage,
  NotionPropertyValue,
  NotionRichTextItem,
  ColumnDef,
  SelectOption,
  NotionDatabaseResponse,
} from "./notion-types";

function richTextToStr(richText: NotionRichTextItem[] | undefined): string {
  if (!richText || !Array.isArray(richText)) return "";
  return richText
    .map((t) =>
      t.plain_text != null
        ? t.plain_text
        : t.text != null && t.text.content != null
          ? t.text.content
          : ""
    )
    .join("");
}

export function parseNotionColumns(results: NotionPage[]): ColumnDef[] {
  if (!results.length) return [];
  const first = results[0];
  const columns: ColumnDef[] = [];
  for (const [name, value] of Object.entries(first.properties)) {
    if (value && typeof value === "object" && "type" in value) {
      columns.push({
        name,
        propertyName: name,
        type: (value as NotionPropertyValue).type,
      });
    }
  }
  return columns;
}

/** Merge select/status options from database schema into columns. */
export function mergeSchemaOptions(
  columns: ColumnDef[],
  schema: NotionDatabaseResponse | null
): ColumnDef[] {
  if (!schema?.properties) return columns;
  return columns.map((col) => {
    const prop = schema.properties[col.propertyName];
    if (!prop) return col;
    const opts =
      (col.type === "select" && prop.select?.options) ??
      (col.type === "status" && prop.status?.options);
    if (!opts?.length) return col;
    const options: SelectOption[] = opts.map((o) => ({
      name: o.name,
      color: o.color ?? "default",
    }));
    return { ...col, options };
  });
}

export function parseNotionProperties(
  properties: Record<string, NotionPropertyValue>
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!value || typeof value !== "object") continue;
    const v = value as NotionPropertyValue;
    switch (v.type) {
      case "title":
        cells[key] = richTextToStr(v.title);
        break;
      case "rich_text":
        cells[key] = richTextToStr(v.rich_text);
        break;
      case "number":
        cells[key] =
          v.number != null ? String(v.number) : "";
        break;
      case "select":
        cells[key] =
          v.select != null && v.select.name != null ? v.select.name : "";
        break;
      case "multi_select":
        cells[key] = (v.multi_select != null ? v.multi_select : []).map(
          (s) => s.name
        ).join(", ");
        break;
      case "checkbox":
        cells[key] = v.checkbox ? "Yes" : "No";
        break;
      case "date":
        cells[key] =
          v.date != null && v.date.start != null ? v.date.start : "";
        break;
      case "url":
        cells[key] = v.url != null ? v.url : "";
        break;
      case "status":
        cells[key] =
          v.status != null && v.status.name != null ? v.status.name : "";
        break;
      case "people":
        cells[key] = (v.people != null ? v.people : [])
          .map((p) => (p as { name?: string }).name ?? "")
          .filter(Boolean)
          .join(", ");
        break;
      case "formula":
        if (v.formula != null && v.formula.string != null)
          cells[key] = String(v.formula.string);
        else if (v.formula != null && v.formula.number != null)
          cells[key] = String(v.formula.number);
        else if (
          v.formula != null &&
          typeof v.formula.boolean === "boolean"
        )
          cells[key] = v.formula.boolean ? "Yes" : "No";
        else cells[key] = "";
        break;
      case "rollup":
        if (v.rollup != null && v.rollup.number != null)
          cells[key] = String(v.rollup.number);
        else if (v.rollup != null && Array.isArray(v.rollup.array))
          cells[key] = String(v.rollup.array.length);
        else cells[key] = "";
        break;
      default:
        cells[key] = "";
    }
  }
  return cells;
}

/** Build Notion PATCH body for one property. Only supports types we can edit as text. */
export function buildNotionPropertyUpdate(
  propertyName: string,
  type: string,
  value: string
): Record<string, unknown> {
  switch (type) {
    case "title":
      return {
        [propertyName]: {
          type: "title",
          title: [{ text: { content: value } }],
        },
      };
    case "rich_text":
      return {
        [propertyName]: {
          type: "rich_text",
          rich_text: [{ text: { content: value } }],
        },
      };
    case "number": {
      const n = value === "" ? null : Number(value);
      return {
        [propertyName]: { type: "number", number: isNaN(n as number) ? null : n },
      };
    }
    case "checkbox":
      return {
        [propertyName]: {
          type: "checkbox",
          checkbox: /^(1|true|yes)$/i.test(value.trim()),
        },
      };
    case "date":
      return {
        [propertyName]: {
          type: "date",
          date: value ? { start: value, end: null } : null,
        },
      };
    case "url":
      return {
        [propertyName]: { type: "url", url: value || null },
      };
    case "select":
      return {
        [propertyName]: {
          type: "select",
          select: value ? { name: value } : null,
        },
      };
    case "status":
      return {
        [propertyName]: {
          type: "status",
          status: value ? { name: value } : null,
        },
      };
    default:
      return {
        [propertyName]: {
          type: "rich_text",
          rich_text: [{ text: { content: value } }],
        },
      };
  }
}
