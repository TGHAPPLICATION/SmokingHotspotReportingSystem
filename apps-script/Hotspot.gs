// ============================================================
// 吸菸熱點 — 提供地圖「吸菸熱點」圖層與熱點分析報表的資料
// ============================================================
// 資料放在主試算表（Script Properties 的 SHEET_ID）的「吸菸熱點」分頁，
// 內容為系統匯出的 CSV（檔案 → 匯入 → 上傳 → 插入新工作表／取代目前工作表），
// 第 1 列為標題：單位,上傳時間,行政區,座標,專案名稱,場域說明,通報指標,吸菸區,菸蒂估算數量,備註說明
//
// 前端（docs/hotspot-report.js）以 JSONP 呼叫 doGet?action=getHotspotRows，
// 解析、行政區校正、篩選統計都在前端進行，這裡只負責原樣讀出。
// 這張分頁由 Code.gs 的 HIDDEN_DYNAMIC_LAYER_SHEETS 排除在通用圖層按鈕之外。

var HOTSPOT_SHEET_NAME = '吸菸熱點';

function getHotspotRowsJson(e) {
  var callback = e && e.parameter && e.parameter.callback;
  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = ss.getSheetByName(HOTSPOT_SHEET_NAME);
  if (!sheet) return jsonpErrorResponse_('HOTSPOT_SHEET_NOT_FOUND：請建立「' + HOTSPOT_SHEET_NAME + '」分頁並匯入 CSV', callback);

  var values = sheet.getDataRange().getValues();
  var header = (values.shift() || []).map(function(h) { return String(h).trim(); });
  // 匯入時 Google Sheets 可能把「上傳時間」轉成日期型別，統一轉回 CSV 原本的字串格式
  var rows = values.map(function(row) {
    return row.map(function(v) {
      return v instanceof Date ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/MM/dd HH:mm') : String(v);
    });
  });

  var json = JSON.stringify({ success: true, header: header, rows: rows });
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
