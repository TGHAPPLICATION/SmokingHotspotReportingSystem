#!/usr/bin/env node
/**
 * 產生 10000 筆台北市吸菸熱點測試資料
 * 用法：node scripts/generate-mock.js
 * 輸出：docs/api-mock.json
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ── 台北市各區熱點中心（真實地標座標）──
const HOTSPOTS = [
  // 信義區
  { lat: 25.0330, lng: 121.5654, weight: 8, district: '信義區', places: ['市府路','松壽路','松仁路','信義路五段','松高路'] },
  { lat: 25.0409, lng: 121.5686, weight: 7, district: '信義區', places: ['統一阪急','Neo19','ATT4FUN前','台北101附近'] },
  // 大安區
  { lat: 25.0330, lng: 121.5430, weight: 7, district: '大安區', places: ['忠孝東路四段','仁愛路四段','敦化南路','建國南路'] },
  { lat: 25.0270, lng: 121.5395, weight: 5, district: '大安區', places: ['師大路','和平東路','羅斯福路三段','新生南路'] },
  // 中山區
  { lat: 25.0478, lng: 121.5198, weight: 9, district: '中山區', places: ['南京東路二段','林森北路','中山北路二段','長安東路'] },
  { lat: 25.0589, lng: 121.5240, weight: 6, district: '中山區', places: ['民族東路','民權東路','新生北路','松江路'] },
  // 中正區
  { lat: 25.0455, lng: 121.5395, weight: 8, district: '中正區', places: ['忠孝東路一段','忠孝西路','博愛路','館前路','重慶南路'] },
  { lat: 25.0430, lng: 121.5150, weight: 5, district: '中正區', places: ['中華路','西門町','漢中街','成都路'] },
  // 萬華區
  { lat: 25.0380, lng: 121.5005, weight: 6, district: '萬華區', places: ['西園路','艋舺大道','康定路','長沙街','貴陽街'] },
  // 大同區
  { lat: 25.0640, lng: 121.5130, weight: 5, district: '大同區', places: ['重慶北路','延平北路','民生西路','南京西路'] },
  // 松山區
  { lat: 25.0500, lng: 121.5770, weight: 6, district: '松山區', places: ['南京東路五段','敦化北路','八德路四段','饒河街'] },
  { lat: 25.0440, lng: 121.5580, weight: 5, district: '松山區', places: ['忠孝東路五段','光復北路','市民大道四段'] },
  // 內湖區
  { lat: 25.0630, lng: 121.5890, weight: 4, district: '內湖區', places: ['內湖路','文德路','成功路','康寧路'] },
  // 南港區
  { lat: 25.0550, lng: 121.6050, weight: 3, district: '南港區', places: ['南港路','研究院路','中研路','忠孝東路七段'] },
  // 文山區
  { lat: 24.9900, lng: 121.5710, weight: 4, district: '文山區', places: ['羅斯福路六段','木柵路','興隆路','景美街'] },
  // 北投區
  { lat: 25.1320, lng: 121.4990, weight: 3, district: '北投區', places: ['中和街','大業路','光明路','中央北路'] },
  // 士林區
  { lat: 25.0930, lng: 121.5240, weight: 5, district: '士林區', places: ['中山北路五段','文林路','天母東路','士林夜市'] },
  // 北投、天母
  { lat: 25.1050, lng: 121.5170, weight: 3, district: '士林區', places: ['承德路','基河路','劍潭路'] },
];

// 時段權重（通勤/午餐/下班/夜晚偏高）
const TIME_SLOT_WEIGHTS = [
  1, 0.5, 0.5, 1,   // 00–08 低
  4, 5,   3,   6,   // 08–16 通勤、午餐高
  5, 8,   6,   4    // 16–24 下班、夜間高
];

const DESCRIPTIONS = [
  '騎樓下', '公車站牌旁', '捷運出口', '地下街出口', '停車場入口',
  '便利商店旁', '夜市附近', '公園旁', '百貨入口', '餐廳外',
  '廁所附近', '早市旁', '學校附近', '醫院旁', '辦公大樓前',
  '巷子口', '市場旁', '銀行外', '加油站旁', '電梯口',
  '', '', '', '', ''  // 部分沒有描述
];

// 加權隨機取樣
function weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// 高斯隨機（Box-Muller）
function gaussian(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 隨機日期（最近 180 天）
function randomTimestamp(timeSlot) {
  const now = new Date('2026-06-05T12:00:00+08:00');
  const daysAgo = Math.floor(Math.random() * 180);
  const d = new Date(now - daysAgo * 86400000);
  const hour = timeSlot * 2 + Math.floor(Math.random() * 2);
  const min  = Math.floor(Math.random() * 60);
  const sec  = Math.floor(Math.random() * 60);
  d.setHours(hour, min, sec, 0);
  return d.toISOString().replace('Z', '+08:00');
}

// ── 產生 features ──
const N = 10000;
const features = [];
const hotspotWeights = HOTSPOTS.map(h => h.weight);

for (let i = 0; i < N; i++) {
  const hi = weightedRandom(hotspotWeights);
  const spot = HOTSPOTS[hi];

  // 以熱點為中心的高斯散布（std ~0.005° ≈ 500m）
  const lat = gaussian(spot.lat, 0.005);
  const lng = gaussian(spot.lng, 0.005);

  const timeSlot = weightedRandom(TIME_SLOT_WEIGHTS);
  const place = spot.places[Math.floor(Math.random() * spot.places.length)];
  const desc  = DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)];

  features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [
        Math.round(lng * 10000) / 10000,
        Math.round(lat * 10000) / 10000
      ]
    },
    properties: {
      id:            randomUUID(),
      timestamp:     randomTimestamp(timeSlot),
      time_slot:     timeSlot,
      address_input: `台北市${spot.district}${place}`,
      description:   desc
    }
  });
}

const geojson = { type: 'FeatureCollection', features };
const outPath = path.join(__dirname, '../docs/api-mock.json');
fs.writeFileSync(outPath, JSON.stringify(geojson));

console.log(`✅ 產生 ${N} 筆資料 → ${outPath}`);
console.log(`   檔案大小：${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);

// 統計摘要
const slotLabels = ['00–02','02–04','04–06','06–08','08–10','10–12','12–14','14–16','16–18','18–20','20–22','22–24'];
const counts = new Array(12).fill(0);
features.forEach(f => counts[f.properties.time_slot]++);
console.log('\n時段分布：');
counts.forEach((c, i) => {
  const bar = '█'.repeat(Math.round(c / 50));
  console.log(`  ${slotLabels[i]}  ${String(c).padStart(5)}  ${bar}`);
});
