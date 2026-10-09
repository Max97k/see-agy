# AGY CLI Transcript Logs & Event Format Analysis

## 1. Executive Summary

This report presents a comprehensive investigation into AGY CLI transcript logs, JSON event formats, tool call structures, and agent status tracking. The findings provide the exact specifications required by the Backend Middleware Server to implement real-time log tailing, event parsing, READ/WRITE broadcast filtering, and mascot working state updates for the AGY CLI Web Visualizer Dashboard.

---

## 2. Directory Structure & File Discovery

### 2.1 File Location & Path Format
AGY CLI transcript logs are stored in individual session directories under the user's home directory:
```
~/.gemini/antigravity-cli/brain/<session_uuid>/.system_generated/logs/transcript.jsonl
~/.gemini/antigravity-cli/brain/<session_uuid>/.system_generated/logs/transcript_full.jsonl
```

> **Important Path Correction**: The requirement mentions `~/.gemini/antigravity-cli/brain/*/logs/transcript.jsonl`. In the actual AGY CLI installation, log files are located inside `.system_generated/logs/`.
> 
> **Recommended Chokidar Glob Pattern**:
> `/home/user/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript.jsonl`
> or
> `/home/user/.gemini/antigravity-cli/brain/**/transcript.jsonl`

### 2.2 `transcript.jsonl` vs `transcript_full.jsonl`
| Characteristic | `transcript.jsonl` | `transcript_full.jsonl` |
|---|---|---|
| **Purpose** | Stream log for UI/dashboard monitoring | Full un-truncated raw event store |
| **Content Truncation** | Truncates large payloads (`truncated_fields: ["content"]` or `["tool_calls"]`) | Untruncated full content (`truncated_fields: null` / omitted) |
| **Tool Call String Encoding** | String values inside `args` are wrapped in extra double-quotes (e.g. `'"/path/to/file"'`) | Raw unescaped strings (e.g. `'/path/to/file'`) |
| **Update Frequency** | Streamed line-by-line in real time | Streamed line-by-line in real time |

**Recommendation**: The backend middleware SHOULD monitor `transcript.jsonl` for lightweight real-time event parsing.

---

## 3. JSON Event Schemas & Event Types

Every line in `transcript.jsonl` is a JSON line (JSONL format).

### 3.1 Core Top-Level Fields

| Field Name | Type | Description | Observed Values / Examples |
|---|---|---|---|
| `step_index` | `number` | Sequential step index for the session | `0, 1, 2, 3, ...` |
| `source` | `string` | Origin of the log line | `"MODEL"`, `"SYSTEM"`, `"USER_EXPLICIT"` |
| `type` | `string` | Event category / type | `"PLANNER_RESPONSE"`, `"VIEW_FILE"`, `"GREP_SEARCH"`, `"CODE_ACTION"`, `"RUN_COMMAND"`, `"USER_INPUT"`, etc. |
| `status` | `string` | Step execution status | `"DONE"`, `"RUNNING"` |
| `created_at` | `string` | ISO 8601 UTC timestamp | `"2026-07-26T05:45:21Z"` |
| `content` | `string` (optional) | Output payload / prompt text / notification string | User request, command output snippet, etc. |
| `tool_calls` | `array` (optional) | Array of tool call objects | Present on `PLANNER_RESPONSE` events |
| `truncated_fields` | `array` (optional) | List of fields truncated in this line | `["content"]`, `["tool_calls"]` |
| `exit_code` | `number` (optional) | Process exit code for terminal execution | `0`, `1`, etc. (on `RUN_COMMAND` events) |

### 3.2 Key Event Types Breakdown

| Event `type` | Source | Description & Payload |
|---|---|---|
| `PLANNER_RESPONSE` | `MODEL` | Model reasoning step. Contains `tool_calls` array listing proposed tool invocations. |
| `VIEW_FILE` | `MODEL` | Tool execution output for `view_file`. `content` includes file path, line count, bytes, snippet. |
| `GREP_SEARCH` | `MODEL` | Tool execution output for `grep_search`. `content` contains matched file JSON lines or line snippets. |
| `CODE_ACTION` | `MODEL` | Tool execution output for file modification tools (`write_to_file`, `replace_file_content`, `multi_replace_file_content`). |
| `RUN_COMMAND` | `MODEL` | Tool execution output for terminal commands (`run_command`). Includes `exit_code`. |
| `LIST_DIRECTORY` | `MODEL` | Tool execution output for `list_dir`. `content` lists directory entries. |
| `FIND` | `MODEL` | Tool execution output for `find_by_name`. |
| `USER_INPUT` | `USER_EXPLICIT` | User prompt text in `content`. Includes `<USER_SETTINGS_CHANGE>` if model settings changed. |
| `SYSTEM_MESSAGE` | `SYSTEM` | System notifications (e.g. background task completion alerts). |
| `EPHEMERAL_MESSAGE` | `SYSTEM` | Liveness updates, timer triggers, or subagent communications. |

---

## 4. Tool Call & Read/Write Event Identification

### 4.1 Tool Call Structure in `PLANNER_RESPONSE`

When `type == "PLANNER_RESPONSE"`, the entry includes `tool_calls`:
```json
{
  "step_index": 3,
  "source": "MODEL",
  "type": "PLANNER_RESPONSE",
  "status": "DONE",
  "created_at": "2026-07-26T05:44:57Z",
  "tool_calls": [
    {
      "name": "view_file",
      "args": {
        "AbsolutePath": "\"/home/user/see-agy/ORIGINAL_REQUEST.md\"",
        "toolAction": "\"Reading original request\"",
        "toolSummary": "\"View ORIGINAL_REQUEST.md\""
      }
    }
  ]
}
```

### 4.2 Classifying READ vs WRITE Events

To broadcast visual decay events to the frontend dashboard:

1. **READ Events (`view_file`, `grep_search`)**:
   - **`view_file`**:
     - Extract `tc.args.AbsolutePath`.
     - Target file: Single file path.
   - **`grep_search`**:
     - Extract `tc.args.SearchPath`.
     - Target path: Directory or file being searched. If `SearchPath` is a directory, match against workspace files within that directory.

2. **WRITE Events (`write_to_file`, `replace_file_content`, `multi_replace_file_content`)**:
   - **`write_to_file`**: Extract `tc.args.TargetFile`.
   - **`replace_file_content`**: Extract `tc.args.TargetFile`.
   - **`multi_replace_file_content`**: Extract `tc.args.TargetFile`.

### 4.3 String Normalization / Unquoting Rule
In `transcript.jsonl`, string arguments in `tc.args` are wrapped in extra double quotes:
`tc.args.AbsolutePath` = `'"/home/user/see-agy/ORIGINAL_REQUEST.md"'`

**Normalization logic in JavaScript**:
```js
function normalizePath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  let clean = rawPath.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.slice(1, -1);
  }
  // Unescape backslashes if present
  return clean.replace(/\\"/g, '"');
}
```

### 4.4 Workspace Boundary Filtering & Relative Path Resolution

**Observation**: Across active log files, over 90% of logged file paths are external (e.g. `~/.gemini/antigravity-cli/...` or `/run/media/...`).

**Backend Filter Rule**:
```js
const WORKSPACE_ROOT = '/home/user/see-agy';

function resolveWorkspaceRelativePath(absolutePath) {
  const clean = normalizePath(absolutePath);
  if (clean.startsWith(WORKSPACE_ROOT)) {
    // Convert to relative path matching the treemap structure
    let rel = clean.slice(WORKSPACE_ROOT.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel;
  }
  return null; // Ignore paths outside workspace
}
```

---

## 5. Agent Working/Idle Status, Active Model, & Step Counter

### 5.1 Step Counter
Extracted directly from `step_index` of the latest line parsed in `transcript.jsonl`.

### 5.2 Active Model
- Default / Persistent Setting: Stored in `~/.gemini/antigravity-cli/settings.json` under key `"model"` (e.g., `"Gemini 3.6 Flash (High)"`).
- Dynamic Settings Change: Parsed from `USER_INPUT` event content if `<USER_SETTINGS_CHANGE>` is present.

### 5.3 Working vs Idle Status Logic
An agent's state transitions can be tracked using a hybrid approach:
1. **Activity-based Working State**:
   - When a new line is appended to `transcript.jsonl` with `source: "MODEL"` or `status: "RUNNING"`, set `status = "working"`.
   - Reset a 2.5-second inactivity timer on every line append.
2. **Idle Transition**:
   - If no new line is written to `transcript.jsonl` for > 2.5 seconds, or when a step completes with `status: "DONE"` and no pending tools remain, transition `status = "idle"`.

---

## 6. Edge Cases & Recommended Backend Implementation Strategy

### 6.1 Non-existent Log Directory on Startup
- **Scenario**: When the visualizer server starts up, no session logs may exist yet or `~/.gemini/antigravity-cli/brain/` might be empty.
- **Handling**: Chokidar should watch the directory with `ignoreInitial: false` and `depth: 5`. If directory doesn't exist, create a polling fallback or start watching parent `~/.gemini/antigravity-cli/brain`.

### 6.2 Partial Line Buffering on Log Tailing
- **Scenario**: Log lines are appended to `transcript.jsonl` via streaming writes. Reading a file immediately upon a chokidar `change` event might read a incomplete JSON line at EOF.
- **Handling**: Use `readline` interface or string splitting with an incomplete line buffer:
  ```js
  let buffer = '';
  stream.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer
    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          processEvent(event);
        } catch (e) {
          // Log invalid JSON line
        }
      }
    }
  });
  ```

### 6.3 Multiple Active Brain Sessions
- **Scenario**: Concurrent subagents or multi-session workflows create multiple brain directories (`/brain/<uuid>/`).
- **Handling**: Watch all `transcript.jsonl` files in `/brain/*/.system_generated/logs/transcript.jsonl`. Parse events from whichever session is actively writing.

---

## 7. Verification Method

1. **Verify Log File Discovery**:
   Run: `find ~/.gemini/antigravity-cli/brain -name "transcript.jsonl"`
2. **Verify String Unquoting**:
   Run: `python3 -c "import json; l=open('/home/user/.gemini/antigravity-cli/brain/084ccde8-e4fc-4bc0-99fd-43041ccb6f2a/.system_generated/logs/transcript.jsonl').readlines()[3]; print(json.loads(l)['tool_calls'][0]['args']['AbsolutePath'])"`
3. **Verify Settings Model Extraction**:
   Run: `python3 -c "import json; print(json.load(open('/home/user/.gemini/antigravity-cli/settings.json'))['model'])"`
