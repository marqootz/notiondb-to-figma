/**
 * Minimal types for Notion API responses (query database, page properties).
 * Not full SDK — only what we need for parsing.
 */

export interface NotionRichTextItem {
  plain_text?: string;
  text?: { content: string };
  type?: string;
}

export interface NotionPropertyValue {
  id?: string;
  type: string;
  title?: NotionRichTextItem[];
  rich_text?: NotionRichTextItem[];
  number?: number | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  checkbox?: boolean;
  date?: { start: string; end: string | null } | null;
  url?: string | null;
  formula?: { type: string; string?: string; number?: number; boolean?: boolean };
  rollup?: { type: string; array?: unknown[]; number?: number; date?: unknown };
  status?: { name: string } | null;
  people?: Array<{ id?: string; name?: string }>;
}

export interface NotionPage {
  id: string;
  properties: Record<string, NotionPropertyValue>;
  created_time?: string;
  last_edited_time?: string;
}

export interface NotionDatabaseQueryResponse {
  object: string;
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface NotionDatabaseResponse {
  object: string;
  id: string;
  properties: Record<
    string,
    {
      type?: string;
      select?: { options?: { name: string; color?: string }[] };
      status?: { options?: { name: string; color?: string }[] };
    }
  >;
}

export interface SelectOption {
  name: string;
  color?: string;
}

export interface ColumnDef {
  name: string;
  propertyName: string;
  type: string;
  options?: SelectOption[];
}

export interface RowData {
  pageId: string;
  cells: Record<string, string>;
  created_time?: string;
  last_edited_time?: string;
}
