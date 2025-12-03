// static/script.js
// ===================================
// script.js — ваша версия, расширенная для работы с бэкендом
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
  subSlots: Array(5).fill(null).map((_, i) => ({ id: i, status: "empty", expires: null })),
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

// SLOTS helpers (createSlotCard kept for local UI consistency)
function createSlotCard(slot){
  const slotCard = document.createElement('div');
  slotCard.className = `slot-card ${slot.status||'empty'}`;
  slotCard.style.display = 'flex';
  slotCard.style.justifyContent = 'space-between';
  slotCard.style.alignItems = 'center';
  slotCard.style.padding = '12px';
  const left = document.createElement('div');
  left.style.flex = '1';
  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.textContent = slot.channel_username || slot.name || (slot.status === 'empty' ? 'Свободно' : 'Слот');
  left.appendChild(title);
  slotCard.appendChild(left);
  const right = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'btn-neon';
  btn.style.padding = '6px 10px';
  btn.style.fontSize = '0.85rem';
  setCursor(btn);
  btn.textContent = 'Детали';
  btn.onclick = () => tg.showAlert && tg.showAlert('Слот: ' + (slot.channel_username||'—'));
  right.appendChild(btn);
  slotCard.appendChild(right);
  return slotCard;
}

function renderHomeSlotsList(){
  const container = document.getElementById('adSlotsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!user.adSlots || user.adSlots.length === 0){
    const empty = document.createElement('div');
    empty.className = 'slot-card empty';
    empty.style.justifyContent = 'center';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'Нет купленных слотов';
    container.appendChild(empty);
    return;
  }
  user.adSlots.forEach(s=>{
    const el = document.createElement('div');
    el.className = 'slot-card active';
    el.textContent = s.channel_username || s.channel_name || 'Слот';
    container.appendChild(el);
  });
}
function updateSlotIndicator() {
  const subscribedCount = user.subSlots.filter(s => s.status === 'subscribed' || s.status === 'completed').length;
  const currentEl = document.querySelector('.current.red-bold');
  const totalEl = document.querySelector('.total.neon-text');
  if (currentEl) currentEl.textContent = subscribedCount;
  if (totalEl) totalEl.textContent = user.current_slot_count + ' слотов';
}

// UPGRADE handlers (unchanged)
function initUpgradePage(){
  const container = qs('.boost-levels');
  if (!container) { console.warn('boost-levels not found'); return; }
  container.innerHTML = '';
  for (let i=1;i<=4;i++){
    const b = document.createElement('button');
    b.className = 'boost-btn' + (i <= (user.boostLevel||0) ? ' active' : '');
    b.textContent = `${i} - ${i*25}%`;
    setCursor(b);
    b.onclick = ()=>{ /* same logic */ 
      if (i <= (user.boostLevel||0)){
        user.boostLevel = i;
        initUpgradePage(); updateMain();
        return;
      }
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

  const buyPayout = document.getElementById('buyPayout');
  if (buyPayout){
    setCursor(buyPayout);
    buyPayout.onclick = ()=>{ /* as before */ 
      const cost = parseInt(document.getElementById('payoutCost')?.textContent || '10', 10);
      if ((user.balance||0) >= cost) {
        user.balance -= cost;
        user.currentPayout = (user.currentPayout||10) + 1;
        tg.showAlert && tg.showAlert('Выплата увеличена!');
        updateMain();
      } else tg.showAlert && tg.showAlert('Недостаточно звёзд!');
    };
  }

  const invite = document.getElementById('inviteFriendBtn');
  if (invite) { setCursor(invite); invite.onclick = ()=>{ tg.sendData && tg.sendData('invite'); tg.showAlert && tg.showAlert('Приглашение отправлено'); }; }

  const resetLevelBtn = document.getElementById('resetLevelBtn');
  if (resetLevelBtn){ setCursor(resetLevelBtn); resetLevelBtn.onclick = ()=>{ user.level = 1; user.freePoints = 0; updateMain(); tg.showAlert && tg.showAlert('Сброшено (тест)'); }; }
  const addLevelBtn = document.getElementById('addLevelBtn');
  if (addLevelBtn){ setCursor(addLevelBtn); addLevelBtn.onclick = ()=>{ user.level = (user.level||1)+1; user.freePoints = (user.freePoints||0)+1; updateMain(); tg.showAlert && tg.showAlert('+1 уровень (тест)'); }; }
}

// BUY page
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
          user.adSlots = user.adSlots || [];
          user.adSlots.push({ channel_username: channelUsername, id: data.slot_id || Date.now() });
          user.subSlots = user.subSlots || [];
          if (user.subSlots.length < (user.current_slot_count||5)) {
            user.subSlots.push({ id: user.subSlots.length, status: 'empty', expires: null });
          }
          resetBtn && resetBtn.click();
          document.querySelector('[data-page="home"]').click();
          renderAdSlots();
          renderHomeSlotsList();
        } else {
          const txt = await resp.text().catch(()=>null);
          console.error('Slot create failed', resp.status, txt);
          tg.showAlert && tg.showAlert('Ошибка создания слота');
        }
      } catch (e) {
        console.error('Network error create slot', e);
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
        return data.map(s => ({
            slot_id: s.slot_id,
            channel_username: s.title,
            link: s.link,
            type: s.type,
            status: s.status,
            expires: null
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
    bar.style.width = Math.min(100, user.progress || 0) + '%';
    bar.style.backgroundColor = user.timer_running ? 'green' : 'red';
    const prog = document.getElementById('progressPercent');
    if (prog) prog.textContent = ((user.progress||0).toFixed(1)) + '%';
}

function renderHomeSlotsList() {
  const container = document.getElementById('adSlotsContainer');
  if (!container) return;
  container.innerHTML = '';
  if (!user.adSlots || user.adSlots.length === 0) {
    // ... (как было)
  }
  user.adSlots.forEach(s => {
    const el = document.createElement('div');
    el.className = 'slot-card active';
    el.innerHTML = `
      <span>${s.channel_username || s.channel_name || 'Слот'}</span>
      <button class="delete-btn" data-id="${s.id}">Удалить (тест)</button>
    `;
    const delBtn = el.querySelector('.delete-btn');
    if (delBtn) {
      setCursor(delBtn);
      delBtn.onclick = async () => {
        if (confirm('Удалить слот?')) {
          try {
            const res = await fetch(`/api/slot/${s.id}`, {
              method: 'DELETE',
              headers: { 'X-Telegram-WebApp-InitData': tg.initData || '' }
            });
            if (res.ok) {
              user.adSlots = user.adSlots.filter(slot => slot.id !== s.id);
              renderHomeSlotsList();
              tg.showAlert('Слот удалён');
            }
          } catch (e) {
            tg.showAlert('Ошибка удаления');
          }
        }
      };
    }
    container.appendChild(el);
  });
}

// renderAdSlots adapted to server-driven slots
function renderAdSlots() {
  const grid = document.getElementById('adSlotsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Дополняем до current_slot_count пустыми слотами
  let slotsToRender = [...user.subSlots];
  const emptyCount = user.current_slot_count - slotsToRender.length;
  for (let i = 0; i < emptyCount; i++) {
    slotsToRender.push({ status: 'empty', channel_username: 'Свободно', link: '', type: '', slot_id: null });
  }

  slotsToRender.forEach(s => {
    const el = document.createElement('div');
    el.className = `slot-card ${s.status || 'empty'}`;
    el.style.display = 'flex';
    el.style.justifyContent = 'space-between';
    el.style.alignItems = 'center';
    el.style.padding = '10px';
    
    if (s.status === 'empty') {
      el.innerHTML = `<span>${s.channel_username}</span>`;
    } else {
      el.innerHTML = `
        <span>$$ {s.channel_username} ( $${s.type})</span>
        <a href="${s.link}" target="_blank">Перейти</a>
        <button $$ {s.status === 'subscribed' || s.status === 'completed' ? 'disabled' : ''} data-id=" $${s.slot_id}">
          ${s.status === 'subscribed' || s.status === 'completed' ? 'Подписано' : 'Подписаться'}
        </button>
      `;
      const btn = el.querySelector('button');
      if (btn && !btn.disabled) {
        setCursor(btn);
        btn.onclick = () => subscribeSlot(s.slot_id);
      }
    }
    grid.appendChild(el);
  });
  renderHomeSlotsList();

  updateSlotIndicator();

  // Timer auto-start logic: if all slots are subscribed -> start timer
  const subscribedCount = user.subSlots.filter(s => s.status === 'subscribed').length;
  if (subscribedCount === user.current_slot_count && user.subSlots.length === user.current_slot_count) {
    if (!timerInterval) startTimer();
  } else {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    user.timer_running = false;
    updateTimerProgress();
  }
}

// ==================== Timer (local) ====================
let timerInterval = null;
function startTimer() {
    if (timerInterval) return;
    user.timer_running = true;
    updateTimerProgress();
    timerInterval = setInterval(() => {
        user.progress = (user.progress || 0) + (user.timer_speed_multiplier || 1) * 0.1;
        if (user.progress >= 100) {
            clearInterval(timerInterval);
            timerInterval = null;
            user.progress = 0;
            user.balance = (user.balance || 0) + ((user.payout_rate || 1) * 10);
            tg.showAlert && tg.showAlert('Цикл завершён! +10 ⭐');
            // Persist progress=0 and balance to backend
            const userId = tg.initDataUnsafe?.user?.id || 0;
            fetch(`/api/user/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Telegram-WebApp-InitData': tg.initData || '' },
                body: JSON.stringify({ checkpoint_progress: 0, timer_progress: 0, balance: user.balance })
            }).catch(()=>{});
        }
        updateTimerProgress();
    }, 1000);
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
        if (data.new_user) tg.showAlert && tg.showAlert('Аккаунт создан! Добро пожаловать!');
        user = {
          level: data.level || 1,
          freePoints: data.free_points || 0,
          refPoints: data.ref_points || 0,
          payoutBonus: data.payout_bonus || 0,
          balance: data.balance || 0.0,
          progress: data.timer_progress || data.checkpoint_progress || 0,
          boostLevel: data.current_boost_level || 0,
          adSlots: [],
          subSlots: Array(data.current_slot_count || 5).fill(null).map((_,i)=>({ id:i, status:'empty', expires:null })),
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
      // only overwrite local progress if backend has a believable value
      if (typeof prog.timer_progress === 'number') user.progress = prog.timer_progress;
      if (typeof prog.timer_running === 'boolean') user.timer_running = prog.timer_running;
      // if backend reports running true and timer not started locally -> start local timer
      if (user.timer_running && !timerInterval) startTimer();
      if (!user.timer_running && timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      updateTimerProgress();
    }
  }, 3000);
});
