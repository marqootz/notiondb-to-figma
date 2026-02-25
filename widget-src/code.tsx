/**
 * Notion Table Sync — Figma widget that renders a Notion database as an interactive table.
 * Requires a CORS proxy (see proxy/worker.js). Configure via widget property menu.
 */
const { widget } = figma;
const {
  AutoLayout,
  Text,
  Input,
  useSyncedState,
  usePropertyMenu,
  useEffect,
} = widget;

import type { ColumnDef, RowData } from "./notion-types";
import {
  parseNotionColumns,
  parseNotionProperties,
  buildNotionPropertyUpdate,
  formatCellForDisplay,
  isReadOnlyType,
  mergeSchemaOptions,
  NOTION_TYPE_LABELS,
  NOTION_PILL_COLORS,
} from "./notion-parsers";
import type { NotionDatabaseQueryResponse, NotionDatabaseResponse } from "./notion-types";

const CELL_WIDTH = 160;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 32;
const ROW_HEIGHT_EDIT = 72;

/** Normalize Notion database ID: strip dashes, extract 32-char hex from URL if pasted. */
function normalizeDatabaseId(input: string): string {
  const trimmed = input.trim();
  // Extract 32-char hex block (Notion IDs are 32 hex chars, with or without dashes)
  const hexMatch = trimmed.match(/([a-f0-9]{32})/i);
  if (hexMatch) return hexMatch[1].toLowerCase();
  // Otherwise strip dashes from UUID format
  return trimmed.replace(/-/g, "").toLowerCase();
}

function NotionTableWidget() {
  const [proxyUrl, setProxyUrl] = useSyncedState("proxyUrl", "");
  const [databaseId, setDatabaseId] = useSyncedState("databaseId", "");
  const [columns, setColumns] = useSyncedState<ColumnDef[]>("columns", []);
  const [rows, setRows] = useSyncedState<RowData[]>("rows", []);
  const [lastSynced, setLastSynced] = useSyncedState("lastSynced", "");
  const [error, setError] = useSyncedState("error", "");
  const [editingCell, setEditingCell] = useSyncedState<{
    pageId: string;
    property: string;
    columnType: string;
    value: string;
  } | null>("editingCell", null);
  const [sortBy, setSortBy] = useSyncedState("sortBy", "");
  const [groupBy, setGroupBy] = useSyncedState("groupBy", "");
  const [filterColumn, setFilterColumn] = useSyncedState("filterColumn", "");
  const [filterOp, setFilterOp] = useSyncedState("filterOp", "contains");
  const [filterValue, setFilterValue] = useSyncedState("filterValue", "");

  function buildSorts(): { property?: string; timestamp?: string; direction: "ascending" | "descending" }[] {
    if (!sortBy) return [];
    const [key, dir] = sortBy.split(":");
    const direction = (dir === "desc" ? "descending" : "ascending") as "ascending" | "descending";
    if (key === "created_time" || key === "last_edited_time") {
      return [{ timestamp: key, direction }];
    }
    return key ? [{ property: key, direction }] : [];
  }

  async function fetchFromNotion() {
    if (!proxyUrl.trim() || !databaseId.trim()) {
      setError("Enter proxy URL and database ID above, then Sync.");
      return;
    }
    setError("");
    const base = proxyUrl.replace(/\/$/, "");
    const normalizedId = normalizeDatabaseId(databaseId);
    const sorts = buildSorts();
    const queryBody = sorts.length > 0 ? { sorts } : {};
    try {
      const [schemaRes, queryRes] = await Promise.all([
        fetch(`${base}/notion/databases/${normalizedId}`),
        fetch(`${base}/notion/databases/${normalizedId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(queryBody),
        }),
      ]);
      if (!queryRes.ok) {
        const t = await queryRes.text();
        let errMsg = `Notion API: ${queryRes.status} ${t.slice(0, 100)}`;
        if (queryRes.status === 404 || t.includes("could not find") || t.includes("locate database")) {
          errMsg =
            "Database not found. Share it with your integration: open the database → ⋯ → Connections → Add → select your integration.";
        }
        setError(errMsg);
        return;
      }
      const schema: NotionDatabaseResponse | null = schemaRes.ok
        ? ((await schemaRes.json()) as NotionDatabaseResponse)
        : null;
      const data = (await queryRes.json()) as NotionDatabaseQueryResponse;
      const results = data.results || [];
      const parsedColumns = mergeSchemaOptions(parseNotionColumns(results), schema);
      const parsedRows: RowData[] = results.map((page) => ({
        pageId: page.id,
        cells: parseNotionProperties(page.properties),
        created_time: page.created_time,
        last_edited_time: page.last_edited_time,
      }));
      setColumns(parsedColumns);
      setRows(parsedRows);
      setLastSynced(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveCellEdit(newValue: string) {
    const cell = editingCell;
    if (!cell) return;
    setEditingCell(null);
    const base = proxyUrl.replace(/\/$/, "");
    const url = `${base}/notion/pages/${cell.pageId}`;
    const col = columns.find((c) => c.propertyName === cell.property);
    const type = cell.columnType ?? (col?.type ?? "rich_text");
    const payload = buildNotionPropertyUpdate(cell.property, type, newValue);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: payload }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`Update failed: ${res.status} ${t.slice(0, 80)}`);
      } else {
        setRows((prev) =>
          prev.map((row) =>
            row.pageId === cell.pageId
              ? {
                  ...row,
                  cells: { ...row.cells, [cell.property]: newValue },
                }
              : row
          )
        );
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function editCell(
    pageId: string,
    propertyName: string,
    columnType: string,
    currentValue: string
  ) {
    setEditingCell({ pageId, property: propertyName, columnType, value: currentValue });
  }

  const sortOptions = [
    { option: "", label: "Sort: None" },
    ...columns.flatMap((c) => [
      { option: `${c.propertyName}:asc`, label: `${c.name} ↑` },
      { option: `${c.propertyName}:desc`, label: `${c.name} ↓` },
    ]),
    { option: "created_time:asc", label: "Created ↑" },
    { option: "created_time:desc", label: "Created ↓" },
    { option: "last_edited_time:asc", label: "Last edited ↑" },
    { option: "last_edited_time:desc", label: "Last edited ↓" },
  ];
  const groupOptions = [
    { option: "", label: "Group: None" },
    ...columns.map((c) => ({ option: c.propertyName, label: `By ${c.name}` })),
  ];
  const filterColumnOptions = [
    { option: "", label: "Filter: None" },
    ...columns.map((c) => ({ option: c.propertyName, label: c.name })),
  ];
  const filterOpOptions = [
    { option: "contains", label: "contains" },
    { option: "equals", label: "equals" },
    { option: "is_empty", label: "is empty" },
    { option: "is_not_empty", label: "is not empty" },
  ];
  const needsFilterValue = filterColumn && (filterOp === "contains" || filterOp === "equals");
  const filterValueOptions = needsFilterValue
    ? [
        { option: "", label: "Filter value: (none)" },
        ...Array.from(
          new Set(
            rows
              .map((r) => (r.cells[filterColumn] ?? "").trim())
              .filter((v) => v && v !== "—")
          )
        )
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 50)
          .map((v) => ({ option: v, label: v })),
      ]
    : [{ option: "", label: "Filter value: (none)" }];
  const menuItems: Parameters<typeof usePropertyMenu>[0] = [
    { itemType: "action", propertyName: "sync", tooltip: "Sync from Notion" },
    { itemType: "separator" },
    {
      itemType: "dropdown",
      propertyName: "sort",
      tooltip: "Sort by",
      selectedOption: sortOptions.some((o) => o.option === sortBy) ? sortBy : "",
      options: sortOptions,
    },
    {
      itemType: "dropdown",
      propertyName: "group",
      tooltip: "Group by",
      selectedOption: groupOptions.some((o) => o.option === groupBy) ? groupBy : "",
      options: groupOptions,
    },
    { itemType: "separator" },
    {
      itemType: "dropdown",
      propertyName: "filterColumn",
      tooltip: "Filter by column",
      selectedOption: filterColumnOptions.some((o) => o.option === filterColumn) ? filterColumn : "",
      options: filterColumnOptions,
    },
    {
      itemType: "dropdown",
      propertyName: "filterOp",
      tooltip: "Filter operator",
      selectedOption: filterOpOptions.some((o) => o.option === filterOp) ? filterOp : "contains",
      options: filterOpOptions,
    },
    ...(needsFilterValue
      ? [
          {
            itemType: "dropdown" as const,
            propertyName: "filterValue",
            tooltip: "Filter value",
            selectedOption: filterValueOptions.some((o) => o.option === filterValue) ? filterValue : "",
            options: filterValueOptions,
          },
        ]
      : []),
  ];
  usePropertyMenu(menuItems, async ({ propertyName, propertyValue }) => {
    if (propertyName === "sync") await fetchFromNotion();
    else if (propertyName === "sort") setSortBy(propertyValue ?? "");
    else if (propertyName === "group") setGroupBy(propertyValue ?? "");
    else if (propertyName === "filterColumn") setFilterColumn(propertyValue ?? "");
    else if (propertyName === "filterOp") setFilterOp(propertyValue ?? "contains");
    else if (propertyName === "filterValue") setFilterValue(propertyValue ?? "");
  });

  // Load saved config from clientStorage when widget mounts (e.g. after configuring via Plugins → Development)
  useEffect(() => {
    if (proxyUrl.trim() !== "" && databaseId.trim() !== "") return;
    figma.clientStorage.getAsync("notionTableConfig").then((saved) => {
      if (!saved || typeof saved !== "object") return;
      const o = saved as { proxyUrl?: string; databaseId?: string };
      if (o.proxyUrl && o.databaseId) {
        setProxyUrl(o.proxyUrl);
        setDatabaseId(o.databaseId);
        figma.notify("Loaded saved configuration");
      }
    });
    return () => {};
  }, []);

  function getFilteredRows(): RowData[] {
    if (!filterColumn || !columns.some((c) => c.propertyName === filterColumn)) {
      return rows;
    }
    const val = filterValue.trim().toLowerCase();
    const needsValue = filterOp !== "is_empty" && filterOp !== "is_not_empty";
    if (needsValue && !val) return rows;

    return rows.filter((row) => {
      const cellVal = (row.cells[filterColumn] ?? "").toLowerCase();
      const isEmpty = !cellVal || cellVal === "—";
      switch (filterOp) {
        case "contains":
          return cellVal.includes(val);
        case "equals":
          return cellVal === val;
        case "is_empty":
          return isEmpty;
        case "is_not_empty":
          return !isEmpty;
        default:
          return true;
      }
    });
  }

  function getCellSortValue(row: RowData, key: string): string | number {
    if (key === "created_time" || key === "last_edited_time") {
      const t = row[key];
      return t ?? "";
    }
    const v = row.cells[key] ?? "";
    const col = columns.find((c) => c.propertyName === key);
    if (col?.type === "number") {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    }
    return v.toLowerCase();
  }

  function getSortedRows(): RowData[] {
    const filtered = getFilteredRows();
    if (!sortBy) return filtered;
    const [key, dir] = sortBy.split(":");
    if (!key) return rows;
    const asc = dir !== "desc";
    return [...filtered].sort((a, b) => {
      const va = getCellSortValue(a, key);
      const vb = getCellSortValue(b, key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return asc ? cmp : -cmp;
    });
  }

  function getGroupedRows(): { groupValue: string; rows: RowData[] }[] {
    const sorted = getSortedRows();
    if (!groupBy || !columns.some((c) => c.propertyName === groupBy)) {
      return [{ groupValue: "", rows: sorted }];
    }
    const map = new Map<string, RowData[]>();
    for (const row of sorted) {
      const val = row.cells[groupBy] ?? "—";
      if (!map.has(val)) map.set(val, []);
      map.get(val)!.push(row);
    }
    const col = columns.find((c) => c.propertyName === groupBy);
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (col?.type === "number") {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
      }
      return a.localeCompare(b);
    });
    return sortedKeys.map((groupValue) => ({
      groupValue,
      rows: map.get(groupValue)!,
    }));
  }

  const hasData = columns.length > 0 && rows.length >= 0;
  const displaySync = lastSynced
    ? new Date(lastSynced).toLocaleString()
    : "Never";

  if (!hasData && !error) {
    return (
      <AutoLayout
        direction="vertical"
        padding={24}
        fill="#F5F5F5"
        stroke="#E0E0E0"
        cornerRadius={8}
        spacing={12}
      >
        <Text fontSize={14} fontWeight="bold" fill="#333">
          Notion Table Sync
        </Text>
        <AutoLayout direction="vertical" spacing={4}>
          <Text fontSize={11} fill="#666">
            Proxy URL (e.g. https://xxx.workers.dev)
          </Text>
          <Input
            value={proxyUrl || null}
            placeholder="https://your-proxy.workers.dev"
            onTextEditEnd={(e) => {
              setProxyUrl(e.characters);
              figma.clientStorage.setAsync("notionTableConfig", {
                proxyUrl: e.characters,
                databaseId,
              });
            }}
            fontSize={11}
            width={280}
            inputFrameProps={{ fill: "#FFFFFF", padding: 8, cornerRadius: 4 }}
          />
        </AutoLayout>
        <AutoLayout direction="vertical" spacing={4}>
          <Text fontSize={11} fill="#666">
            Notion Database ID (from database URL)
          </Text>
          <Input
            value={databaseId || null}
            placeholder="Paste URL or 32-char ID"
            onTextEditEnd={(e) => {
              setDatabaseId(e.characters);
              figma.clientStorage.setAsync("notionTableConfig", {
                proxyUrl,
                databaseId: e.characters,
              });
            }}
            fontSize={11}
            width={280}
            inputFrameProps={{ fill: "#FFFFFF", padding: 8, cornerRadius: 4 }}
          />
        </AutoLayout>
        <Text fontSize={10} fill="#999">
          Share database with integration: ⋯ → Connections → Add. Then Sync.
        </Text>
      </AutoLayout>
    );
  }

  return (
    <AutoLayout
      direction="vertical"
      spacing={0}
      cornerRadius={8}
      fill="#FFFFFF"
      stroke="#E0E0E0"
    >
      {error ? (
        <AutoLayout padding={8} fill="#FFEBEE">
          <Text fontSize={10} fill="#C62828">
            {error}
          </Text>
        </AutoLayout>
      ) : null}
      {filterColumn && (filterOp === "contains" || filterOp === "equals") ? (
        <AutoLayout
          direction="horizontal"
          padding={8}
          fill="#E3F2FD"
          stroke="#BBDEFB"
          strokeAlign="inside"
          spacing={8}
          verticalAlignItems="center"
        >
          <Text fontSize={10} fill="#1565C0">
            Filter value:
          </Text>
          <Input
            value={filterValue || null}
            placeholder="Type value to filter..."
            onTextEditEnd={(e) => setFilterValue(e.characters)}
            fontSize={11}
            width={180}
            inputFrameProps={{ fill: "#FFFFFF", padding: 6, cornerRadius: 4 }}
          />
        </AutoLayout>
      ) : null}
      <AutoLayout direction="horizontal" spacing={0} padding={0}>
        {columns.map((col, i) => (
          <AutoLayout
            key={i}
            direction="vertical"
            width={CELL_WIDTH}
            height={HEADER_HEIGHT}
            padding={8}
            fill="#F5F5F5"
            stroke="#E0E0E0"
            strokeAlign="inside"
            spacing={2}
          >
            <Text fontSize={12} fontWeight="bold" fill="#333">
              {col.name}
            </Text>
            <Text fontSize={9} fill="#888">
              {NOTION_TYPE_LABELS[col.type] ?? col.type}
            </Text>
          </AutoLayout>
        ))}
      </AutoLayout>
      {getGroupedRows().map((group, groupIdx) => (
        <AutoLayout key={groupIdx} direction="vertical" spacing={0}>
          {group.groupValue ? (
            <AutoLayout
              direction="horizontal"
              width={columns.length * CELL_WIDTH}
              padding={6}
              fill="#E8EAF6"
              stroke="#C5CAE9"
              strokeAlign="inside"
            >
              <Text fontSize={11} fontWeight="bold" fill="#3949AB">
                {group.groupValue}
              </Text>
              <Text fontSize={10} fill="#5C6BC0">
                {" "}({group.rows.length})
              </Text>
            </AutoLayout>
          ) : null}
          {group.rows.map((row, rowIdx) => {
            const rowHasEditingSelect =
              editingCell?.pageId === row.pageId &&
              columns.some(
                (c) =>
                  c.propertyName === editingCell?.property &&
                  (c.type === "select" || c.type === "status")
              );
            const rowH = rowHasEditingSelect ? ROW_HEIGHT_EDIT : ROW_HEIGHT;
            return (
            <AutoLayout key={rowIdx} direction="horizontal" spacing={0}>
          {columns.map((col, colIdx) => {
            const isEditing =
              editingCell?.pageId === row.pageId && editingCell?.property === col.propertyName;
            const cellValue = row.cells[col.propertyName] ?? "";
            const displayValue = formatCellForDisplay(col.type, cellValue);
            const readOnly = isReadOnlyType(col.type);
            const canEdit = !readOnly && !isEditing;
            const isSelectOrStatus = col.type === "select" || col.type === "status";
            const pillOpt = col.options?.find((o) => o.name === cellValue);
            const pillColors = pillOpt
              ? NOTION_PILL_COLORS[pillOpt.color ?? "default"] ?? NOTION_PILL_COLORS.default
              : NOTION_PILL_COLORS.default;
            const cellFill =
              readOnly ? "#F9F9F9" : col.type === "checkbox" ? "#FAFAFA" : "#FFFFFF";
            const textFill =
              col.type === "checkbox" && displayValue === "✓"
                ? "#2E7D32"
                : col.type === "date"
                  ? "#1565C0"
                  : col.type === "url"
                    ? "#0D47A1"
                    : readOnly
                      ? "#757575"
                      : "#333";
            return (
              <AutoLayout
                key={colIdx}
                width={CELL_WIDTH}
                height={rowH}
                padding={8}
                stroke="#EEEEEE"
                strokeAlign="inside"
                fill={cellFill}
                onClick={() => canEdit && editCell(row.pageId, col.propertyName, col.type, cellValue)}
              >
                {isEditing ? (
                  <AutoLayout direction="vertical" spacing={6} width="fill-parent">
                    {isSelectOrStatus && col.options && col.options.length > 0 ? (
                      <AutoLayout direction="horizontal" spacing={4} wrap>
                        {col.options.map((opt) => {
                          const c = NOTION_PILL_COLORS[opt.color ?? "default"] ?? NOTION_PILL_COLORS.default;
                          const isSelected = opt.name === (editingCell!.value ?? "");
                          return (
                            <AutoLayout
                              key={opt.name}
                              padding={4}
                              cornerRadius={4}
                              fill={isSelected ? c.bg : "#F3F4F6"}
                              stroke={isSelected ? "#9CA3AF" : []}
                              onClick={() => saveCellEdit(opt.name)}
                            >
                              <Text fontSize={10} fill={c.text}>
                                {opt.name}
                              </Text>
                            </AutoLayout>
                          );
                        })}
                      </AutoLayout>
                    ) : null}
                    <Input
                      value={typeof editingCell!.value === "string" ? editingCell!.value : null}
                      placeholder={isSelectOrStatus ? "Or type custom value" : "—"}
                      onTextEditEnd={(e) => saveCellEdit(e.characters)}
                      fontSize={11}
                      width="fill-parent"
                      inputBehavior="truncate"
                      inputFrameProps={{ fill: "#FFFFFF", padding: 6 }}
                    />
                  </AutoLayout>
                ) : isSelectOrStatus && displayValue ? (
                  <AutoLayout
                    padding={{ left: 6, right: 6, top: 4, bottom: 4 }}
                    cornerRadius={6}
                    fill={pillColors.bg}
                  >
                    <Text fontSize={10} fill={pillColors.text}>
                      {displayValue}
                    </Text>
                  </AutoLayout>
                ) : (
                  <Text fontSize={11} fill={textFill} width="fill-parent">
                    {displayValue}
                  </Text>
                )}
              </AutoLayout>
            );
          })}
        </AutoLayout>
            );
          })}
        </AutoLayout>
      ))}
      <AutoLayout direction="vertical" padding={8} fill="#FAFAFA" spacing={6}>
        <Text fontSize={9} fill="#999">
          Last synced: {displaySync}
          {filterColumn ? ` · Showing ${getFilteredRows().length} of ${rows.length}` : ""}
        </Text>
      </AutoLayout>
    </AutoLayout>
  );
}

widget.register(NotionTableWidget);
