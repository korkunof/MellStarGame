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
    if (btn.dataset.page === "upgrade") initUpgradePage();
    if (btn.dataset.page === "buy") initBuyPage();
  };
});

// Кнопка "Применить разгон"
document.getElementById("applyBoostNavBtn").onclick = () => {
  document.querySelector('[data-page="upgrade"]').click();
  setTimeout(() => {
    const boostSection = document.getElementById("boostSection");
    if (boostSection) {
      boostSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 300);
};

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
// [ОБНОВЛЕНИЕ ПРОГРЕССА]
// ===================================
function updateProgress(currentSlot = 1) {
  const fill = document.getElementById("progressFill");
  const text = document.getElementById("progressText");

  const percent = (currentSlot / 5) * 100;
  fill.style.width = percent + "%";

  if (currentSlot > 0) {
    fill.classList.add("initial-glow");
  } else {
    fill.classList.remove("initial-glow");
  }

  document.querySelectorAll(".checkpoint.passed").forEach(c => c.classList.remove("passed"));

  const positions = ["0%", "25%", "50%", "75%", "100%"];
  for (let i = 0; i < currentSlot; i++) {
    const cp = document.querySelector(`.checkpoint[data-pos="${positions[i]}"]`);
    if (cp) cp.classList.add("passed");
  }

  text.innerHTML = `<span class="current red-bold">${currentSlot}</span> / <span class="total neon-text">5 слотов</span>`;
}

// ===================================
// [ПРОКАЧКА — ИНИЦИАЛИЗАЦИЯ]
// ===================================
function initUpgradePage() {
  // Уровень
  const levelInput = document.getElementById("levelInput");
  const decrementBtn = document.getElementById("decrementLevel");
  const incrementBtn = document.getElementById("incrementLevel");

  function updateLevelDisplay() {
    document.getElementById("currLevelDisplay").textContent = user.level;
    document.getElementById("levelSpent").textContent = user.level - 1;
    document.getElementById("freePoints").textContent = user.freePoints;
    document.getElementById("availablePoints").textContent = user.freePoints;

    levelInput.value = user.level;
    levelInput.max = 45;

    const maxSlots = 5 + Math.floor((user.level - 1) / 2) * 1;
    const maxStars = 10 + Math.floor((user.level - 1) / 2);
    const speedBonus = (user.level - 1) * 0.089;

    document.querySelector(".stats-box p:nth-child(1) strong").innerHTML = `<span class="pink">${maxSlots}</span> из 28`;
    document.querySelector(".stats-box p:nth-child(2) strong").innerHTML = `<span class="pink">${10 + user.payoutBonus}</span>⭐ из ${maxStars}`;
    document.querySelector(".stats-box p:nth-child(3) strong").innerHTML = `<span class="pink">+${speedBonus.toFixed(3)}</span> из +4,005`;
  }

  decrementBtn.onclick = () => {
    if (user.freePoints > 0 && user.level > 1) {
      user.level--;
      user.freePoints++;
      updateLevelDisplay();
      updateMain();
    }
  };

  incrementBtn.onclick = () => {
    if (user.level < 45) {
      user.level++;
      user.freePoints--;
      updateLevelDisplay();
      updateMain();
    }
  };

  // Разгон
  document.querySelectorAll(".boost-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".boost-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  document.getElementById("applyBoost").onclick = () => {
    const selected = document.querySelector(".boost-btn.active");
    if (!selected) return alert("Выбери уровень разгона!");
    const level = parseInt(selected.dataset.level);
    const cost = level * 4;
    if (user.refPoints < cost) return alert("Недостаточно реф. очков!");
    user.boostLevel = level;
    user.refPoints -= cost;
    updateMain();
    alert(`Разгон применён: +${level * 25}% к чекпоинту!`);
  };

  document.getElementById("inviteFriendBtn").onclick = () => {
    const link = `https://t.me/MellStarGameBot?start=ref_${tg.initDataUnsafe.user.id}`;
    tg.shareUrl(link, "Пригласи друга и получи очко реферала!");
  };

  // Доп. выплата
  function updatePayoutCost() {
    const cost = payoutCosts[user.payoutBonus] || 999;
    document.getElementById("payoutCost").textContent = cost;
    document.getElementById("currentPayout").textContent = 10 + user.payoutBonus;
    document.getElementById("extraStarsBought").textContent = user.payoutBonus;
  }

  document.getElementById("buyPayout").onclick = () => {
    const cost = payoutCosts[user.payoutBonus] || 999;
    if (user.balance < cost) return alert("Недостаточно звёзд!");
    if (!confirm(`Купить +1 звезду за чекпоинт за ${cost} звёзд?`)) return;
    user.balance -= cost;
    user.payoutBonus++;
    updatePayoutCost();
    updateMain();
  };

  // Инициализация
  updateLevelDisplay();
  updatePayoutCost();

  const activeBoost = document.querySelector(`.boost-btn[data-level="${user.boostLevel}"]`);
  if (activeBoost) activeBoost.classList.add("active");
}

// ===================================
// [СТРАНИЦА ПОКУПКИ СЛОТА]
// ===================================
function initBuyPage() {
  const name = document.getElementById("slotName");
  const link = document.getElementById("slotLink");
  const type = document.getElementById("slotType");
  const shows = document.getElementById("showsSelect");
  const resetBtn = document.getElementById("resetBtn");
  const payBtn = document.getElementById("payBtn");

  const calcType = document.getElementById("calcType");
  const typeCost = document.getElementById("typeCost");
  const calcShows = document.getElementById("calcShows");
  const showsCost = document.getElementById("showsCost");
  const totalCalc = document.getElementById("totalCalc");

  resetBtn.onclick = () => {
    name.value = ""; link.value = ""; type.value = "стандарт"; shows.value = "1000";
    updateCalc();
  };

  function updateCalc() {
    const showsValue = parseInt(shows.value);
    const isVip = type.value === "VIP слот";
    const platformCost = 100;
    const typeCostValue = isVip ? 2000 : 1000;
    const showsCostValue = showsValue === 1000 ? 500 : showsValue === 2000 ? 1000 : 2500;
    const total = platformCost + typeCostValue + showsCostValue;

    calcType.textContent = type.value;
    typeCost.textContent = typeCostValue;
    calcShows.textContent = showsValue;
    showsCost.textContent = showsCostValue;
    totalCalc.textContent = total;
  }

  [name, link, type, shows].forEach(el => el.addEventListener("input", updateCalc));
  updateCalc();

  payBtn.onclick = () => {
    if (!name.value.trim() || !link.value.trim()) {
      alert("Заполните название и ссылку!");
      return;
    }
    const total = parseInt(totalCalc.textContent);
    if (user.balance < total) {
      alert(`Недостаточно звёзд! Нужно: ${total} ⭐`);
      return;
    }
    if (!confirm(`Оплатить ${total} ⭐?`)) return;

    user.balance -= total;
    user.adSlots.push({
      name: name.value,
      showsLeft: parseInt(shows.value),
      link: link.value,
      type: type.value
    });

    alert("Слот куплен!");
    resetBtn.click();
    document.querySelector('[data-page="home"]').click();
  };
}

// ===================================
// [ИНИЦИАЛИЗАЦИЯ]
// ===================================
document.addEventListener("DOMContentLoaded", () => {
  initStatsToggle();
  updateMain();
  renderAdSlots();
  updateProgress(1);
  initUpgradePage();
});

// КНОПКИ
document.getElementById("infoBtn").onclick = () => {
  alert("Подпишись на все каналы → таймер запустится → зарабатывай звёзды!");
};

document.querySelector(".buy-slot").onclick = () => {
  document.querySelector('[data-page="buy"]').click();
};