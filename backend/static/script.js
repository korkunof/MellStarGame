// ===================================
// [ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP]
// ===================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const username = tg.initDataUnsafe?.user?.first_name || "Гость";
const usernameEl = document.getElementById("username");
if (usernameEl) usernameEl.textContent = username;

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
  balance: 9999,
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
    const pageEl = document.getElementById(btn.dataset.page);
    if (pageEl) pageEl.classList.add("active");

    if (btn.dataset.page === "home") updateMain();
    if (btn.dataset.page === "subscriptions") renderAdSlots();
    if (btn.dataset.page === "upgrade") initUpgradePage();
    if (btn.dataset.page === "buy") initBuyPage();
  };
});

// ===================================
// [СТАТИСТИКА]
// ===================================
function initStatsToggle() {
  const btn = document.getElementById("statsToggleBtn");
  const fullStats = document.getElementById("fullStats");
  const collapsedStats = document.getElementById("collapsedStats");

  if (btn) {
    btn.onclick = () => {
      const isActive = btn.classList.contains("active");
      btn.textContent = isActive ? "Скрыть" : "Полная";
      btn.classList.toggle("active");
      if (fullStats) fullStats.style.display = isActive ? "none" : "grid";
      if (collapsedStats) collapsedStats.style.display = isActive ? "block" : "none";
    };
  }
}

function updateMain() {
  const levelEl = document.getElementById("level");
  if (levelEl) levelEl.textContent = user.level;

  const freePointsEl = document.getElementById("freePoints");
  if (freePointsEl) freePointsEl.textContent = user.freePoints;

  const refPointsEl = document.getElementById("refPoints");
  if (refPointsEl) refPointsEl.textContent = user.refPoints;

  const payoutBonusEl = document.getElementById("payoutBonus");
  if (payoutBonusEl) payoutBonusEl.textContent = user.payoutBonus;

  const balanceEl = document.getElementById("balance");
  if (balanceEl) balanceEl.textContent = user.balance.toFixed(1);

  const progressEl = document.getElementById("progress");
  if (progressEl) progressEl.textContent = user.progress.toFixed(1);

  const boostLevelEl = document.getElementById("boostLevel");
  if (boostLevelEl) boostLevelEl.textContent = user.boostLevel;

  const progressBar = document.getElementById("progressBar");
  if (progressBar) progressBar.style.width = user.progress + "%";

  const notifyCheckbox = document.getElementById("notifyCheckbox");
  if (notifyCheckbox) notifyCheckbox.checked = user.notifyEnabled || false;
}

// ===================================
// [СЛОТЫ]
// ===================================
function renderAdSlots() {
  const slotsContainer = document.getElementById("slotsContainer");
  if (!slotsContainer) return;

  slotsContainer.innerHTML = "";

  user.subSlots.forEach(slot => {
    const slotCard = document.createElement("div");
    slotCard.className = `slot-card ${slot.status}`;

    if (slot.status === "empty") {
      slotCard.innerHTML = "Свободно";
    } else if (slot.status === "active") {
      const timeLeft = slot.expires - Date.now();
      const minutes = Math.floor(timeLeft / 60000);
      slotCard.innerHTML = `Таймер: ${minutes} мин`;
    } else if (slot.status === "need_subscribe") {
      slotCard.innerHTML = "Подпишись";
    } else {
      slotCard.innerHTML = "Завершено";
    }

    slotsContainer.appendChild(slotCard);
  });
}

// ===================================
// [ПРОКАЧКА]
// ===================================
function initUpgradePage() {
  const boostLevels = document.getElementById("boostLevels");
  if (!boostLevels) return;

  boostLevels.innerHTML = "";

  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.className = `boost-btn ${i <= user.boostLevel ? "active" : ""}`;
    btn.textContent = `Lv.${i}`;
    btn.onclick = () => {
      if (i > user.boostLevel && user.freePoints >= i * 10) {
        user.boostLevel = i;
        user.freePoints -= i * 10;
        updateMain();
        initUpgradePage();
        tg.showAlert(`Буст Lv.${i} активирован!`);
      } else if (i > user.boostLevel) {
        tg.showAlert("Недостаточно очков!");
      }
    };
    boostLevels.appendChild(btn);
  }

  const applyBtn = document.getElementById("applyBoost");
  if (applyBtn) {
    applyBtn.onclick = () => {
      if (user.freePoints >= 50) {
        user.currentBoostLevel += 1;
        user.freePoints -= 50;
        updateMain();
        tg.showAlert("Буст применён!");
      } else {
        tg.showAlert("Недостаточно очков!");
      }
    };
  }
}

// ===================================
// [КУПЛЯ СЛОТОВ]
// ===================================
function initBuyPage() {
  const name = document.getElementById("adName");
  const link = document.getElementById("adLink");
  const type = document.getElementById("adType");
  const shows = document.getElementById("adShows");
  const totalCalc = document.getElementById("totalCalc");
  const resetBtn = document.getElementById("resetBtn");
  const payBtn = document.getElementById("payBtn");

  if (!name || !link || !type || !shows || !totalCalc || !resetBtn || !payBtn) return;

  function updateCalc() {
    const basePrice = 1.0;
    const typeMultiplier = type.value === "стандарт" ? 1 : type.value === "vip" ? 1.5 : 2.0;
    const showsMultiplier = parseInt(shows.value) / 1000;
    const total = basePrice * typeMultiplier * showsMultiplier * 1000;
    totalCalc.textContent = Math.ceil(total);
  }

  resetBtn.onclick = () => {
    name.value = ""; link.value = ""; type.value = "стандарт"; shows.value = "1000";
    updateCalc();
  };

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
// [ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ]
// ===================================
document.addEventListener("DOMContentLoaded", async () => {
  initStatsToggle();

  // ← НОВОЕ: Создай/загрузи user из backend
  const userId = tg.initDataUnsafe?.user?.id;
  if (userId) {
    try {
      const response = await fetch(`https://mellstar-backend.onrender.com/api/user/${userId}`, {
        method: 'GET',
        headers: {
          'X-Telegram-WebApp-InitData': tg.initData || ''  // Для verify в backend
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.new_user) {
          tg.showAlert('Аккаунт создан! Добро пожаловать!');
        }
        // Замени моки реальными данными
        user = {
          level: data.level || 1,
          freePoints: data.free_points || 0,
          refPoints: data.ref_points || 0,
          payoutBonus: data.payout_bonus || 0,
          balance: data.balance || 0.0,
          progress: data.checkpoint_progress || 0,
          boostLevel: data.current_boost_level || 0,
          adSlots: [],
          subSlots: Array(5).fill(null).map((_, i) => ({ id: i, status: "empty", expires: null }))
        };
        console.log('User from API:', user);  // F12 Console для дебага
      } else {
        console.error('API error:', response.status);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    }
  }

  updateMain();
  renderAdSlots();
  initUpgradePage();

  // ← ФИКС: Добавь onclick для кнопок после DOM (если fetch задерживается)
  const infoBtn = document.getElementById("infoBtn");
  if (infoBtn) infoBtn.onclick = () => {
    alert("Подпишись на все каналы → таймер запустится → зарабатывай звёзды!");
  };

  const buySlotBtn = document.querySelector(".buy-slot");
  if (buySlotBtn) buySlotBtn.onclick = () => {
    const buyPageBtn = document.querySelector('[data-page="buy"]');
    if (buyPageBtn) buyPageBtn.click();
  };
});