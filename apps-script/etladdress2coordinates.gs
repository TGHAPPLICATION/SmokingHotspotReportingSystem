// ══════════════════════════════════════════════════════════════════
//  etladdress2coordinates.gs
//  上傳 Excel → 補齊地址 → 地理編碼 → 寫入目標試算表
//
//  採兩階段設計避免 Apps Script 6 分鐘執行上限：
//    階段一 processExcelUpload()  — 匯入、補齊地址、轉換時間（快速）
//    階段二 geocodeNextBatch()    — 分批地理編碼，前端輪詢直到完成
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
var GEOCODE_BATCH_SIZE = 30;  // 每批次 geocoding 筆數（約 30 秒內完成）

// ══════════════════════════════════════════════════════════════════
//  階段一：匯入並寫入地址 / 時間（不進行 geocoding）
// ══════════════════════════════════════════════════════════════════

/**
 * 接收前端 base64 Excel，匯入資料、補齊地址、轉換時間。
 * Geocoding 留給階段二分批進行。
 * @returns {{ sheets: string[], totalRows: Object }} 分頁名稱與各分頁資料列數
 */
function processExcelUpload(base64Data, fileName) {
  var tempFileId;
  try {
    var sheetFileId = importExcelToDrive(base64Data, fileName);
    tempFileId = sheetFileId;

    var sourceSS  = SpreadsheetApp.openById(sheetFileId);
    var targetSS  = openTargetSpreadsheet();
    var sheetMeta = [];  // [{ name, dataRows }]

    sourceSS.getSheets().forEach(function(srcSheet) {
      var sheetName = srcSheet.getName();
      var rows = getSheetData(srcSheet);
      if (rows.length <= 1) return;  // 只有標題或空白，略過

      var destSheet = getOrCreateSheet(targetSS, sheetName);
      var dataRows  = importAddressAndTime(rows, destSheet);
      sheetMeta.push({ name: sheetName, dataRows: dataRows });
    });

    return { sheets: sheetMeta };
  } catch (err) {
    Logger.log('processExcelUpload error: ' + err);
    throw new Error('匯入失敗：' + err.message);
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); } catch (_) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  階段二：分批 Geocoding（前端輪詢）
// ══════════════════════════════════════════════════════════════════

/**
 * 對目標分頁 G 欄的地址進行一批次 geocoding，結果寫入 D、E 欄。
 * 前端應持續呼叫直到 done === true。
 *
 * @param {string} sheetName  目標分頁名稱
 * @param {number} startRow   從哪一列開始（1-based，資料從第 2 列起）
 * @returns {{ done: boolean, nextRow: number, processed: number, total: number }}
 */
function geocodeNextBatch(sheetName, startRow) {
  var ss    = openTargetSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('找不到分頁：' + sheetName);

  var lastRow = sheet.getLastRow();
  // 資料從第 2 列開始（第 1 列為標題）
  var dataStart = Math.max(startRow, 2);
  var total     = lastRow - 1;  // 資料列總數（不含標題）

  if (dataStart > lastRow) {
    return { done: true, nextRow: dataStart, processed: 0, total: total };
  }

  var endRow    = Math.min(dataStart + GEOCODE_BATCH_SIZE - 1, lastRow);
  var batchLen  = endRow - dataStart + 1;

  // 批次讀取 G 欄地址
  var addresses = sheet
    .getRange(dataStart, SHEET_COL.ADDRESS, batchLen, 1)
    .getValues();

  // 批次 geocoding 並寫入 D、E 欄
  for (var i = 0; i < batchLen; i++) {
    var addr   = String(addresses[i][0] || '').trim();
    var coords = geocodeAddress(addr);
    var row    = dataStart + i;
    if (coords.lat !== null) {
      sheet.getRange(row, SHEET_COL.LAT).setValue(coords.lat);
      sheet.getRange(row, SHEET_COL.LNG).setValue(coords.lng);
    }
  }

  SpreadsheetApp.flush();

  var nextRow = endRow + 1;
  return {
    done:      nextRow > lastRow,
    nextRow:   nextRow,
    processed: batchLen,
    total:     total
  };
}

// ══════════════════════════════════════════════════════════════════
//  模組一：Drive 檔案處理
// ══════════════════════════════════════════════════════════════════

/**
 * 將 base64 Excel 上傳至 Drive 並轉換為 Google Sheets 格式。
 * 回傳轉換後的 Sheets 檔案 ID。
 */
function importExcelToDrive(base64Data, fileName) {
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName
  );
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

function openTargetSpreadsheet() {
  return SpreadsheetApp.openById(ETL_TARGET_SS_ID);
}

function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return [];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

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
 * 階段一寫入：補齊地址→G欄，轉換時間→B欄。
 * 使用批次寫入（setValues）提高效能。
 * @returns {number} 寫入的資料列數
 */
function importAddressAndTime(rows, destSheet) {
  var dataRows = rows.length - 1;  // 扣除標題列
  if (dataRows <= 0) return 0;

  // 預先建立 B 欄和 G 欄的批次陣列
  var timeValues    = [];
  var addressValues = [];

  for (var i = 1; i <= dataRows; i++) {
    var row        = rows[i];
    var rawTime    = row[EXCEL_COL.TIME - 1];
    var rawAddress = String(row[EXCEL_COL.ADDRESS - 1] || '').trim();

    timeValues.push([convertExcelDateTime(rawTime)]);
    addressValues.push([completeAddress(rawAddress)]);
  }

  // 批次寫入 B 欄（時間）
  var timeRange = destSheet.getRange(2, SHEET_COL.TIME, dataRows, 1);
  timeRange.setValues(timeValues);
  timeRange.setNumberFormat('yyyy/MM/dd HH:mm:ss');

  // 批次寫入 G 欄（補齊地址）
  destSheet.getRange(2, SHEET_COL.ADDRESS, dataRows, 1).setValues(addressValues);

  SpreadsheetApp.flush();
  return dataRows;
}

// ══════════════════════════════════════════════════════════════════
//  模組三：地址補齊
// ══════════════════════════════════════════════════════════════════

/**
 * 將部分地址補齊為含「臺北市XXX區」的完整格式。
 * 使用 Maps geocoder 取得格式化地址；失敗時僅補上「臺北市」前綴。
 * @param {string} partial  例："西寧南路36號"
 * @returns {string} 例："臺北市萬華區西寧南路36號"
 */
function completeAddress(partial) {
  if (!partial) return '';
  if (partial.indexOf(TAIPEI_PREFIX) === 0) return partial;

  var query = TAIPEI_PREFIX + partial;
  try {
    var result = Maps.newGeocoder()
      .setLanguage('zh-TW')
      .setRegion('tw')
      .geocode(query);

    if (result.status === 'OK' && result.results.length > 0) {
      var formatted = result.results[0].formatted_address;
      if (formatted && formatted.indexOf(TAIPEI_PREFIX) !== -1) {
        return extractTaipeiAddress(formatted);
      }
    }
  } catch (e) {
    Logger.log('completeAddress error: ' + e);
  }

  return query;  // Fallback
}

function extractTaipeiAddress(formatted) {
  var idx = formatted.indexOf(TAIPEI_PREFIX);
  if (idx === -1) return formatted;
  return formatted.substring(idx).split(',')[0].trim();
}

// ══════════════════════════════════════════════════════════════════
//  模組四：時間格式轉換
// ══════════════════════════════════════════════════════════════════

/**
 * 將 Excel 日期/時間值轉換為 JavaScript Date。
 * 支援：數字序號、Date 物件、字串。
 * @returns {Date|null}
 */
function convertExcelDateTime(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') return excelSerialToDate(value);

  if (typeof value === 'string') {
    var str = value.trim();
    if (!str) return null;
    var d = new Date(str.replace(/\//g, '-'));
    if (!isNaN(d.getTime())) return d;
    d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/** Excel 日期序號 → Date（修正 1900 閏年 bug）*/
function excelSerialToDate(serial) {
  var BASE_MS = new Date(1899, 11, 30).getTime();
  return new Date(BASE_MS + Math.round(serial * 86400000));
}

// ══════════════════════════════════════════════════════════════════
//  模組五：地理編碼
// ══════════════════════════════════════════════════════════════════

/**
 * 將完整地址轉換為經緯度座標。
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
