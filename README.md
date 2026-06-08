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
       │         Google Sheets (SmokingReports)
       │
       └──[查看地圖] GitHub Pages (docs/index.html)
                     │
                     ├── Google Sheets gviz JSONP → 回報點位 GeoJSON
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
| 資料庫 | Google Sheets |
| 後端 API（寫入） | Apps Script Web App（doPost） |
| 回報資料讀取 | Google Sheets gviz JSONP（無 CORS 問題） |
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

### 篩選功能

- **月份滑桿**：選取特定月份或「全部時間」，◀ ▶ 按鈕逐月切換
- **時段 band 篩選**：點選 00–04 / 04–10 / 10–16 / 16–24 時，可多選
- 月份與時段篩選串聯，同步更新所有視覺化模式

### 統計資訊（左側面板）

- 顯示點位數（目前篩選後）
- 總回報數（全部資料）
- 最熱時段

### 📊 成效報表

點擊 Header「📊 成效報表」按鈕，從右側滑出報表面板，包含：

- **指標卡**：總通報數、環比變化（%）、連續下降月數、峰值月份、最熱時段、涵蓋月數
- **月趨勢折線圖**：每月通報量走勢
- **時段分布橫條圖**：各時段佔比
- **月份 × 時段堆疊橫條圖**：每月各時段比例，可觀察稽查後尖峰時段是否轉移

---

## 目錄結構

```
├── docs/
│   ├── index.html              # 統計熱點地圖（MapLibre GL + supercluster + Chart.js）
│   ├── smoking-zones.json      # 台北市合法吸菸區 GeoJSON（GitHub Actions 每日更新）
│   └── api-mock.json           # 本機示範資料（10,000 筆）
├── apps-script/
│   ├── Code.gs                 # 主程式（表單送出、API、去重、驗證）
│   ├── GenerateMockData.gs     # 測試資料產生器（10,000 筆，含清除功能）
│   ├── Form.html               # 通報表單（GPS / 手動地址）
│   └── appsscript.json         # Apps Script 專案設定
├── .github/workflows/
│   └── update-smoking-zones.yml  # 合法吸菸區資料每日自動更新 workflow
├── design/
│   └── system-design.md        # 系統設計規劃文件
└── README.md
```

---

## Google Sheets 資料欄位

工作表名稱：`SmokingReports`

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

---

## 部署步驟

### 一、Google Sheets 設定

1. 建立新 Google Sheets，複製試算表 ID（URL 中的長字串）
2. **共用設定 → 知道連結的人可以「檢視」**（gviz JSONP 讀取必要）

### 二、Apps Script 部署

1. 開啟 [Google Apps Script](https://script.google.com) 建立新專案
2. 複製以下檔案至對應 `.gs` / `.html`：
   - `Code.gs`、`GenerateMockData.gs`、`Form.html`、`appsscript.json`
3. 修改 `Code.gs` 第 5 行 `SHEET_ID` 為您的試算表 ID
4. **部署 → 新增部署 → 網頁應用程式**
   - 執行者：**我**
   - 存取者：**所有人**
5. 複製部署網址，填入通報表單 `Form.html` 中的 `ACTION_URL`

### 三、GitHub Pages 設定

1. 修改 `docs/index.html` 中的 `SHEET_ID` 為您的 Google Sheets 試算表 ID
2. Repository Settings → Pages → Branch: `main`，Folder: `/docs`
3. 約 1–2 分鐘後生效

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

---

## 已知限制

| 項目 | 說明 |
|------|------|
| GPS 精度 | 依裝置與環境，室內可能偏差 10–50m |
| Apps Script 配額 | 免費帳號每日執行時間上限 6 分鐘，大量資料讀取時需注意 |
| gviz 讀取限制 | Google Sheets 須設為「知道連結的人可以檢視」，否則 gviz JSONP 無法讀取 |
| 字體限制 | OpenFreeMap 不提供自訂字體，地圖標籤使用底圖內建字體 |
