# 吸菸熱點通報系統 Smoking Hotspot Reporting System

台北市吸菸熱點通報與統計地圖系統。

## 系統架構

```
┌─────────────────────┐     ┌──────────────────────┐
│   Google Apps Script │────▶│    Google Sheets      │
│   (電子表單 / API)   │     │  (資料儲存 / 後端)    │
└─────────────────────┘     └──────────┬───────────┘
                                        │ JSON API
                             ┌──────────▼───────────┐
                             │    GitHub Pages       │
                             │  (統計熱點地圖)       │
                             └──────────────────────┘
```

## 功能說明

### 1. 電子表單（Apps Script）
- GPS 自動定位，無法取得時可手動輸入地址查詢地圖
- 時段記錄（0:00 起，每 2 小時一個時段，共 12 時段）
- 資料儲存至 Google Sheets

### 2. 統計地圖（GitHub Pages）
- OpenFreeMap 台北市底圖
- 酷炫點位熱點圖層（MapLibre GL）
- 浮動時段選擇按鈕

## 時段對照表

| 時段 | 時間範圍 |
|------|----------|
| 0    | 00:00 – 01:59 |
| 1    | 02:00 – 03:59 |
| 2    | 04:00 – 05:59 |
| 3    | 06:00 – 07:59 |
| 4    | 08:00 – 09:59 |
| 5    | 10:00 – 11:59 |
| 6    | 12:00 – 13:59 |
| 7    | 14:00 – 15:59 |
| 8    | 16:00 – 17:59 |
| 9    | 18:00 – 19:59 |
| 10   | 20:00 – 21:59 |
| 11   | 22:00 – 23:59 |

## 目錄結構

```
├── docs/                      # GitHub Pages 靜態檔案
│   ├── index.html             # 統計熱點地圖
│   └── api-mock.json          # 本機測試資料
├── apps-script/
│   ├── Code.gs                # Apps Script 主程式（表單 + API）
│   └── appsscript.json        # Apps Script 設定
├── tests/
│   ├── unit/                  # 單元測試
│   └── integration/           # 整合測試
└── design/
    └── system-design.md       # 系統設計文件
```

## 部署步驟

### Apps Script 部署
1. 開啟 [Google Apps Script](https://script.google.com)
2. 建立新專案，複製 `apps-script/Code.gs` 內容
3. 修改 `SHEET_ID` 為你的 Google Sheets ID
4. 部署為網頁應用程式（Web App），執行者設為「我」，存取者設為「所有人」
5. 複製部署網址，填入 `docs/index.html` 的 `API_URL`

### GitHub Pages 部署
1. 將 `docs/` 目錄推送至 GitHub
2. 在 Repository Settings → Pages 中選擇 `docs/` 資料夾
3. 等待部署完成即可存取地圖

## 測試

```bash
# 執行單元測試（Node.js 環境）
npm test

# 執行整合測試
npm run test:integration
```
