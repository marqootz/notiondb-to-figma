# Project Configuration

Project-specific setup for Notion Table Sync.

## Supabase Proxy

| Setting | Value |
|---------|-------|
| **Project** | figma-proxies |
| **Project ref** | `bdmpzibairexcwvgqfwf` |
| **Proxy URL** | `https://bdmpzibairexcwvgqfwf.supabase.co/functions/v1/notion-proxy` |

### Widget configuration

Enter in the Figma widget:

- **Proxy URL:** `https://bdmpzibairexcwvgqfwf.supabase.co/functions/v1/notion-proxy` (no trailing slash)
- **Notion Database ID:** Your 32-char database ID from the Notion URL

### Verify setup

```bash
supabase functions list    # notion-proxy should be ACTIVE
supabase secrets list      # NOTION_API_KEY should be set
```
