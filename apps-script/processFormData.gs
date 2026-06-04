// ── HTML Service 表單資料橋接函式 ────────────────────────────
// 供 Form.html 中的 google.script.run.processFormData() 呼叫

function processFormData(data) {
  try {
    validateReport(data);
    var result = saveReport(data);
    return { success: true, id: result.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
