/**
 * Notion Table Sync — Figma widget that renders a Notion database as an interactive table.
 * Requires a CORS proxy (see proxy/worker.js). Configure via widget property menu.
 */
const { widget } = figma;
const {
  AutoLayout,
  Text,
  useSyncedState,
  usePropertyMenu,
  useEffect,
} = widget;

import type { ColumnDef, RowData } from "./notion-types";
import {
  parseNotionColumns,
  parseNotionProperties,
  buildNotionPropertyUpdate,
} from "./notion-parsers";
import type { NotionDatabaseQueryResponse } from "./notion-types";

const CELL_WIDTH = 160;
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 32;

declare const __html__: string;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function NotionTableWidget() {
  const [proxyUrl, setProxyUrl] = useSyncedState("proxyUrl", "");
  const [databaseId, setDatabaseId] = useSyncedState("databaseId", "");
  const [columns, setColumns] = useSyncedState<ColumnDef[]>("columns", []);
  const [rows, setRows] = useSyncedState<RowData[]>("rows", []);
  const [lastSynced, setLastSynced] = useSyncedState("lastSynced", "");
  const [error, setError] = useSyncedState("error", "");

  async function fetchFromNotion() {
    if (!proxyUrl.trim() || !databaseId.trim()) {
      setError("Set proxy URL and database ID in Configure.");
      return;
    }
    setError("");
    const base = proxyUrl.replace(/\/$/, "");
    const url = `${base}/notion/databases/${databaseId}/query`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const t = await response.text();
        setError(`Notion API: ${response.status} ${t.slice(0, 100)}`);
        return;
      }
      const data = (await response.json()) as NotionDatabaseQueryResponse;
      const results = data.results || [];
      const parsedColumns = parseNotionColumns(results);
      const parsedRows: RowData[] = results.map((page) => ({
        pageId: page.id,
        cells: parseNotionProperties(page.properties),
      }));
      setColumns(parsedColumns);
      setRows(parsedRows);
      setLastSynced(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function showSettingsUI() {
    figma.notify("Opening configuration…");
    if (typeof __html__ === "undefined" || !__html__) {
      setError(
        "UI file not loaded. Run this as a plugin once (Plugins → Development → Notion Table Sync) to open the config panel, or check the manifest ui path."
      );
      figma.notify("Config UI not available—try running as plugin once", {
        error: true,
      });
      return;
    }
    try {
      figma.showUI(__html__, { width: 320, height: 180, visible: true });
      figma.ui.postMessage({
        type: "init",
        proxyUrl,
        databaseId,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : String(e);
      setError(
        "Could not open settings. Ensure you have edit access to this file; widget UI may be restricted by your org."
      );
      figma.notify("Configuration unavailable: " + message, {
        error: true,
      });
    }
  }

  function editCell(
    pageId: string,
    propertyName: string,
    columnType: string,
    currentValue: string
  ) {
    try {
      figma.showUI(__html__, { width: 280, height: 100 });
      figma.ui.postMessage({
        type: "editCell",
        pageId,
        property: propertyName,
        columnType,
        value: currentValue,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : String(e);
      setError("Could not open cell editor: " + message);
      figma.notify("Edit unavailable: " + message, { error: true });
    }
  }

  usePropertyMenu(
    [
      { itemType: "action", propertyName: "configure", tooltip: "Configure Notion DB" },
      { itemType: "action", propertyName: "sync", tooltip: "Sync from Notion" },
    ],
    async ({ propertyName }) => {
      if (propertyName === "configure") {
        showSettingsUI();
      } else if (propertyName === "sync") {
        await fetchFromNotion();
      }
    }
  );

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

  useEffect(() => {
    const handler = async (msg: {
      type?: string;
      proxyUrl?: string;
      databaseId?: string;
      pageId?: string;
      property?: string;
      columnType?: string;
      value?: string;
    }) => {
      if (msg.type === "configure") {
        if (msg.proxyUrl != null) setProxyUrl(msg.proxyUrl);
        if (msg.databaseId != null) setDatabaseId(msg.databaseId);
        figma.clientStorage
          .setAsync("notionTableConfig", {
            proxyUrl: msg.proxyUrl != null ? msg.proxyUrl : "",
            databaseId: msg.databaseId != null ? msg.databaseId : "",
          })
          .then(() => {
            figma.notify("Configuration saved");
            figma.closePlugin();
          });
        return;
      }
      if (msg.type === "updateCell" && msg.pageId && msg.property != null) {
        const base = proxyUrl.replace(/\/$/, "");
        const url = `${base}/notion/pages/${msg.pageId}`;
        const col = columns.find((c) => c.propertyName === msg.property);
        const type =
          msg.columnType != null
            ? msg.columnType
            : col != null
              ? col.type
              : "rich_text";
        const payload = buildNotionPropertyUpdate(
          msg.property,
          type,
          msg.value != null ? msg.value : ""
        );
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
                row.pageId === msg.pageId
                  ? {
                      ...row,
                      cells: {
                        ...row.cells,
                        [msg.property!]: msg.value != null ? msg.value : "",
                      },
                    }
                  : row
              )
            );
            setError("");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        figma.closePlugin();
      }
    };

    figma.ui.onmessage = (raw: unknown) => {
      const msg = raw as { pluginMessage?: Parameters<typeof handler>[0] };
      if (msg != null && msg.pluginMessage) handler(msg.pluginMessage);
    };

    return () => {
      figma.ui.onmessage = undefined;
    };
  });

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
        spacing={8}
      >
        <Text fontSize={14} fill="#333">
          Notion Table Sync
        </Text>
        <Text fontSize={11} fill="#666">
          Configure: use menu (⋯) → Configure, or run Plugins → Development → Notion Table Sync to open the config panel. Then Sync.
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
      <AutoLayout direction="horizontal" spacing={0} padding={0}>
        {columns.map((col, i) => (
          <AutoLayout
            key={i}
            width={CELL_WIDTH}
            height={HEADER_HEIGHT}
            padding={8}
            fill="#F5F5F5"
            stroke="#E0E0E0"
            strokeAlign="inside"
          >
            <Text fontSize={12} fontWeight="bold" fill="#333">
              {col.name}
            </Text>
          </AutoLayout>
        ))}
      </AutoLayout>
      {rows.map((row, rowIdx) => (
        <AutoLayout key={rowIdx} direction="horizontal" spacing={0}>
          {columns.map((col, colIdx) => (
            <AutoLayout
              key={colIdx}
              width={CELL_WIDTH}
              height={ROW_HEIGHT}
              padding={8}
              stroke="#EEEEEE"
              strokeAlign="inside"
              fill="#FFFFFF"
              onClick={() =>
                editCell(
                  row.pageId,
                  col.propertyName,
                  col.type,
                  row.cells[col.propertyName] != null ? row.cells[col.propertyName] : ""
                )
              }
            >
              <Text fontSize={11} fill="#555" width="fill-parent">
                {row.cells[col.propertyName] || "—"}
              </Text>
            </AutoLayout>
          ))}
        </AutoLayout>
      ))}
      <AutoLayout padding={8} fill="#FAFAFA">
        <Text fontSize={9} fill="#999">
          Last synced: {displaySync}
        </Text>
      </AutoLayout>
    </AutoLayout>
  );
}

// When run as a plugin (Plugins → Development → Notion Table Sync), show config UI so you can set proxy + database ID.
// The widget will load this config from clientStorage when it mounts.
if (typeof figma.pluginId !== "undefined") {
  if (typeof __html__ !== "undefined" && __html__) {
    figma.showUI(__html__, { width: 320, height: 180 });
    figma.ui.postMessage({
      type: "init",
      proxyUrl: "",
      databaseId: "",
    });
    figma.ui.onmessage = (raw: unknown) => {
      const msg = raw as { pluginMessage?: { type: string; proxyUrl?: string; databaseId?: string } };
      const data = msg != null && msg.pluginMessage ? msg.pluginMessage : null;
      if (data && data.type === "configure") {
        figma.clientStorage
          .setAsync("notionTableConfig", {
            proxyUrl: data.proxyUrl != null ? data.proxyUrl : "",
            databaseId: data.databaseId != null ? data.databaseId : "",
          })
          .then(() => {
            figma.notify("Configuration saved. Insert the widget and click Sync.");
            figma.closePlugin();
          });
      }
    };
  } else {
    figma.notify("UI file not available", { error: true });
  }
} else {
  widget.register(NotionTableWidget);
}
