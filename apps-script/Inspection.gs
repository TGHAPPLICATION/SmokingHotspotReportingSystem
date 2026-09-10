// ============================================================
// 環保局菸蒂稽查回報 — 稽查人員專用表單後端
// ============================================================
// 與 Code.gs 的公眾匿名通報（SmokingReports 分頁）完全分開處理，
// 固定寫入「環保局菸蒂回報」分頁，欄位在原本 9 欄之後擴充，
// 對既有資料相容、不需要搬移任何資料。

var INSPECTION_SHEET_NAME = '環保局菸蒂回報';
var INSPECTION_HEADERS = [
  'id', 'timestamp', 'time_slot', 'lat', 'lng', 'location_source',
  'address_input', 'description', 'reporter_hash',
  'district', 'inspector_unit', 'inspector_name', 'photo_url'
];
var INSPECTION_PHOTO_FOLDER_NAME = '吸菸熱點通報照片';

// ── 取得或建立「環保局菸蒂回報」分頁，並確保標題列完整 ─────────
function getOrCreateInspectionSheet_(ss) {
  var sheet = ss.getSheetByName(INSPECTION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(INSPECTION_SHEET_NAME);
    sheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setValues([INSPECTION_HEADERS]);
    return sheet;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var existingHeaderRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var looksLikeHeader = String(existingHeaderRow[1] || '').toLowerCase() === 'timestamp';

  if (!looksLikeHeader) {
    // 第一列其實是舊資料（沒有標題列）：插入一列新標題，原有資料整批往下移，內容不變
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, INSPECTION_HEADERS.length).setValues([INSPECTION_HEADERS]);
  } else if (existingHeaderRow.length < INSPECTION_HEADERS.length) {
    // 已有標題列，但少了這次新增的欄位（district / inspector_unit / inspector_name / photo_url）
    var missing = INSPECTION_HEADERS.slice(existingHeaderRow.length);
    sheet.getRange(1, existingHeaderRow.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

// ── 儲存稽查回報 ─────────────────────────────────────────────
function saveInspectionReport(data) {
  validateReport(data); // 沿用 Code.gs 既有的座標/location_source 驗證
  if (!data.district) throw new Error('MISSING_DISTRICT');
  if (!data.inspectorUnit) throw new Error('MISSING_INSPECTOR_UNIT');
  if (!data.inspectorName) throw new Error('MISSING_INSPECTOR_NAME');

  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = getOrCreateInspectionSheet_(ss);

  var now = new Date();
  var id = generateUUID();
  var timeSlot = calcTimeSlot(now);
  var reporterHash = hashString(data.reporterToken || '');

  // 沿用 Code.gs 的 isDuplicateReport：前 9 欄順序與 SmokingReports 相同，可直接重用
  if (isDuplicateReport(sheet, reporterHash, timeSlot, data.lat, data.lng)) {
    throw new Error('DUPLICATE_REPORT');
  }

  sheet.appendRow([
    id,
    now.toISOString(),
    timeSlot,
    data.lat,
    data.lng,
    data.locationSource,
    data.addressInput || '',
    data.description || '',
    reporterHash,
    data.district,
    data.inspectorUnit,
    data.inspectorName,
    data.photoUrl || ''
  ]);

  return { id: id };
}

// ── 照片上傳至 Google Drive ──────────────────────────────────
function getOrCreateInspectionPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(INSPECTION_PHOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(INSPECTION_PHOTO_FOLDER_NAME);
}

// base64Data：不含 "data:image/jpeg;base64," 這段前綴，純資料本體
function uploadInspectionPhoto(base64Data, mimeType, filename) {
  try {
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, filename || ('photo_' + Date.now() + '.jpg'));
    var folder = getOrCreateInspectionPhotoFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, url: 'https://drive.google.com/uc?export=view&id=' + file.getId() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
