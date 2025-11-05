// ===================================
// [ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP]
// ===================================
const tg = window.Telegram.WebApp;
tg.ready(); 
tg.expand();

// Получаем имя пользователя
const username = tg.initDataUnsafe?.user?.first_name || "Гость";
document.getElementById("username").textContent = username;

// ===================================
// [ДАННЫЕ ПОЛЬЗОВАТЕЛЯ]
// ===================================
let user = {
  level: 1,
  freePoints: 0,
  referrals: 0,
  refPoints: 0,
  boostLevel: 0,
  payoutBonus: 0,
  balance: 0,
  progress: 0,
  adSlots: [],
  subSlots: Array(5).fill(null).map((_, i) => ({ id: i, status: "empty", expires: null }))
};

// Таблица стоимости улучшения выплат
const payoutCosts = [10,11,13,17,24,36,58,98,127,166,215,280,364,473,615,677,744,819,860,903,948,995,1045,1066,1087,1109,1131,1154,1177,1188,1200,1212,1224,1237,1249,1261,1274,1287,1300];

// ===================================
// [НАВИГАЦИЯ] — НИЖНЕЕ МЕНЮ
// ===================================
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(btn.dataset.page).classList.add("active");
  };
});

// ===================================
// [ГЛАВНАЯ СТРАНИЦА] — ОБНОВЛЕНИЕ СТАТИСТИКИ
// ===================================
function updateMain() {
  document.getElementById("level").textContent = user.level;
  document.getElementById("freePoints").textContent = user.freePoints;
  document.getElementById("refPoints").textContent = user.refPoints;

  const active = user.subSlots.filter(s => s.status === "active").length;
  const total = user.subSlots.length;
  document.getElementById("activeSlots").textContent = `${active} / ${total}`;

  const now = Date.now();
  const nearest = user.subSlots
    .filter(s => s.status === "active" && s.expires)
    .map(s => s.expires)
    .sort((a, b) => a - b)[0];
  document.getElementById("nextSlotTime").textContent = nearest ? formatTimeLeft(nearest - now) : "-";

  document.getElementById("payoutPer").textContent = 10 + user.payoutBonus;
  const speed = 1 + (user.level - 1) * 0.088 + user.boostLevel * 0.25;
  document.getElementById("timerSpeed").textContent = `${speed.toFixed(3).replace('.', ',')} сек.`;
}
updateMain();

// ===================================
// [СТРАНИЦА ПОДПИСОК] — СЛОТЫ И ТАЙМЕР
// ===================================
function renderSubs() {
  const cont = document.getElementById("slotsContainer");
  cont.innerHTML = "";
  user.subSlots.forEach(slot => {
    const div = document.createElement("div");
    div.className = `slot-card ${slot.status}`;
    const timeLeft = slot.expires ? formatTimeLeft(slot.expires - Date.now()) : "";
    div.innerHTML = slot.status === "empty" ? "Слот пустой" : `${slot.name || "Канал"}<br><small>Активен до ${timeLeft}</small>`;
    cont.appendChild(div);
  });

  const pending = user.subSlots.filter(s => s.status === "pending").length;
  if (pending > 0) {
    document.getElementById("timerBox").classList.add("hidden");
  } else {
    document.getElementById("timerBox").classList.remove("hidden");
    startTimer();
  }

  const totalHours = 96;
  const percent = (user.progress / totalHours) * 100;
  document.getElementById("progressFill").style.width = `${percent}%`;
  document.getElementById("progressText").textContent = `${user.progress} / ${totalHours} часов`;

  const checkpoints = document.querySelectorAll('.checkpoint');
  checkpoints.forEach((cp, i) => {
    cp.classList.toggle('active', user.progress >= (i + 1) * 24);
  });
}
renderSubs();

// ===================================
// [ТАЙМЕР] — ОБНОВЛЕНИЕ КАЖДЫЕ 500МС
// ===================================
let timerInterval = null;
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  let start = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const speed = 1 + (user.level - 1) * 0.088 + user.boostLevel * 0.25;
    const effective = elapsed * speed;
    const h = Math.floor(effective / 3600).toString().padStart(2, '0');
    const m = Math.floor((effective % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(effective % 60).toString().padStart(2, '0');
    document.getElementById("timerDisplay").textContent = `${h}:${m}:${s}`;
  }, 500);
}

// ===================================
// [СТРАНИЦА ПРОКАЧКИ] — УЛУЧШЕНИЯ
// ===================================
function updateUpgrade() {
  document.getElementById("pointsCounter").textContent = user.freePoints;
  document.getElementById("currLevel").textContent = user.level;
  document.getElementById("refPointsDisplay").textContent = user.refPoints;
  document.getElementById("boostLevel").textContent = user.boostLevel;
  document.getElementById("boostPercent").textContent = user.boostLevel * 25;
  document.getElementById("payoutPer").textContent = 10 + user.payoutBonus;

  const add = parseInt(document.getElementById("payoutAdd").value) || 1;
  const cost = payoutCosts.slice(user.payoutBonus, user.payoutBonus + add).reduce((a, b) => a + b, 0);
  document.getElementById("payoutCost").textContent = cost;
}
updateUpgrade();

// УРОВЕНЬ
document.getElementById("applyLevel").onclick = () => {
  const target = parseInt(document.getElementById("levelInput").value);
  if (target <= user.level || target > 45) return alert("Неверный уровень");
  const cost = target - user.level;
  if (user.freePoints < cost) return alert("Недостаточно очков");
  user.freePoints -= cost;
  user.level = target;
  updateMain(); updateUpgrade();
};

// РАЗГОН
document.getElementById("applyBoost").onclick = () => {
  if (user.refPoints < 4 || user.boostLevel >= 4) return alert("Недостаточно или максимум");
  user.refPoints -= 4;
  user.boostLevel++;
  updateUpgrade();
};

// ВЫПЛАТЫ
document.getElementById("buyPayout").onclick = () => {
  const add = parseInt(document.getElementById("payoutAdd").value);
  const cost = payoutCosts.slice(user.payoutBonus, user.payoutBonus + add).reduce((a, b) => a + b, 0);
  if (user.balance < cost) return alert("Недостаточно звёзд");
  user.balance -= cost;
  user.payoutBonus += add;
  updateMain(); updateUpgrade();
};

// ===================================
// [СТРАНИЦА ПОКУПКИ СЛОТА] — ФОРМА
// ===================================
const showsSelect = document.getElementById("slotShows");
const showsOptions = [100,250,500,1000,3000,5000,10000,20000,50000,100000];
showsOptions.forEach(s => {
  const opt = document.createElement("option"); opt.value = s; opt.textContent = s;
  showsSelect.appendChild(opt);
});

function updateCost() {
  const base = document.getElementById("slotQuality").value === "vip" ? 5000 : 1000;
  const shows = parseInt(document.getElementById("slotShows").value);
  const days = parseInt(document.getElementById("slotDays").value);
  const cost = base * days + shows * 0.2 * days;
  document.getElementById("totalCost").textContent = Math.round(cost);
}
["slotQuality", "slotShows", "slotDays"].forEach(id => {
  document.getElementById(id).oninput = updateCost;
});
updateCost();

document.getElementById("buySlotBtn").onclick = () => {
  const cost = parseInt(document.getElementById("totalCost").textContent);
  if (user.balance < cost) return alert("Недостаточно звёзд");
  user.balance -= cost;
  const name = prompt("Название канала:");
  user.adSlots.push({ name, showsLeft: parseInt(document.getElementById("slotShows").value), daysLeft: parseInt(document.getElementById("slotDays").value) });
  updateMain();
};

// ===================================
// [УТИЛИТЫ]
// ===================================
function formatTimeLeft(ms) {
  if (ms <= 0) return "истёк";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}ч ${m}м`;
}

// КНОПКИ НА СТРАНИЦЕ ПОДПИСОК
document.getElementById("inviteBtn").onclick = () => {
  const link = `https://t.me/MellStarGameBot?start=ref_${tg.initDataUnsafe.user.id}`;
  tg.shareUrl(link, "Пригласи друга и получи поинт!");
};
document.getElementById("infoBtn").onclick = () => {
  alert("Подпишись на все каналы → таймер запустится → зарабатывай звёзды!");
};

// КНОПКА "КУПИТЬ СЛОТ" НА ГЛАВНОЙ
document.querySelector(".buy-slot").onclick = () => {
  document.querySelector('[data-page="buy"]').click();
};