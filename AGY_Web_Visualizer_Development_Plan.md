# AGY CLI Web Visualizer 開發設計計劃書

本計劃書旨在透過**「組裝現有開源套件 (Don't Reinvent the Wheel)」**的方式，快速建構一個無侵入式的 AGY CLI 視覺化 Web 儀表板。系統透過 Linux 本地 `inotify` 核心機制動態追蹤檔案變動，並透過 2D/3D 方塊陣列與動態衰減效果呈現 AGY 的工作狀態。

---

## 🛠️ 一、 技術堆疊與開源套件選擇 (Tech Stack)

| 模組區塊 | 選用技術 / 現成開源 Repo | 採用理由與功用 |
| :--- | :--- | :--- |
| **Linux 事件監控** | **`paulmillr/chokidar`** | 封裝 Linux `inotify`，以極低 CPU 資源監控檔案 `OPEN` / `MODIFY`。 |
| **即時事件傳輸** | **`socketio/socket.io`** | 負責將後端捕抓到的檔案變動秒級廣播至 Web 端。 |
| **2D/3D 方塊繪製** | **`d3/d3-hierarchy`** | 負責把專案檔案目錄結構快速計算成矩陣小方塊（Treemap Layout）。 |
| **UI 與動畫模組** | **`shadcn-ui/ui`** + **`Lottie-web`** | 快速搭建科技感面板、Credit 進度條與 Agent 工作狀態吉祥物動畫。 |
| **Token 計費監控** | **`BerriAI/litellm` (UI 思路)** | 參考其 Token/Usage 記錄機制，用於展示剩餘 Credit 與消耗速度。 |

---

## 📐 二、 系統架構設計 (Architecture Design)

整體架構採用 **無侵入式中繼站（Zero-Invasive Proxy）** 設計：

```
+-----------------------------------------------------------------------+
|  1. Linux OS & Local File System                                      |
|     - inotify: 捕捉檔案 Open (讀) / Modify (改)                        |
|     - process / API: 捕捉 AGY 當前 Token / Credit 狀態                 |
+-----------------------------------------------------------------------+
                                   │ (File Event & Usage)
                                   ▼
+-----------------------------------------------------------------------+
|  2. Node.js Middleware Server (後端中繼站)                             |
|     - Chokidar: 過濾 .git / node_modules 雜訊                         |
|     - Event Aggregator: 防抖 (Debounce) 避免 I/O 暴增卡頓             |
|     - Socket.io Server: 廣播 { path, action: 'READ'|'WRITE' }          |
+-----------------------------------------------------------------------+
                                   │ (WebSocket Event Stream)
                                   ▼
+-----------------------------------------------------------------------+
|  3. Web Visualizer Frontend (前端控制面板)                            |
|     - Treemap Engine (D3): 計算方塊座標                               |
|     - Canvas Fade-out Loop: 1.5 秒衰減動畫演算法                      |
|     - Working Mascot Widget: 監聽事件頻率切換 Idle / Working           |
|     - Token / Credit Bar: 實時顯示剩餘配額                             |
+-----------------------------------------------------------------------+
```

---

## 💻 三、 核心邏輯實現

### 1. 後端 Node.js 服務監控 (`server.js`)

```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 監控當前專案資料夾，並排除雜訊黑名單
const watcher = chokidar.watch('.', {
  ignored: /(^|[\/\])\..|node_modules|dist|build|\.git/, // 排除隱藏檔與 build 目錄
  persistent: true,
  ignoreInitial: true
});

watcher
  .on('change', path => io.emit('file_event', { path, type: 'WRITE' }))
  .on('add', path => io.emit('file_event', { path, type: 'WRITE' }))
  .on('access', path => io.emit('file_event', { path, type: 'READ' }));

server.listen(3001, () => console.log('Visualizer Backend running on port 3001'));
```

### 2. 前端 1.5 秒冷卻衰減演算法 (`main.js`)

```javascript
import { io } from "socket.io-client";
import * as d3 from "d3";

const socket = io("http://localhost:3001");
const fileStates = new Map(); // path -> { type, intensity, lastUpdated }

socket.on("file_event", ({ path, type }) => {
  fileStates.set(path, {
    type,
    intensity: 1.0, // 初始化最高亮度
    lastUpdated: performance.now()
  });
  triggerWorkingAnimation();
});

function renderLoop() {
  const now = performance.now();
  ctx.clearRect(0, 0, width, height);

  fileStates.forEach((state, path) => {
    // 1.5 秒內 intensity 從 1.0 線性衰減至 0.0
    const elapsed = (now - state.lastUpdated) / 1000;
    state.intensity = Math.max(0, 1.0 - elapsed / 1.5);

    const block = getBlockLayout(path); 
    const color = state.type === 'WRITE' ? `rgba(249, 115, 22, ${state.intensity})`  // 橘色: 修改
                                         : `rgba(56, 189, 248, ${state.intensity})`; // 藍色: 讀取
    drawBlock(block, color);
  });

  requestAnimationFrame(renderLoop);
}
renderLoop();
```

---

## 🚀 四、 開發時程與階段規劃 (Roadmap)

| 階段 | 階段名稱 | 核心任務 | 預估時程 |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **基底建立與數據鏈** | 複製 `chokidar` + `socket.io` 範例，實現 Linux 本地檔案事件發送至 Web 端。 | **2 ~ 3 小時** |
| **Phase 2** | **方塊矩陣與衰減** | 引入 `d3-hierarchy` 繪製專案目錄矩陣，實現 1.5 秒顏色發光與衰減邏輯。 | **4 ~ 5 小時** |
| **Phase 3** | **工作動畫與 Credit UI** | 引入 `shadcn/ui` 儀表卡片與 `Lottie-web`，依據事件頻率切換工作/休眠狀態。 | **3 ~ 4 小時** |
| **Phase 4** | **整體調校與打包** | 設定檔案過濾黑名單（過濾 `.git` 等雜訊），打包為 CLI 便攜套件。 | **2 ~ 3 小時** |

**預估總開發時間**：約 **11 ~ 15 小時**（單人約 1.5 ~ 2 天即可完成 MVP）。
