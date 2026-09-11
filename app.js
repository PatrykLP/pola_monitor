/* ============================================================
   Child Monitor — logika aplikacji
   Dawki wg zalecenia lekarza. Zmieniaj TYLKO po konsultacji.
   ============================================================ */

const CONFIG = {
  IBU: { ml: 2.5, mg: 100, minGapH: 6, maxPerDay: 3 },
  PARA: { ml: 1.8, mg: 180, minGapH: 4 },
  PARA_CHECK_AFTER_H: 3,   // po ilu h od ibuprofenu sprawdzić gorączkę
  FEVER_THRESHOLD: 38,
  TEMP_REMINDER_H: 1       // przypomnienie o pomiarze co X godzin
};

const STORAGE_PREFIX = 'childMonitor:';
const OLD_STORAGE_PREFIX = 'monitorPoli:';
let todayKey = dayKey(new Date());
let entries = [];
let reminderTimer = null;

/* ---------- pomocnicze ---------- */
function dayKey(d){
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}
function fmtTime(iso){
  return new Date(iso).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'});
}
function fmtDate(key){
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('pl-PL', {weekday:'short', day:'numeric', month:'short'});
}
function hoursSince(iso){
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}
function hourOfDay(iso){
  const d = new Date(iso);
  return d.getHours() + d.getMinutes()/60;
}
function makeISO(dateStr, hhmm){
  const [y,m,d] = dateStr.split('-').map(Number);
  const [h,min] = hhmm.split(':').map(Number);
  return new Date(y, m-1, d, h, min, 0, 0).toISOString();
}

/* ---------- zapis / odczyt ---------- */
// jednorazowe przeniesienie danych po zmianie nazwy aplikacji
function migrateStorage(){
  try{
    const stale = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(OLD_STORAGE_PREFIX)) stale.push(k);
    }
    stale.forEach(k => {
      const target = STORAGE_PREFIX + k.slice(OLD_STORAGE_PREFIX.length);
      if(localStorage.getItem(target) === null) localStorage.setItem(target, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
  }catch(e){ console.warn('Migracja nieudana', e); }
}
function loadDay(key = todayKey){
  try{
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn('Odczyt nieudany', e);
    return [];
  }
}
function saveDay(){
  try{
    localStorage.setItem(STORAGE_PREFIX + todayKey, JSON.stringify(entries));
  }catch(e){
    alert('Nie udało się zapisać danych. Sprawdź, czy przeglądarka nie blokuje pamięci lokalnej.');
  }
}
function allDayKeys(){
  const keys = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(STORAGE_PREFIX)) keys.push(k.slice(STORAGE_PREFIX.length));
  }
  return keys.sort().reverse();
}

/* ---------- wpisy ---------- */
function addEntry(entry){
  const key = dayKey(new Date(entry.time));
  if(key === todayKey){
    entries.push(entry);
    saveDay();
  } else {
    // wpis z innego dnia — dopisz do właściwego dnia
    const other = loadDay(key);
    other.push(entry);
    try{
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(other));
    }catch(e){ console.warn(e); }
  }
  render();
}

function deleteEntry(iso, type){
  const i = entries.findIndex(e => e.time === iso && e.type === type);
  if(i === -1) return;
  if(!confirm('Usunąć ten wpis?')) return;
  entries.splice(i, 1);
  saveDay();
  render();
}

function logTemp(value, iso){
  addEntry({ type:'temp', value, time: iso || new Date().toISOString() });
}
function fmtGap(hours){
  // zaokrąglamy do pełnych minut, inaczej 3,999h daje „3h 60min”
  const total = Math.round(hours * 60);
  return Math.floor(total / 60) + 'h ' + (total % 60) + 'min';
}

function logDose(kind, iso){
  const cfg = kind === 'ibu' ? CONFIG.IBU : CONFIG.PARA;
  const label = kind === 'ibu' ? 'ibuprofenu' : 'paracetamolu';

  if(iso){
    // wpis wstecz: porównaj z dawkami już zapisanymi w tym dniu (przed i po podanej godzinie)
    const same = loadDay(dayKey(new Date(iso))).filter(e => e.type === kind);
    const warn = [];
    if(cfg.maxPerDay && same.length >= cfg.maxPerDay){
      warn.push(`W tym dniu jest już ${cfg.maxPerDay} dawki ${label}.`);
    }
    const nearest = same
      .map(e => Math.abs(new Date(iso) - new Date(e.time)) / 3600000)
      .sort((a,b) => a - b)[0];
    if(nearest !== undefined && nearest < cfg.minGapH){
      warn.push(`Obok jest dawka ${label} w odstępie ${fmtGap(nearest)} — mniej niż zalecane ${cfg.minGapH}h.`);
    }
    if(warn.length && !confirm(warn.join('\n\n') + '\n\nZapisać mimo to?')) return;
  } else {
    const last = getLast(kind);
    if(last){
      const gap = hoursSince(last.time);
      if(gap < cfg.minGapH){
        if(!confirm(`Od ostatniej dawki ${label} minęło mniej niż ${cfg.minGapH}h (zostało ok. ${fmtGap(cfg.minGapH - gap)}). Na pewno podać teraz?`)) return;
      }
    }
  }
  addEntry({ type: kind, ml: cfg.ml, mg: cfg.mg, time: iso || new Date().toISOString() });
}

function getLast(type){
  const f = entries.filter(e => e.type === type).sort((a,b)=> new Date(a.time)-new Date(b.time));
  return f.length ? f[f.length-1] : null;
}

function resetDay(){
  if(!confirm('Wyczyścić wszystkie dzisiejsze wpisy?')) return;
  entries = [];
  saveDay();
  render();
}

/* ---------- modale ---------- */
function openTempModal(){
  document.getElementById('tempOverlay').classList.add('show');
  const input = document.getElementById('tempInput');
  input.value = '';
  setTimeout(()=> input.focus(), 50);
}
function closeTempModal(){
  document.getElementById('tempOverlay').classList.remove('show');
}
function confirmTemp(){
  const v = parseFloat(document.getElementById('tempInput').value.replace(',', '.'));
  closeTempModal();
  if(isNaN(v) || v < 30 || v > 45){
    if(!isNaN(v)) alert('Ta wartość wygląda na błędną. Wpisz temperaturę między 30 a 45°C.');
    return;
  }
  logTemp(v);
}

function openManualModal(){
  document.getElementById('manualOverlay').classList.add('show');
  const now = new Date();
  document.getElementById('manualDate').value = dayKey(now);
  document.getElementById('manualTime').value =
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  document.getElementById('manualTempValue').value = '';
  document.getElementById('manualType').value = 'temp';
  toggleManualValue();
}
function closeManualModal(){
  document.getElementById('manualOverlay').classList.remove('show');
}
function toggleManualValue(){
  const t = document.getElementById('manualType').value;
  document.getElementById('manualValueWrap').style.display = (t === 'temp') ? 'block' : 'none';
}
function confirmManual(){
  const type = document.getElementById('manualType').value;
  const date = document.getElementById('manualDate').value;
  const time = document.getElementById('manualTime').value;
  if(!date || !time){ closeManualModal(); return; }
  const iso = makeISO(date, time);

  if(type === 'temp'){
    const v = parseFloat(document.getElementById('manualTempValue').value.replace(',', '.'));
    if(isNaN(v) || v < 30 || v > 45){
      alert('Wpisz poprawną temperaturę (30–45°C).');
      return;
    }
    closeManualModal();
    logTemp(v, iso);
  } else {
    closeManualModal();
    logDose(type, iso);
  }
}

/* ---------- eksport / import ---------- */
function exportData(){
  const all = {};
  allDayKeys().forEach(k => { all[k] = loadDay(k); });
  const blob = new Blob([JSON.stringify({ app:'child-monitor', version:1, days: all }, null, 2)],
    { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'child-monitor-' + todayKey + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(evt){
  const file = evt.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      const days = parsed.days || (parsed.entries ? { [parsed.date || todayKey]: parsed.entries } : null);
      if(!days) throw new Error('zły format');
      if(!confirm('Wczytać dane z pliku? Wpisy z tych samych dni zostaną nadpisane.')) return;
      Object.keys(days).forEach(k => {
        localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(days[k]));
      });
      entries = loadDay(todayKey);
      render();
    }catch(e){
      alert('Nie udało się wczytać pliku — sprawdź, czy to poprawny eksport z tej aplikacji.');
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}

/* ---------- powiadomienia ---------- */
function notificationsGranted(){
  return ('Notification' in window) && Notification.permission === 'granted';
}

async function enableNotifications(){
  if(!('Notification' in window)){
    alert('Ta przeglądarka nie obsługuje powiadomień. Na iPhone dodaj aplikację do ekranu głównego — wtedy zadziałają.');
    return;
  }
  const perm = await Notification.requestPermission();
  if(perm === 'granted'){
    scheduleReminder();
    new Notification('Przypomnienia włączone', {
      body: `Będziemy przypominać co ${CONFIG.TEMP_REMINDER_H}h o pomiarze temperatury.`,
      icon: 'icons/icon-192.png'
    });
  }
  render();
}

function notifyTempCheck(){
  if(!notificationsGranted()) return;
  const body = 'Minęła godzina od ostatniego pomiaru.';
  if(navigator.serviceWorker && navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('Zmierz temperaturę', {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'temp-reminder',
        renotify: true
      });
    }).catch(()=> new Notification('Zmierz temperaturę', { body }));
  } else {
    new Notification('Zmierz temperaturę', { body });
  }
}

function scheduleReminder(){
  if(reminderTimer) clearTimeout(reminderTimer);
  if(!notificationsGranted()) return;

  const last = getLast('temp');
  const dueInMs = last
    ? Math.max(0, (CONFIG.TEMP_REMINDER_H * 3600000) - (Date.now() - new Date(last.time).getTime()))
    : CONFIG.TEMP_REMINDER_H * 3600000;

  reminderTimer = setTimeout(() => {
    notifyTempCheck();
    scheduleReminder();
  }, dueInMs || CONFIG.TEMP_REMINDER_H * 3600000);
}

/* ---------- wykres ---------- */
const CHART_W = 340, CHART_H = 175;
const PAD_L = 34, PAD_R = 10, PAD_T = 12;
const TEMP_BOTTOM = 95;
const IBU_LANE_Y = 118;
const PARA_LANE_Y = 142;
const AXIS_Y = 166;
const HOURS = [0,3,6,9,12,15,18,21,24];

function xScale(h){
  return PAD_L + (h/24) * (CHART_W - PAD_L - PAD_R);
}

function renderChart(){
  const temps = entries.filter(e=>e.type==='temp').sort((a,b)=> new Date(a.time)-new Date(b.time));
  const ibu   = entries.filter(e=>e.type==='ibu').sort((a,b)=> new Date(a.time)-new Date(b.time));
  const para  = entries.filter(e=>e.type==='para').sort((a,b)=> new Date(a.time)-new Date(b.time));

  // domyślne okno 35,5–40,5°C, rozszerzane o wartości skrajne, żeby nic nie wyjechało poza wykres
  const vals = temps.map(e => e.value);
  const yMin = Math.min(35.5, ...vals.map(v => v - 0.5));
  const yMax = Math.max(40.5, ...vals.map(v => v + 0.5));
  const yScale = v => PAD_T + (1 - (v-yMin)/(yMax-yMin)) * (TEMP_BOTTOM-PAD_T);

  let svg = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="Wykres temperatury i dawek leków">`;

  HOURS.forEach(h=>{
    const x = xScale(h);
    svg += `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${AXIS_Y-8}" stroke="#e6e0d4" stroke-width="1" opacity="0.7"/>`;
    svg += `<text x="${x}" y="${AXIS_Y}" font-size="8" fill="#8a8275" text-anchor="middle">${h}</text>`;
  });

  svg += `<line x1="${PAD_L}" y1="${IBU_LANE_Y}" x2="${CHART_W-PAD_R}" y2="${IBU_LANE_Y}" stroke="#f0e6dc" stroke-width="1"/>`;
  svg += `<line x1="${PAD_L}" y1="${PARA_LANE_Y}" x2="${CHART_W-PAD_R}" y2="${PARA_LANE_Y}" stroke="#f0e6dc" stroke-width="1"/>`;
  svg += `<text x="3" y="${IBU_LANE_Y+3}" font-size="7.5" fill="#a85f3d">IBU</text>`;
  svg += `<text x="3" y="${PARA_LANE_Y+3}" font-size="7.5" fill="#6a5c9e">PARA</text>`;

  const y38 = yScale(CONFIG.FEVER_THRESHOLD);
  svg += `<line x1="${PAD_L}" y1="${y38}" x2="${CHART_W-PAD_R}" y2="${y38}" stroke="#c77b56" stroke-width="1" stroke-dasharray="4 3"/>`;
  svg += `<text x="${PAD_L-4}" y="${y38+3}" font-size="7.5" fill="#a85f3d" text-anchor="end">38°</text>`;

  if(temps.length){
    const path = temps.map((p,i)=>{
      const x = xScale(hourOfDay(p.time)), y = yScale(p.value);
      return (i===0?'M':'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    svg += `<path d="${path}" fill="none" stroke="#6f8b6a" stroke-width="2"/>`;
    temps.forEach(p=>{
      const x = xScale(hourOfDay(p.time)), y = yScale(p.value);
      const c = p.value >= CONFIG.FEVER_THRESHOLD ? '#c77b56' : '#4f6b4c';
      svg += `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`;
      svg += `<text x="${x}" y="${y-6}" font-size="7.5" fill="${c}" text-anchor="middle">${p.value.toFixed(1)}</text>`;
    });
  }

  ibu.forEach(p=>{
    const x = xScale(hourOfDay(p.time));
    svg += `<line x1="${x}" y1="${TEMP_BOTTOM}" x2="${x}" y2="${IBU_LANE_Y}" stroke="#c77b56" stroke-width="1" stroke-dasharray="2 2" opacity="0.45"/>`;
    svg += `<circle cx="${x}" cy="${IBU_LANE_Y}" r="4" fill="#c77b56"/>`;
    svg += `<text x="${x}" y="${IBU_LANE_Y-7}" font-size="7" fill="#a85f3d" text-anchor="middle">${fmtTime(p.time)}</text>`;
  });

  para.forEach(p=>{
    const x = xScale(hourOfDay(p.time));
    svg += `<line x1="${x}" y1="${TEMP_BOTTOM}" x2="${x}" y2="${PARA_LANE_Y}" stroke="#6a5c9e" stroke-width="1" stroke-dasharray="2 2" opacity="0.35"/>`;
    svg += `<circle cx="${x}" cy="${PARA_LANE_Y}" r="4" fill="#6a5c9e"/>`;
    svg += `<text x="${x}" y="${PARA_LANE_Y+13}" font-size="7" fill="#6a5c9e" text-anchor="middle">${fmtTime(p.time)}</text>`;
  });

  svg += '</svg>';
  const has = temps.length || ibu.length || para.length;
  document.getElementById('chartAll').innerHTML = has ? svg : '<div class="empty">Brak wpisów.</div>';
}

/* ---------- render ---------- */
function render(){
  document.getElementById('dateLine').textContent =
    new Date().toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'});

  const lastTemp = getLast('temp');
  const lastIbu  = getLast('ibu');
  const lastPara = getLast('para');

  document.getElementById('lastTemp').textContent = lastTemp
    ? lastTemp.value.toFixed(1) + '°C · ' + fmtTime(lastTemp.time) : '—';
  document.getElementById('lastIbu').textContent  = lastIbu ? fmtTime(lastIbu.time) : '—';
  document.getElementById('lastPara').textContent = lastPara ? fmtTime(lastPara.time) : '—';

  const ibuCount = entries.filter(e=>e.type==='ibu').length;
  const paraCount = entries.filter(e=>e.type==='para').length;

  document.getElementById('totalIbuCount').textContent = ibuCount;
  document.getElementById('totalIbuAmount').textContent =
    (ibuCount*CONFIG.IBU.ml).toFixed(1) + ' ml / ' + (ibuCount*CONFIG.IBU.mg) + ' mg';
  document.getElementById('totalParaCount').textContent = paraCount;
  document.getElementById('totalParaAmount').textContent =
    (paraCount*CONFIG.PARA.ml).toFixed(1) + ' ml / ' + (paraCount*CONFIG.PARA.mg) + ' mg';

  const nextIbuEl = document.getElementById('nextIbu');
  const btnIbu = document.getElementById('btnIbu');
  if(ibuCount >= CONFIG.IBU.maxPerDay){
    nextIbuEl.textContent = 'osiągnięto ' + CONFIG.IBU.maxPerDay + ' dawki dziś';
    nextIbuEl.className = 'val waiting';
    btnIbu.disabled = true;
  } else {
    btnIbu.disabled = false;
    if(lastIbu){
      const gap = hoursSince(lastIbu.time);
      if(gap >= CONFIG.IBU.minGapH){
        nextIbuEl.textContent = 'można podać teraz';
        nextIbuEl.className = 'val eligible';
      } else {
        const eta = new Date(new Date(lastIbu.time).getTime() + CONFIG.IBU.minGapH*3600000);
        nextIbuEl.textContent = 'od ' + eta.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
        nextIbuEl.className = 'val waiting';
      }
    } else {
      nextIbuEl.textContent = 'można podać teraz';
      nextIbuEl.className = 'val eligible';
    }
  }

  document.getElementById('bannerTemp')
    .classList.toggle('show', !lastTemp || hoursSince(lastTemp.time) >= CONFIG.TEMP_REMINDER_H);

  let showPara = false;
  if(lastIbu && hoursSince(lastIbu.time) >= CONFIG.PARA_CHECK_AFTER_H){
    if(!lastPara || new Date(lastPara.time) < new Date(lastIbu.time)){
      if(!lastTemp || lastTemp.value >= CONFIG.FEVER_THRESHOLD || new Date(lastTemp.time) < new Date(lastIbu.time)){
        showPara = true;
      }
    }
  }
  document.getElementById('bannerParaCheck').classList.toggle('show', showPara);

  document.getElementById('bannerNotify')
    .classList.toggle('show', ('Notification' in window) && Notification.permission === 'default');

  // historia dnia
  const list = document.getElementById('logList');
  const sorted = [...entries].sort((a,b)=> new Date(b.time) - new Date(a.time));
  if(!sorted.length){
    list.innerHTML = '<li class="empty">Brak wpisów — zacznij od pomiaru temperatury.</li>';
  } else {
    list.innerHTML = sorted.map(e=>{
      let tag, cls, desc;
      if(e.type === 'temp'){ tag='TEMP'; cls='tag-temp'; desc = e.value.toFixed(1)+'°C'; }
      else if(e.type === 'ibu'){ tag='IBU'; cls='tag-ibu'; desc = CONFIG.IBU.ml+' ml / '+CONFIG.IBU.mg+' mg ibuprofenu'; }
      else { tag='PARA'; cls='tag-para'; desc = CONFIG.PARA.ml+' ml / '+CONFIG.PARA.mg+' mg paracetamolu'; }
      return `<li>
        <span><span class="tag ${cls}">${tag}</span>${desc}</span>
        <span><span class="time">${fmtTime(e.time)}</span>
        <button class="del" onclick="deleteEntry('${e.time}','${e.type}')" aria-label="Usuń wpis">×</button></span>
      </li>`;
    }).join('');
  }

  // poprzednie dni
  const daysEl = document.getElementById('historyDays');
  const others = allDayKeys().filter(k => k !== todayKey).slice(0, 7);
  if(!others.length){
    daysEl.innerHTML = '<div class="empty">Brak zapisanych dni.</div>';
  } else {
    daysEl.innerHTML = others.map(k=>{
      const d = loadDay(k);
      const temps = d.filter(e=>e.type==='temp');
      const maxT = temps.length ? Math.max(...temps.map(e=>e.value)).toFixed(1)+'°C' : '—';
      const doses = d.filter(e=>e.type!=='temp').length;
      return `<div class="day-row">
        <span>${fmtDate(k)}</span>
        <span class="day-meta">max ${maxT} · ${doses} dawek</span>
      </div>`;
    }).join('');
  }

  renderChart();
}

/* ---------- start ---------- */
function init(){
  migrateStorage();
  entries = loadDay(todayKey);
  render();
  scheduleReminder();

  // co minutę: odśwież odliczanie, obsłuż zmianę doby
  setInterval(()=>{
    const nowKey = dayKey(new Date());
    if(nowKey !== todayKey){
      todayKey = nowKey;
      entries = loadDay(todayKey);
    }
    render();
  }, 60000);

  // przeliczenie po powrocie do aplikacji
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden){
      const nowKey = dayKey(new Date());
      if(nowKey !== todayKey){
        todayKey = nowKey;
        entries = loadDay(todayKey);
      }
      render();
      scheduleReminder();
    }
  });

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW error', e));
  }
}

document.addEventListener('DOMContentLoaded', init);
