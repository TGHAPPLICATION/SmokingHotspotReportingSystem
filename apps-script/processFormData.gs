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

// ── Google Maps 地址地理編碼（後端呼叫，不需 API Key）────────
function geocodeAddressServer(addr) {
  try {
    var geocoder = Maps.newGeocoder()
      .setLanguage('zh-TW')
      .setRegion('tw');
    var result = geocoder.geocode(addr);
    if (result.status === 'OK' && result.results.length > 0) {
      var loc = result.results[0].geometry.location;
      return { success: true, lat: loc.lat, lng: loc.lng,
               formatted: result.results[0].formatted_address };
    }
    return { success: false, error: 'NOT_FOUND' };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
