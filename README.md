# 吸菸熱點通報系統 Smoking Hotspot Reporting System

台北市吸菸熱點通報與統計地圖系統，提供市民即時通報吸菸熱點，並以互動地圖呈現時空分布。

## 系統架構

```
使用者手機瀏覽器
       │
       ├──[通報表單] Apps Script Web App (HTML Service)
       │              │
       │         Google Maps Geocoding（後端，免 API Key）
       │              │
       │         Google Sheets (SmokingReports)
       │
       └──[統計地圖] GitHub Pages (docs/index.html)
                     │
                     └── fetch ?action=getReports
                              │
                         Apps Script doGet() → GeoJSON
```

## 功能說明

### 電子表單（Apps Script）
- **GPS 自動定位**：一鍵取得裝置座標，顯示 Leaflet 地圖預覽
- **手動地址輸入**：透過 Apps Script 後端呼叫 Google Maps Geocoding，精確支援台灣中文地址
- **時段自動計算**：送出時依台北時間自動計算所屬時段（0:00 起，每 2 小時一段，共 12 段）
- **重複通報防護**：同一裝置在同時段、100m 範圍內僅計 1 筆

### 統計地圖（GitHub Pages）
- **底圖**：OpenFreeMap liberty 樣式（免費、無需 API Key）
- **點位圖層**：12 個時段各對應不同高對比顏色，附白色外框易於辨識
- **自動對焦**：資料載入後地圖自動飛至點位所在區域
- **時段篩選**：底部浮動按鈕列（全部 + 12 時段），有資料的時段顯示色點
- **資料來源狀態**：左上角即時顯示「即時資料 / 示範資料」與筆數
- **重新整理按鈕**：右上角 🔄 手動重新載入最新資料

## 時段對照表

| 時段編號 | 時間範圍 | 點位顏色 |
|---------|---------|---------|
| 0  | 00:00–01:59 | 🔵 藍 |
| 1  | 02:00–03:59 | 🔷 靛藍 |
| 2  | 04:00–05:59 | 🟣 紫 |
| 3  | 06:00–07:59 | 🟢 翠綠 |
| 4  | 08:00–09:59 | 🟩 綠 |
| 5  | 10:00–11:59 | 🟡 黃 |
| 6  | 12:00–13:59 | 🟠 橙 |
| 7  | 14:00–15:59 | 🩷 珊瑚紅 |
| 8  | 16:00–17:59 | 🔴 紅 |
| 9  | 18:00–19:59 | 🔴 深紅 |
| 10 | 20:00–21:59 | 🟣 深紫 |
| 11 | 22:00–23:59 | 🔵 深藍 |

## 目錄結構

```
├── docs/                        # GitHub Pages 靜態檔案
│   ├── index.html               # 統計熱點地圖（MapLibre GL）
│   └── api-mock.json            # 本機測試用示範資料（15 筆）
├── apps-script/
│   ├── Code.gs                  # 主程式（表單送出、API、去重、驗證）
│   ├── processFormData.gs       # HTML Service 橋接 + Google Maps Geocoding
│   ├── Form.html                # 通報表單（GPS / 手動地址）
│   └── appsscript.json          # Apps Script 專案設定
├── tests/
│   ├── unit/logic.test.js       # 單元測試（33 項）
│   ├── integration/api.test.js  # 整合測試（15 項）
│   └── test-plan.md             # 測試規劃文件
├── design/
│   └── system-design.md         # 系統設計規劃文件
└── package.json
```

## 已知限制

| 項目 | 說明 |
|------|------|
| Google Maps Geocoding 配額 | 免費帳號 100 次/天、Workspace 1,000 次/天（僅手動輸入地址時消耗） |
| GPS 精度 | 依裝置與環境而定，室內可能偏差 10–50m |
| 通報座標範圍 | 限制在台北市（緯度 24.9–25.3，經度 121.4–121.7） |

## 部署步驟

### 一、Apps Script 部署

1. 開啟 [Google Apps Script](https://script.google.com) 建立新專案
2. 複製以下檔案內容至對應的 `.gs` / `.html` 檔：
   - `Code.gs` → 主程式
   - `processFormData.gs` → 新增至專案（同名新檔）
   - `Form.html` → HTML 檔案
   - `appsscript.json` → 專案設定（需開啟「顯示 appsscript.json」）
3. 修改 `Code.gs` 第 4 行的 `SHEET_ID` 為您的 Google Sheets ID
4. 部署 → 新增部署作業 → 類型選「網頁應用程式」
   - 執行者：**我**
   - 存取者：**所有人**
5. 複製部署網址（`https://script.google.com/macros/s/.../exec`）

### 二、GitHub Pages 部署

1. 確認 `docs/index.html` 第 304 行的 `API_URL` 已填入 Apps Script 部署網址
2. 推送 `main` 分支至 GitHub
3. Repository Settings → Pages → Source：**Deploy from a branch**
   - Branch：`main`，Folder：`/docs`
4. 儲存後等待約 1–2 分鐘，部署網址：
   ```
   https://tghtaipei.github.io/SmokingHotspotReportingSystem/
   ```

## 測試

```bash
npm test                  # 執行所有測試（單元 + 整合）
npm run test:unit         # 只執行單元測試（33 項）
npm run test:integration  # 只執行整合測試（15 項）
```

測試結果（最後執行）：
```
單元測試：33/33 通過 ✅
整合測試：15/15 通過 ✅
```

## Google Sheets 資料欄位

工作表名稱：`SmokingReports`

| 欄位 | 說明 |
|------|------|
| id | UUID（自動產生） |
| timestamp | 回報時間（ISO 8601，UTC） |
| time_slot | 時段 0–11（依台北時間自動計算） |
| lat | 緯度 |
| lng | 經度 |
| location_source | `gps` 或 `manual` |
| address_input | 使用者輸入的地址（手動模式） |
| description | 補充說明（選填） |
| reporter_hash | 裝置識別碼 SHA-256 雜湊（前 16 碼，用於去重） |
