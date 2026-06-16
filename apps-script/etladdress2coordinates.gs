// ══════════════════════════════════════════════════════════════════
//  etladdress2coordinates.gs
//  上傳 Excel → 補齊地址 → 地理編碼 → 寫入目標試算表
// ══════════════════════════════════════════════════════════════════

// ── 常數 ─────────────────────────────────────────────────────────
var ETL_TARGET_SS_ID = '1MM61acAPR8AG4lE1YStevwkwxaWa_lZd5OvO1hW7F08';

var EXCEL_COL = {
  TIME:    4,  // D欄：時間
  ADDRESS: 5   // E欄：部分地址
};

var SHEET_COL = {
  TIME:    2,  // B欄：時間（轉換後）
  LAT:     4,  // D欄：緯度
  LNG:     5,  // E欄：經度
  ADDRESS: 7   // G欄：補齊後地址
};

var TAIPEI_PREFIX = '臺北市';

// ── 主流程（由前端呼叫）─────────────────────────────────────────
/**
 * 接收前端傳來的 base64 Excel 內容，執行完整 ETL 流程。
 * @param {string} base64Data  Excel 檔案的 base64 字串
 * @param {string} fileName    原始檔案名稱（含副檔名）
 * @returns {string} 處理結果訊息
 */
function processExcelUpload(base64Data, fileName) {
  var tempFileId;
  try {
    // 1. 將 Excel 暫存至 Drive 並轉為 Sheets 格式
    var sheetFileId = importExcelToDrive(base64Data, fileName);
    tempFileId = sheetFileId;

    // 2. 取得來源試算表所有分頁
    var sourceSS = SpreadsheetApp.openById(sheetFileId);
    var sourceSheets = sourceSS.getSheets();

    var targetSS = openTargetSpreadsheet();
    var processedSheets = [];

    sourceSheets.forEach(function(srcSheet) {
      var sheetName = srcSheet.getName();
      var rows = getSheetData(srcSheet);
      if (rows.length === 0) return;

      // 3. 在目標試算表建立（或清空）對應分頁
      var destSheet = getOrCreateSheet(targetSS, sheetName);

      // 4. ETL 每一列資料
      var outputRows = transformRows(rows);

      // 5. 寫入目標分頁
      writeOutputRows(destSheet, outputRows);
      processedSheets.push(sheetName);
    });

    return '完成！已處理分頁：' + processedSheets.join('、');
  } catch (err) {
    Logger.log('processExcelUpload error: ' + err);
    throw new Error('處理失敗：' + err.message);
  } finally {
    // 6. 刪除暫存的 Sheets 檔案
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (_) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  模組一：Drive 檔案處理
// ══════════════════════════════════════════════════════════════════

/**
 * 將 base64 Excel 上傳至 Drive，並以 Google Sheets 格式轉換。
 * 回傳轉換後的 Sheets 檔案 ID。
 */
function importExcelToDrive(base64Data, fileName) {
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName
  );
  // Drive API v2：insert 時加上 convert=true 自動轉為 Sheets
  var file = Drive.Files.insert(
    { title: fileName, mimeType: 'application/vnd.google-apps.spreadsheet' },
    blob,
    { convert: true }
  );
  return file.id;
}

// ══════════════════════════════════════════════════════════════════
//  模組二：試算表操作
// ══════════════════════════════════════════════════════════════════

/** 開啟目標試算表 */
function openTargetSpreadsheet() {
  return SpreadsheetApp.openById(ETL_TARGET_SS_ID);
}

/**
 * 取得分頁中所有資料列（含標題列）。
 * @returns {Array<Array>} 二維陣列，空表回傳 []
 */
function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return [];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

/**
 * 在試算表中取得或建立指定名稱的分頁。
 * 若分頁已存在，清除內容後重用。
 */
function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clearContents();
  } else {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * 將輸出列寫入目標分頁。
 * 每列為物件 { rowIndex, timeValue, address, lat, lng }，
 * 以 1-based rowIndex 對應目標列號。
 */
function writeOutputRows(destSheet, outputRows) {
  if (outputRows.length === 0) return;

  outputRows.forEach(function(item) {
    var r = item.rowIndex;

    if (item.timeValue !== null) {
      var timeCell = destSheet.getRange(r, SHEET_COL.TIME);
      timeCell.setValue(item.timeValue);
      // 設定日期時間格式
      timeCell.setNumberFormat('yyyy/MM/dd HH:mm:ss');
    }

    if (item.address) {
      destSheet.getRange(r, SHEET_COL.ADDRESS).setValue(item.address);
    }

    if (item.lat !== null && item.lng !== null) {
      destSheet.getRange(r, SHEET_COL.LAT).setValue(item.lat);
      destSheet.getRange(r, SHEET_COL.LNG).setValue(item.lng);
    }
  });

  SpreadsheetApp.flush();
}

// ══════════════════════════════════════════════════════════════════
//  模組三：資料轉換（列層級）
// ══════════════════════════════════════════════════════════════════

/**
 * 對來源分頁的所有資料列進行 ETL 轉換。
 * 略過標題列（第 1 列），從第 2 列開始處理。
 * @returns {Array<Object>}
 */
function transformRows(rows) {
  var output = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowIndex = i + 1; // Google Sheets 列號（1-based）

    var rawTime    = row[EXCEL_COL.TIME - 1];
    var rawAddress = row[EXCEL_COL.ADDRESS - 1];

    // 跳過完全空白的列
    if (!rawTime && !rawAddress) continue;

    var timeValue   = convertExcelDateTime(rawTime);
    var fullAddress = completeAddress(String(rawAddress || '').trim());
    var coords      = fullAddress ? geocodeAddress(fullAddress) : { lat: null, lng: null };

    output.push({
      rowIndex:  rowIndex,
      timeValue: timeValue,
      address:   fullAddress,
      lat:       coords.lat,
      lng:       coords.lng
    });
  }

  return output;
}

// ══════════════════════════════════════════════════════════════════
//  模組四：地址補齊
// ══════════════════════════════════════════════════════════════════

/**
 * 將部分地址補齊為含「臺北市XXX區」的完整格式。
 * 優先使用 Maps geocoder 取得格式化地址；
 * 若 geocoder 失敗，僅加上「臺北市」前綴。
 * @param {string} partial  例："西寧南路36號"
 * @returns {string} 例："臺北市萬華區西寧南路36號"
 */
function completeAddress(partial) {
  if (!partial) return '';

  // 若已含臺北市，直接回傳
  if (partial.indexOf(TAIPEI_PREFIX) === 0) return partial;

  // 先嘗試以「臺北市 + 部分地址」進行地理編碼
  var query = TAIPEI_PREFIX + partial;
  try {
    var result = Maps.newGeocoder()
      .setLanguage('zh-TW')
      .setRegion('tw')
      .geocode(query);

    if (result.status === 'OK' && result.results.length > 0) {
      var formatted = result.results[0].formatted_address;
      // 確認格式化結果確實含臺北市
      if (formatted && formatted.indexOf(TAIPEI_PREFIX) !== -1) {
        return extractTaipeiAddress(formatted);
      }
    }
  } catch (e) {
    Logger.log('completeAddress geocode error: ' + e);
  }

  // Fallback：直接補上臺北市前綴
  return query;
}

/**
 * 從 Google Maps 格式化地址中擷取「臺北市…」之後的部分。
 * 格式化地址通常形如 "106, 大安區仁愛路四段1號, 臺北市, 台灣"
 * 或 "臺北市大安區仁愛路四段1號"
 */
function extractTaipeiAddress(formatted) {
  var idx = formatted.indexOf(TAIPEI_PREFIX);
  if (idx === -1) return formatted;

  // 取出「臺北市」之後的地址，移除尾端的國家/郵遞區號等片段
  var addr = formatted.substring(idx);
  // 去除末尾逗號分隔的「台灣」或郵遞區號
  addr = addr.split(',')[0].trim();
  return addr;
}

// ══════════════════════════════════════════════════════════════════
//  模組五：時間格式轉換
// ══════════════════════════════════════════════════════════════════

/**
 * 將 Excel 的日期/時間值轉換為 JavaScript Date。
 * 支援三種情況：
 *   1. 數字（Excel 日期序號）
 *   2. Date 物件（Apps Script 自動解析）
 *   3. 字串（嘗試多種格式解析）
 * @returns {Date|null}
 */
function convertExcelDateTime(value) {
  if (!value && value !== 0) return null;

  // Apps Script 有時已自動轉為 Date
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  // Excel 日期序號（數字）：1900-01-01 = 1
  if (typeof value === 'number') {
    return excelSerialToDate(value);
  }

  // 字串：嘗試直接解析
  if (typeof value === 'string') {
    var str = value.trim();
    if (!str) return null;

    // 常見台灣格式：2024/01/15 08:30:00
    var d = new Date(str.replace(/\//g, '-'));
    if (!isNaN(d.getTime())) return d;

    // ISO 格式
    d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * 將 Excel 日期序號轉為 Date（基準：1899-12-30，修正 Excel 的 1900 閏年 bug）。
 */
function excelSerialToDate(serial) {
  var BASE_MS = new Date(1899, 11, 30).getTime(); // 1899-12-30
  var MS_PER_DAY = 86400000;
  return new Date(BASE_MS + Math.round(serial * MS_PER_DAY));
}

// ══════════════════════════════════════════════════════════════════
//  模組六：地理編碼
// ══════════════════════════════════════════════════════════════════

/**
 * 將完整地址轉換為經緯度座標。
 * @param {string} address  完整地址，例："臺北市萬華區西寧南路36號"
 * @returns {{ lat: number|null, lng: number|null }}
 */
function geocodeAddress(address) {
  if (!address) return { lat: null, lng: null };

  try {
    var result = Maps.newGeocoder()
      .setLanguage('zh-TW')
      .setRegion('tw')
      .geocode(address);

    if (result.status === 'OK' && result.results.length > 0) {
      var loc = result.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (e) {
    Logger.log('geocodeAddress error [' + address + ']: ' + e);
  }

  return { lat: null, lng: null };
}
