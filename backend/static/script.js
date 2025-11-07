// ===================================
// [ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP]
// ===================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const username = tg.initDataUnsafe?.user?.first_name || "Гость";
document.getElementById("username").textContent = username;

// ===================================
// [ДАННЫЕ ПОЛЬЗОВАТЕЛЯ]
// ===================================
let user = {
  level: 2,
  freePoints: 1,
  referrals: 0,
  refPoints: 4,
  boostLevel: 1,
  payoutBonus: 0,
  balance: 0,
  progress: 0,
  adSlots: [],
  subSlots: Array(5).fill(null).map((_, i) => ({ id: i, status: "empty", expires: null }))
};

const payoutCosts = [10,11,13,17,24,36,58,98,127,166,215,280,364,473,615,677,744,819,860,903,948,995,1045,1066,1087,1109,1131,1154,1177,1188,1200,1212,1224,1237,1249,1261,1274,1287,1300];

// ===================================
// [НАВИГАЦИЯ]
// ===================================
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(btn.dataset.page).classList.add("active");
    
    if (btn.dataset.page === "home") updateMain();
    if (btn.dataset.page === "subscriptions") renderAdSlots();
  };
});

// ===================================
// [ПЕРЕКЛЮЧЕНИЕ СТАТИСТИКИ]
// ===================================
function initStatsToggle() {
  const btn = document.getElementById("statsToggleBtn");
  const grid = document.querySelector(".stats-grid");
  const collapsed = document.getElementById("collapsedStats");

  btn.classList.add("active");
  btn.textContent = "Полная";
  grid.style.display = "grid";
  collapsed.style.display = "none";

  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) {
      btn.classList.remove("active");
      btn.textContent = "Краткая";
      grid.style.display = "none";
      collapsed.style.display = "block";
    } else {
      btn.classList.add("active");
      btn.textContent = "Полная";
      grid.style.display = "grid";
      collapsed.style.display = "none";
    }
  });
}

// ===================================
// [ГЛАВНАЯ] — ОБНОВЛЕНИЕ СТАТИСТИКИ
// ===================================
function updateMain() {
  document.getElementById("level").textContent = user.level;
  document.getElementById("levelSpent").textContent = user.level - 1;
  document.getElementById("freePoints").textContent = user.freePoints;
  document.getElementById("refPoints").textContent = user.refPoints;
  document.getElementById("boostLevel").textContent = user.boostLevel * 25;

  const active = user.subSlots.filter(s => s.status === "active").length;
  const total = user.subSlots.length;
  document.getElementById("activeSlots").textContent = `${active} / ${total}`;

  const now = Date.now();
  const nearest = user.subSlots
    .filter(s => s.status === "active" && s.expires)
    .map(s => s.expires)
    .sort((a, b) => a - b)[0];
  document.getElementById("nextSlotTime").textContent = nearest ? formatTimeLeft(nearest - now) : "—";

  const payout = 10 + user.payoutBonus;
  document.querySelectorAll('#payoutPer, #payoutMini').forEach(el => {
    el.innerHTML = `<span class="star">${payout}</span>`;
  });

  const speed = 1 + (user.level - 1) * 0.088 + user.boostLevel * 0.25;
  document.getElementById("timerSpeed").textContent = speed.toFixed(3).replace('.', ',');
  document.getElementById("speedMini").textContent = speed.toFixed(3).replace('.', ',');

  document.getElementById("levelMini").textContent = user.level;
  document.getElementById("boostMini").textContent = user.boostLevel * 25;
  document.getElementById("slotsMini").textContent = `${active}/${total}`;
  document.getElementById("speedMini").className = "neon";
  document.getElementById("levelMini").className = "neon";
  document.getElementById("boostMini").className = "neon";

  // Обновляем купленные слоты
  renderAdSlotsMain();
}

// ===================================
// [ОТРИСОВКА КУПЛЕННЫХ СЛОТОВ — НА ГЛАВНОЙ]
// ===================================
function renderAdSlotsMain() {
  const cont = document.getElementById("adSlotsContainer");
  cont.innerHTML = "";

  if (user.adSlots.length === 0) {
    const div = document.createElement("div");
    div.className = "slot-card empty";
    div.style.justifyContent = "center";
    div.style.fontStyle = "italic";
    div.textContent = "Нет купленных слотов";
    cont.appendChild(div);
    return;
  }

  user.adSlots.forEach(slot => {
    const div = document.createElement("div");
    div.className = "slot-card active";
    div.innerHTML = `<span>${slot.name}</span><span>${slot.showsLeft} показов</span>`;
    cont.appendChild(div);
  });
}

// ===================================
// [ОТРИСОВКА СЛОТОВ — В "СЛОТЫ ТАЙМЕР"]
// ===================================
function renderAdSlots() {
  const container = document.getElementById("adSlotsGrid");
  if (!container) return;
  container.innerHTML = "";

  user.adSlots.forEach(slot => {
    const div = document.createElement("div");
    div.className = "slot-card active";
    div.innerHTML = `<span>${slot.name}</span><span>${slot.showsLeft} показов</span>`;
    container.appendChild(div);
  });

  const emptyCount = 5 - user.adSlots.length;
  for (let i = 0; i < emptyCount; i++) {
    const div = document.createElement("div");
    div.className = "slot-card empty";
    div.textContent = "Пусто";
    container.appendChild(div);
  }
}

// ===================================
// [УТИЛИТЫ]
// ===================================
function formatTimeLeft(ms) {
  if (ms <= 0) return "истёк";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}ч ${m}м`;
}

// ===================================
// [ИНИЦИАЛИЗАЦИЯ]
// ===================================
document.addEventListener("DOMContentLoaded", () => {
  initStatsToggle();
  updateMain();
  renderAdSlots();
});

// КНОПКИ
document.getElementById("inviteBtn").onclick = () => {
  const link = `https://t.me/MellStarGameBot?start=ref_${tg.initDataUnsafe.user.id}`;
  tg.shareUrl(link, "Пригласи друга и получи поинт!");
};
document.getElementById("infoBtn").onclick = () => {
  alert("Подпишись на все каналы → таймер запустится → зарабатывай звёзды!");
};

document.querySelector(".buy-slot").onclick = () => {
  document.querySelector('[data-page="buy"]').click();
};