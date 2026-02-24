/**
 * Flatten Notion property values to display strings for the table.
 * Write-back builds the correct Notion API payload per type.
 */
import type {
  NotionPage,
  NotionPropertyValue,
  NotionRichTextItem,
  ColumnDef,
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
      }
    default:
      return {
        [propertyName]: {
          type: "rich_text",
          rich_text: [{ text: { content: value } }],
        },
      };
  }
}
