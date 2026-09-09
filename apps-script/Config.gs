// ============================================================
// 設定值管理
// ============================================================
// 所有環境相關設定（試算表 ID 等）一律存放在 Apps Script 的
// 「指令碼屬性」（Script Properties），不寫死在程式碼中：
//   - 程式碼可安全地公開到 GitHub，不會外流任何機密或環境資訊
//   - 更換試算表（例如原檔損毀重建）時，只需要改這裡的屬性值，
//     不必修改、也不必重新部署 Web App
//
// 設定方式：
//   Apps Script 編輯器 → 左側齒輪圖示「專案設定」→ 捲到最下方
//   「指令碼屬性」→ 新增屬性
//
//   屬性名稱           必填  說明
//   ─────────────────  ────  ──────────────────────────────
//   SHEET_ID           是    試算表 ID（網址 /d/ 與 /edit 之間那段字串）
//   SHEET_NAME         否    通報資料工作表名稱，預設 SmokingReports
//   ALLOWED_ORIGIN     否    允許讀取的前端網域，預設 GitHub Pages 網址
// ============================================================

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('CONFIG_MISSING_SHEET_ID：請至「專案設定 → 指令碼屬性」設定 SHEET_ID');
  }
  return {
    SHEET_ID: sheetId,
    SHEET_NAME: props.getProperty('SHEET_NAME') || 'SmokingReports',
    ALLOWED_ORIGIN: props.getProperty('ALLOWED_ORIGIN') || 'https://tghtaipei.github.io'
  };
}
