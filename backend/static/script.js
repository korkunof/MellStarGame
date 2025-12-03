// static/script.js
// ===================================
// script.js — обновлён для новой логики слотов + таймера
// ===================================

const tg = window.Telegram?.WebApp || { initDataUnsafe: {}, initData: '', showAlert: (m)=>alert(m) };
try { tg.ready && tg.ready(); tg.expand && tg.expand(); } catch(e){}

const username = tg.initDataUnsafe?.user?.first_name || "Гость";
const usernameEl = document.getElementById("username");
if (usernameEl) usernameEl.textContent = username;

let user = {
  level: 2,
  freePoints: 1,
  referrals: 0,
  refPoints: 4,
  boostLevel: 1,
  payoutBonus: 0,
  balance: 9999,
  progress: 0,
  adSlots: [],
  subSlots: [], // will be filled by server
  current_slot_count: 5,
  timer_speed_multiplier: 1.0,
  payout_rate: 1.0,
  timer_running: false
};

function qs(...selectors) {
  for (const s of selectors) {
    if (!s) continue;
    if (s.startsWith('#')) {
      const el = document.getElementById(s.slice(1));
      if (el) return el;
    }
    const el2 = document.querySelector(s);
    if (el2) return el2;
  }
  return null;
}

function setCursor(el) { if (el) el.style.cursor = 'pointer'; }
function safeText(id, v){ const e = document.getElementById(id); if(e) e.textContent = v; }

// NAV
document.querySelectorAll(".nav-item").forEach(btn => {
  setCursor(btn);
  btn.onmouseover = () => btn.style.opacity = "0.85";
  btn.onmouseout = () => btn.style.opacity = "1";
  btn.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const pageEl = document.getElementById(btn.dataset.page);
    if (pageEl) pageEl.classList.add("active");

    if (btn.dataset.page === "home") {
      updateMain();
      renderHomeSlotsList();
    }
    if (btn.dataset.page === "subscriptions") renderAdSlots();
    if (btn.dataset.page === "upgrade") initUpgradePage();
    if (btn.dataset.page === "buy") initBuyPage();
  };
});

// STATS toggle
function initStatsToggle(){
  const btn = document.getElementById("statsToggleBtn");
  const fullStats = qs('.stats-grid', '#fullStats', '#statsContainer');
  const collapsedStats = document.getElementById("collapsedStats");
  if (!btn) return;
  setCursor(btn);
  btn.onclick = () => {
    const isActive = btn.classList.contains('active');
    if (isActive) {
      btn.classList.remove('active');
      btn.textContent = 'Краткая';
      if (fullStats) fullStats.style.display = 'none';
      if (collapsedStats) collapsedStats.style.display = 'block';
    } else {
      btn.classList.add('active');
      btn.textContent = 'Полная';
      if (fullStats) fullStats.style.display = 'grid';
      if (collapsedStats) collapsedStats.style.display = 'none';
    }
    updateCollapsedStats();
  };
  if (fullStats) fullStats.style.display = btn.classList.contains('active') ? 'grid' : 'none';
  if (collapsedStats) collapsedStats.style.display = btn.classList.contains('active') ? 'none' : 'block';
  updateCollapsedStats();
}
function updateCollapsedStats(){
  safeText('levelMini', user.level ?? 0);
  safeText('boostMini', user.refPoints ?? 0);
  safeText('slotsMini', `${(user.subSlots||[]).length}/${user.current_slot_count||5}`);
  safeText('speedMini', (user.timer_speed_multiplier||1).toFixed(3));
}

// MAIN update
function updateMain(){
  safeText('level', user.level ?? '--');
  safeText('freePoints', user.freePoints ?? 0);
  safeText('refPoints', user.refPoints ?? 0);
  safeText('payoutBonus', user.payoutBonus ?? 0);
  const bal = document.getElementById('balance');
  if (bal) bal.textContent = ((user.balance||0).toFixed ? user.balance.toFixed(1) : user.balance);
  const prog = document.getElementById('progressPercent');
  if (prog) prog.textContent = ((user.progress||0).toFixed(1)) + '%';
  updateTimerProgress();
}

// RENDERING HOME SLOTS (with delete button)
function renderHomeSlotsList(){
  const container = document.getElementById('adSlotsContainer');
  if (!container) return;
  container.innerHTML = '';

  // show list of current subSlots (those returned from API) in the stats area
  if (!user.subSlots || user.subSlots.length === 0){
    const empty = document.createElement('div');
    empty.className = 'slot-card empty';
    empty.style.justifyContent = 'center';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'Нет купленных слотов';
    container.appendChild(empty);
    return;
  }

  user.subSlots.forEach(s=>{
    const el = document.createElement('div');
    el.className = 'slot-card ' + (s.status||'empty');
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.padding = '10px';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${s.channel_username || 'Свободно'}</strong><div style="font-size:0.85rem;color:#b8a8e0">${s.type||''}</div>`;
    el.appendChild(left);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';

    if (s.status === 'subscribed') {
      const badge = document.createElement('div');
      badge.textContent = 'Подписано';
      badge.style.padding = '6px 10px';
      badge.style.borderRadius = '12px';
      badge.style.background = 'linear-gradient(45deg,#26a26a,#4ee07a)';
      badge.style.color = 'white';
      right.appendChild(badge);
    } else if (s.status === 'need_subscribe' || s.status === 'active') {
      const btn = document.createElement('button');
      btn.className = 'btn-neon';
      btn.textContent = 'Подписаться';
      setCursor(btn);
      btn.onclick = () => subscribeSlot(s.slot_id);
      right.appendChild(btn);
    } else {
      const info = document.createElement('div');
      info.textContent = s.status || '—';
      right.appendChild(info);
    }

    // delete button for testing (visible in stats)
    const del = document.createElement('button');
    del.textContent = 'Удалить';
    del.style.background = '#333';
    del.style.color = '#fff';
    del.style.border = 'none';
    del.style.padding = '6px 8px';
    del.style.borderRadius = '8px';
    setCursor(del);
    del.onclick = async () => {
      if (!confirm('Удалить слот из аккаунта (тест)?')) return;
      try {
        const res = await fetch('/api/delete_user_slot', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'X-Telegram-WebApp-InitData': tg.initData || ''},
          body: JSON.stringify({ user_id: tg.initDataUnsafe?.user?.id || 0, slot_id: s.slot_id })
        });
        if (res.ok) {
          tg.showAlert && tg.showAlert('Слот удалён (тест)');
          await loadSlots();
        } else {
          tg.showAlert && tg.showAlert('Ошибка удаления');
        }
      } catch (e) {
        tg.showAlert && tg.showAlert('Ошибка сети');
      }
    };
    right.appendChild(del);

    el.appendChild(right);
    container.appendChild(el);
  });
}

// UPGRADE/BUY helpers left unchanged (only minor hooks)
function initUpgradePage(){
  const container = qs('.boost-levels');
  if (!container) { console.warn('boost-levels not found'); return; }
  container.innerHTML = '';
  for (let i=1;i<=4;i++){
    const b = document.createElement('button');
    b.className = 'boost-btn' + (i <= (user.boostLevel||0) ? ' active' : '');
    b.textContent = `${i} - ${i*25}%`;
    setCursor(b);
    b.onclick = ()=>{ /* simplified for prototype */ 
      if ((user.refPoints||0) >= i){
        user.boostLevel = i;
        user.refPoints -= i;
        tg.showAlert && tg.showAlert(`Разгон Lv.${i} активирован`);
        updateMain(); initUpgradePage();
      } else {
        tg.showAlert && tg.showAlert('Недостаточно очков рефералов');
      }
    };
    container.appendChild(b);
  }

  const applyBtn = document.getElementById('applyBoost');
  if (applyBtn) {
    setCursor(applyBtn);
    applyBtn.onclick = () => {
      if ((user.freePoints||0) >= 50) {
        user.currentBoostLevel = (user.currentBoostLevel||0) + 1;
        user.freePoints -= 50;
        tg.showAlert && tg.showAlert('Буст применён!');
        updateMain();
      } else tg.showAlert && tg.showAlert('Недостаточно очков!');
    };
  }
  // other upgrade buttons...
}

// BUY
function initBuyPage(){
  const name = qs('#slotName','#adName');
  const link = qs('#slotLink','#adLink');
  const type = qs('#slotType','#adType');
  const shows = qs('#showsSelect','#adShows');
  const totalCalc = document.getElementById('totalCalc');
  const resetBtn = document.getElementById('resetBtn');
  const payBtn = document.getElementById('payBtn');

  function updateCalc(){
    if (!totalCalc) return;
    const base = 0;
    totalCalc.textContent = base;
    const calcType = document.getElementById('calcType');
    if (calcType && type) calcType.textContent = type.value || 'стандарт';
    const calcShows = document.getElementById('calcShows');
    if (calcShows && shows) calcShows.textContent = shows.value || '1000';
  }

  if (resetBtn){
    setCursor(resetBtn);
    resetBtn.onclick = () => {
      if (name) name.value = '';
      if (link) link.value = '';
      if (type) type.value = 'standard';
      if (shows) shows.value = '1000';
      updateCalc();
    };
  }

  [name,link,type,shows].forEach(e=>{ if (e && e.addEventListener) e.addEventListener('input', updateCalc); });
  updateCalc();

  if (payBtn){
    setCursor(payBtn);
    payBtn.onclick = async () => {
      const nm = name ? name.value.trim() : '';
      const ln = link ? link.value.trim() : '';
      if (!nm || !ln) { alert('Заполните название и ссылку!'); return; }
      const channelUsername = nm.startsWith('@') ? nm : '@'+nm;
      const requiredShows = parseInt((shows && shows.value) || 1000, 10);
      if (!confirm(`Создать слот: ${channelUsername}, показов: ${requiredShows}?`)) return;

      try {
        const resp = await fetch('/api/slot', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'X-Telegram-WebApp-InitData': tg.initData || '' },
          body: JSON.stringify({
            advertiser_id: tg.initDataUnsafe?.user?.id || 0,
            channel_username: channelUsername,
            channel_name: nm,
            link: ln,
            slot_type: (type && type.value) || 'standard',
            required_shows: requiredShows
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          tg.showAlert && tg.showAlert('Слот создан! ID: ' + (data.slot_id || '—'));
          await loadSlots();
          document.querySelector('[data-page="home"]').click();
        } else {
          tg.showAlert && tg.showAlert('Ошибка создания слота');
        }
      } catch (e) {
        tg.showAlert && tg.showAlert('Ошибка сети при создании слота');
      }
    };
  }
}

// ==================== API integration ====================
async function fetchUserSlots() {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return [];
    try {
        const res = await fetch(`/api/user_slots/${userId}`, {
          headers: { 'X-Telegram-WebApp-InitData': tg.initData || '' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        // data already contains exactly N slots or empties
        return data.map(s => ({
            slot_id: s.slot_id,
            channel_username: s.channel_username,
            link: s.link || '#',
            type: s.type,
            status: s.status,
            subscribed_at: s.subscribed_at || null
        }));
    } catch (e) {
        console.warn('fetchUserSlots error', e);
        return [];
    }
}
async function subscribeSlot(slot_id) {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    try {
        const res = await fetch(`/api/subscribe_slot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-WebApp-InitData': tg.initData || '' },
            body: JSON.stringify({ user_id: userId, slot_id })
        });
        if (!res.ok) {
            console.warn('subscribe failed', res.status);
            return;
        }
        const data = await res.json();
        user.timer_running = data.timer_running;
        updateTimerProgress();
        await loadSlots(); // обновляем список после подписки
    } catch(e) {
        console.warn('subscribeSlot error', e);
    }
}
async function loadSlots() {
    user.subSlots = await fetchUserSlots();
    renderAdSlots();
    renderHomeSlotsList();
}

// poll user progress/timer state from backend
async function fetchUserProgress() {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return null;
    try {
        const res = await fetch(`/api/user_progress/${userId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

function updateTimerProgress() {
    const bar = document.getElementById('progressFill');
    if (!bar) return;
    const percent = Math.max(0, Math.min(100, user.progress || 0));
    bar.style.width = percent + '%';
    // color by running state
    if (user.timer_running) {
        bar.style.background = 'linear-gradient(90deg, #ff4d8d, #ff2af5)';
        bar.style.boxShadow = '0 0 12px #ff2af5';
    } else {
        bar.style.background = 'linear-gradient(90deg, #ff3333, #ff7a7a)';
        bar.style.boxShadow = '0 0 8px #ff3333';
    }
    const prog = document.getElementById('progressPercent');
    if (prog) prog.textContent = ((user.progress||0).toFixed(1)) + '%';
}

// renderAdSlots: ensure exactly current_slot_count boxes shown
function renderAdSlots(){
  const grid = document.getElementById('adSlotsGrid');
  if (!grid) {
    console.warn('adSlotsGrid not found');
    return;
  }
  grid.innerHTML = '';
  const slots = user.subSlots || [];
  const total = user.current_slot_count || 5;

  // ensure array length = total (server already should, but double-check)
  const padded = slots.slice(0, total);
  while (padded.length < total) padded.push({ slot_id: null, channel_username: null, link: '#', type: null, status: 'empty' });

  padded.forEach(s=>{
    const el = document.createElement('div');
    el.className = `slot-card ${s.status||'empty'}`;
    el.dataset.slotId = s.slot_id || '';
    el.style.display = 'flex';
    el.style.flexDirection = 'row';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.padding = '10px';
    el.style.minHeight = '56px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '6px';
    left.style.flex = '1';

    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.textContent = s.channel_username || 'Свободно';
    left.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.style.fontSize = '0.82rem';
    subtitle.style.color = '#b8a8e0';
    subtitle.textContent = s.type ? (s.type.toUpperCase()) : '—';
    left.appendChild(subtitle);

    el.appendChild(left);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';

    if (s.status === 'subscribed') {
      const b = document.createElement('button');
      b.textContent = 'Подписано';
      b.disabled = true;
      b.style.background = '#2ecc71';
      b.style.color = 'white';
      b.style.border = 'none';
      b.style.padding = '6px 10px';
      b.style.borderRadius = '10px';
      right.appendChild(b);
    } else if (s.status === 'need_subscribe' || s.status === 'active') {
      const btn = document.createElement('button');
      btn.textContent = 'Подписаться';
      btn.style.padding = '8px 12px';
      btn.className = 'btn-neon';
      setCursor(btn);
      btn.onclick = () => subscribeSlot(s.slot_id);
      right.appendChild(btn);
    } else if (s.status === 'completed') {
      const txt = document.createElement('div');
      txt.textContent = 'Завершён';
      right.appendChild(txt);
    } else {
      // empty
      const txt = document.createElement('div');
      txt.textContent = 'Пусто';
      txt.style.opacity = '0.6';
      right.appendChild(txt);
    }

    const go = document.createElement('a');
    go.href = s.link || '#';
    go.target = '_blank';
    go.textContent = 'Перейти';
    go.style.fontSize = '0.85rem';
    right.appendChild(go);

    el.appendChild(right);
    grid.appendChild(el);
  });

  renderHomeSlotsList();

  // Timer auto-start logic: if all non-empty slots are subscribed -> start timer
  const activeCount = (user.subSlots || []).filter(s => s.slot_id !== null && s.status === 'subscribed').length;
  const nonEmptyCount = (user.subSlots || []).filter(s => s.slot_id !== null).length;
  if (nonEmptyCount > 0 && activeCount === nonEmptyCount) {
      if (!timerInterval) startTimer();
      user.timer_running = true;
  } else {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      user.timer_running = false;
      updateTimerProgress();
  }
}

// ==================== Timer (client local) ====================
// Client will simulate progress based on user.timer_running and current speed.
// Forward progress increment per tick depends on timer_speed_multiplier and tickSeconds.
// For tests: 1 checkpoint = 60 seconds -> full = 5*60 = 300 seconds -> progress 0..100 represents one checkpoint (we keep 0..100)
let timerInterval = null;
const TICK_MS = 1000;
function startTimer() {
    if (timerInterval) return;
    user.timer_running = true;
    updateTimerProgress();
    timerInterval = setInterval(() => {
        // when running forward
        if (user.timer_running) {
            // advance: we want one checkpoint = 60s at base speed => progress increases by (100 / 60) per second * speed multiplier
            const basePerSec = 100.0 / 60.0;
            const delta = basePerSec * (user.timer_speed_multiplier || 1.0);
            user.progress = (user.progress || 0) + delta;
            if (user.progress >= 100) {
                // reached checkpoint -> award something and reset to 0
                user.progress = 0;
                user.balance = (user.balance || 0) + ((user.payout_rate || 1) * 10); // test payout
                tg.showAlert && tg.showAlert('Чекпоинт завершён! +10 ⭐ (тест)');
                // persist minimal state
                const userId = tg.initDataUnsafe?.user?.id || 0;
                fetch(`/api/user/${userId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Telegram-WebApp-InitData': tg.initData || '' },
                    body: JSON.stringify({ checkpoint_progress: 0, timer_progress: 0, balance: user.balance })
                }).catch(()=>{});
            }
        } else {
            // backward motion when not all subscribed: count backwards at x2 speed (per spec)
            // backward delta: basePerSec * 2 * speedMultiplier
            const basePerSec = 100.0 / 60.0;
            const delta = basePerSec * 2 * (user.timer_speed_multiplier || 1.0);
            // ensure we don't go below checkpoint boundary: for prototype we allow stop at 0
            user.progress = Math.max(0, (user.progress || 0) - delta);
        }
        updateTimerProgress();
    }, TICK_MS);
}

// INIT
document.addEventListener('DOMContentLoaded', async ()=>{
  initStatsToggle();

  const userId = tg.initDataUnsafe?.user?.id;
  if (userId){
    try {
      const r = await fetch(`/api/user/${userId}`, {
        method: 'GET',
        headers: { 'X-Telegram-WebApp-InitData': tg.initData || '' }
      });
      if (r.ok){
        const data = await r.json();
        user = {
          level: data.level || 1,
          freePoints: data.free_points || 0,
          refPoints: data.ref_points || 0,
          payoutBonus: data.payout_bonus || 0,
          balance: data.balance || 0.0,
          progress: data.timer_progress || data.checkpoint_progress || 0,
          boostLevel: data.current_boost_level || 0,
          adSlots: [],
          subSlots: Array(data.current_slot_count || 5).fill(null).map((_,i)=>({ slot_id:null, channel_username:null, status:'empty' })),
          current_slot_count: data.current_slot_count || 5,
          timer_speed_multiplier: data.timer_speed_multiplier || 1.0,
          payout_rate: data.payout_rate || 1.0,
          timer_running: data.timer_running || false
        };
      } else {
        console.warn('API user fetch', r.status);
      }
    } catch (e) { console.warn('fetch user fail', e); }
  }

  await loadSlots();
  updateMain();
  initUpgradePage();

  const infoBtn = document.getElementById('infoBtn');
  if (infoBtn){ setCursor(infoBtn); infoBtn.onclick = ()=> alert('Подпишись на все каналы → таймер запустится → зарабатывай звёзды!'); }

  const buySlotBtn = document.querySelector('.buy-slot');
  if (buySlotBtn){ setCursor(buySlotBtn); buySlotBtn.onclick = ()=> { const buyPageBtn = document.querySelector('[data-page="buy"]'); if (buyPageBtn) buyPageBtn.click(); }; }

  initBuyPage();

  // Polling: refresh slots + progress every 3s
  setInterval(async () => {
    await loadSlots();
    const prog = await fetchUserProgress();
    if (prog) {
      if (typeof prog.timer_progress === 'number') user.progress = prog.timer_progress;
      if (typeof prog.timer_running === 'boolean') user.timer_running = prog.timer_running;
      if (user.timer_running && !timerInterval) startTimer();
      if (!user.timer_running && timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      updateTimerProgress();
    }
  }, 3000);
});
