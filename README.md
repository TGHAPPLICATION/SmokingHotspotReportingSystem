# 台北市吸菸熱點通報系統

提供市民透過手機瀏覽器即時通報吸菸熱點，並以互動地圖呈現時空分布與長期成效趨勢，協助衛生局掌握吸菸行為的時空分布與稽查成效。

## 線上展示

| 功能 | 網址 |
|------|------|
| 統計地圖 | `https://tghtaipei.github.io/SmokingHotspotReportingSystem/` |
| 通報表單 | Apps Script 部署網址（見部署步驟） |

---

## 系統架構

```
使用者手機瀏覽器
       │
       ├──[通報] Apps Script Web App (HTML Service)
       │              │
       │         POST doPost() → 驗證 → 去重 → 寫入
       │              │
       │         Google Sheets（分頁名稱、試算表 ID 皆讀取
       │         Apps Script「指令碼屬性」，不寫死於程式碼）
       │
       └──[查看地圖] GitHub Pages (docs/index.html)
                     │
                     ├── Apps Script Web App
                     │     ?action=listSheets   → 回傳分頁清單
                     │     ?action=getSheetRows → 回傳指定分頁座標 GeoJSON
                     │   （前端不持有試算表 ID 或任何 Google API 金鑰，
                     │    一律透過 JSONP 向自家 Apps Script 拿資料）
                     │
                     └── docs/smoking-zones.json → 合法吸菸區 GeoJSON
                              │
                         GitHub Actions（每天 10:00 台北時間）
                         自動從台北市開放資料下載並更新
```

**技術選型**

| 元件 | 技術 |
|------|------|
| 通報表單 | Google Apps Script HTML Service |
| 資料庫 | Google Sheets（ID 存於 Apps Script 指令碼屬性，非公開） |
| 後端 API（寫入 / 讀取） | Apps Script Web App（doPost 寫入；doGet 以 JSONP 提供 `getReports`／`listSheets`／`getSheetRows`） |
| 設定管理 | Apps Script Script Properties（`Config.gs`），程式碼中不含任何金鑰或試算表 ID |
| 合法吸菸區資料 | GitHub Actions 每日更新靜態 JSON |
| 地圖前端 | GitHub Pages + MapLibre GL JS 4.3.2 |
| 分群演算法 | supercluster 8.0.1（JS 端手動計算） |
| 圖表報表 | Chart.js 4.4.3 |
| 底圖 | OpenFreeMap liberty（免費、無需 API Key） |
| 測試資料產生 | Apps Script GenerateMockData.gs（10,000 筆） |

---

## 地圖功能

### 三種視覺化模式（可即時切換）

| 模式 | 說明 |
|------|------|
| 🔵 分群 | supercluster 動態聚合，圓圈大小與顏色深淺呈現數量（綠→黃→橘→紅） |
| 🔥 熱力 | WebGL heatmap，密度梯度呈現空間分布 |
| ⚪ 點位 | 所有個別點位，依時段 4 色顯示 |

### 合法吸菸區標記

- 左側面板提供「合法吸菸區」開關，顯示台北市政府公告的合法吸菸區位置
- 以紅色水滴錨點標記，可與回報熱點疊加比對
- 資料來源：[台北市政府開放資料](https://data.taipei/dataset/detail?id=8b2fcdeb-d14b-46c4-92d8-66ad07b96a91)，每天自動更新

### 多分頁動態圖層

- Header 會自動列出試算表中「每一個分頁」，各自變成一個可獨立開關的圖層按鈕（不同顏色區分）
- 每個分頁各自獨立分群、獨立計數，可同時開啟多個分頁比對
- 座標欄位採自動偵測：優先比對常見欄位名稱（`lat`/`緯度`/`經度`…），找不到時自動掃描台北座標範圍內的數值欄位，因此可直接沿用衛生局、環保局等單位既有的 Excel／表單格式，不需要改造成固定的九欄格式
- 資料一律由 Apps Script Web App 代理讀取（見〈系統架構〉），試算表本身不需要公開分享

### 篩選功能

- **月份滑桿**：選取特定月份或「全部時間」，◀ ▶ 按鈕逐月切換
- **時段 band 篩選**：點選 00–04 / 04–10 / 10–16 / 16–24 時，可多選
- 月份與時段篩選串聯，同步更新所有視覺化模式

### 統計資訊（左側面板）

- 顯示點位數（目前**已開啟圖層**篩選後的加總）
- 總回報數（已開啟圖層的全部資料）
- 最熱時段

> 統計資訊與下方「📊 成效報表」皆以目前**已手動開啟的圖層**資料為準；尚未點開任何圖層按鈕時，兩者皆為空。

### 📊 成效報表

點擊 Header「📊 成效報表」按鈕，從右側滑出報表面板，包含：

- **指標卡**：總通報數、環比變化（%）、連續下降月數、峰值月份、最熱時段、涵蓋月數
- **月趨勢折線圖**：每月通報量走勢
- **時段分布橫條圖**：各時段佔比
- **月份 × 時段堆疊橫條圖**：每月各時段比例，可觀察稽查後尖峰時段是否轉移

**報表按鈕的顯示規則**：報表統計是靠每個點位的 `timestamp` 欄位算出來的，不是每個動態圖層分頁都有這個欄位（例如純粹的地點清單）。因此按鈕會依目前**已開啟**的圖層動態顯示／隱藏：

| 已開啟的圖層狀態 | 報表按鈕 |
|---|---|
| 沒有開啟任何圖層 | 隱藏 |
| 開啟的圖層都有 `timestamp` 資料 | 顯示（多個圖層的資料會疊加一起統計） |
| 開啟的圖層中，只要有一個沒有 `timestamp` 資料 | 隱藏 |

若某個分頁明明是通報類資料、報表按鈕卻一直沒出現，通常代表該分頁缺少標題列，或標題沒有命名為 `timestamp`／`time_slot`，請參考〈Google Sheets 資料欄位〉章節補上。

---

## 目錄結構

```
├── docs/
│   ├── index.html              # 統計熱點地圖（MapLibre GL + supercluster + Chart.js）
│   ├── smoking-zones.json      # 台北市合法吸菸區 GeoJSON（GitHub Actions 每日更新）
│   └── api-mock.json           # 本機示範資料（10,000 筆）
├── apps-script/
│   ├── Code.gs                 # 主程式（表單送出、API、去重、驗證、動態圖層讀取）
│   ├── Config.gs               # 設定值管理（讀取 Script Properties，不寫死金鑰/ID）
│   ├── GenerateMockData.gs     # 測試資料產生器（10,000 筆，含清除功能）
│   ├── Form.html               # 通報表單（GPS / 手動地址）
│   ├── processFormData.gs      # HTML Service 表單資料橋接 / 地址地理編碼
│   └── appsscript.json         # Apps Script 專案設定
├── .github/workflows/
│   └── update-smoking-zones.yml  # 合法吸菸區資料每日自動更新 workflow
├── design/
│   └── system-design.md        # 系統設計規劃文件
└── README.md
```

---

## Google Sheets 資料欄位

### 通報資料工作表（表單寫入專用）

工作表名稱：預設 `SmokingReports`，可透過 Script Properties 的 `SHEET_NAME` 調整（見〈部署步驟〉）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | STRING | UUID（自動產生） |
| timestamp | DATETIME | 回報時間（ISO 8601） |
| time_slot | INTEGER | 時段 0–11（`floor(hour/2)`） |
| lat | FLOAT | 緯度 |
| lng | FLOAT | 經度 |
| location_source | STRING | `gps` 或 `manual` |
| address_input | STRING | 使用者輸入的地址（選填） |
| description | STRING | 補充說明（選填） |
| reporter_hash | STRING | SHA-256 雜湊前 16 碼（用於去重，不儲存個人資料） |

### 其他動態圖層分頁（選用）

同一份試算表底下可自由新增其他分頁（例如稽查單位自建的 Excel 匯入資料），會自動出現在地圖 Header 成為獨立圖層，欄位格式不需要與上表一致——只要有一欄能被判定為緯度、一欄能被判定為經度即可（見〈多分頁動態圖層〉）。

---

## 部署步驟

### 一、Google Sheets 設定

1. 建立新 Google Sheets，複製試算表 ID（URL 中的長字串）
2. **共用設定維持預設（限制／僅擁有者）即可，不需要公開分享**——因為所有讀取都改由 Apps Script Web App 以「執行者：我」的身分代理存取（見下方），不再有前端直接呼叫 Google API 的路徑

### 二、Apps Script 部署

1. 開啟 [Google Apps Script](https://script.google.com) 建立新專案
2. 複製以下檔案至對應 `.gs` / `.html`：
   - `Code.gs`、`Config.gs`、`GenerateMockData.gs`、`Form.html`、`processFormData.gs`、`appsscript.json`
3. **設定專案設定 → 指令碼屬性**（不要把 ID 寫進程式碼）：
   | 屬性名稱 | 必填 | 值 |
   |---|---|---|
   | `SHEET_ID` | 是 | 您的試算表 ID |
   | `SHEET_NAME` | 否 | 通報資料工作表名稱，預設 `SmokingReports` |
   | `ALLOWED_ORIGIN` | 否 | 前端網域，預設 `https://tghtaipei.github.io` |
4. **部署 → 新增部署 → 網頁應用程式**
   - 執行者：**我**
   - 存取者：**所有人**
5. 複製部署網址，填入通報表單 `Form.html` 中的 `ACTION_URL`

> 之後若需要更換試算表（例如原檔損毀重建），只要回到「指令碼屬性」改 `SHEET_ID` 即可，不需要改動、也不需要重新部署任何程式碼。

### 三、GitHub Pages 設定

1. 修改 `docs/index.html` 中的 `API_URL` 為您的 Apps Script 部署網址（`Form.html` 用的同一個網址）
2. Repository Settings → Pages → Branch: `main`，Folder: `/docs`
3. 約 1–2 分鐘後生效

> `docs/index.html` 不再需要、也不應該填入試算表 ID 或任何 Google API 金鑰——地圖資料一律透過上面的 `API_URL` 向 Apps Script 拿。

### 四、合法吸菸區資料（自動更新）

合法吸菸區資料由 GitHub Actions 自動維護，**無需手動操作**：

- 排程：每天台北時間上午 10:00（UTC 02:00）自動執行
- 來源：台北市政府開放資料（resource ID: `acaa0f43-3b92-4241-b5eb-3f7fdd76b74f`）
- 結果：自動 commit 至 `docs/smoking-zones.json`
- 手動觸發：GitHub → Actions → `Update Smoking Zones Data` → `Run workflow`

### 五、產生測試資料（選用）

在 Apps Script 編輯器執行 `generateMockData()`，自動寫入 10,000 筆台北市模擬通報資料。執行 `clearMockData()` 可清除（reporter_hash 以 `mock-` 開頭的資料）。

---

## 安全性設計

- 不儲存使用者個人資料
- 以裝置識別碼 SHA-256 雜湊去重，同一裝置同時段同位置（100m 內）僅計 1 筆
- 座標限制於台北市範圍（緯度 24.9–25.3，經度 121.4–121.7）
- 試算表 ID、工作表名稱等設定值一律存放於 Apps Script「指令碼屬性」，不寫死在程式碼中，前端與 GitHub 上的原始碼皆不含任何試算表 ID 或 API 金鑰
- 所有讀取（圖層清單、座標資料）都透過 Apps Script Web App 以「執行者：我」代理存取，Google Sheets 本身**不需要公開分享**，降低原始通報資料（含地址、備註）被任意知道連結的人讀取的風險

---

## 已知限制

| 項目 | 說明 |
|------|------|
| GPS 精度 | 依裝置與環境，室內可能偏差 10–50m |
| Apps Script 配額 | 免費帳號每日執行時間上限 6 分鐘，大量資料讀取時需注意 |
| 動態圖層座標偵測 | 分頁若缺乏可辨識的經緯度欄位名稱、且數值也不落在台北座標範圍內，該分頁將無法顯示任何點位 |
| 前端狀態快取 | 地圖點位與「📊 成效報表」資料皆暫存於瀏覽器記憶體，僅在使用者手動點擊圖層按鈕或按下「🔄 重新整理」時才會向 Apps Script 重新取資料；背景試算表異動不會即時反映在已開啟的分頁 |
| 字體限制 | OpenFreeMap 不提供自訂字體，地圖標籤使用底圖內建字體 |
