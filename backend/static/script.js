// Telegram API подключение
let tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
}

// Навигация
const navBtns = document.querySelectorAll(".nav-btn");
const pages = document.querySelectorAll(".page");

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    navBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    pages.forEach((p) => p.classList.remove("active"));
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

// Данные пользователя (заглушка)
let user = {
  name: tg?.initDataUnsafe?.user?.first_name || "Гость",
  level: 1,
  points: 5,
  referrals: 0,
  balance: 120,
};

// Отображение имени и статистики
document.getElementById("username").textContent = user.name;
document.getElementById("level").textContent = user.level;
document.getElementById("points").textContent = user.points;
document.getElementById("referrals").textContent = user.referrals;
document.getElementById("balance").textContent = user.balance;

// --- СЛОТЫ ---
const slotsPanel = document.getElementById("slotsPanel");
const subsContainer = document.getElementById("subsContainer");

function createSlotCard(slot, isEmpty = false) {
  const div = document.createElement("div");
  div.className = "slot-card" + (isEmpty ? " empty" : "");
  div.innerHTML = isEmpty
    ? `<span>Слот свободен</span>`
    : `<span>${slot.title}</span><strong>${slot.status}</strong>`;
  return div;
}

// Главная статистика рекламных слотов
const slotsData = [
  { title: "Канал A", status: "Активен" },
  { title: "Канал B", status: "Завершён" },
];
slotsData.forEach((slot) => slotsPanel.appendChild(createSlotCard(slot)));
for (let i = slotsData.length; i < 3; i++) {
  slotsPanel.appendChild(createSlotCard(null, true));
}

// Подписки (всегда 5 слотов)
for (let i = 0; i < 5; i++) {
  subsContainer.appendChild(createSlotCard(null, true));
}

// --- ПРОКАЧКА ---
const freePointsEl = document.getElementById("freePoints");
document.querySelectorAll(".btn-upgrade").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (user.points <= 0) return tg?.showAlert?.("Нет очков для прокачки");
    user.points--;
    freePointsEl.textContent = user.points;
    btn.textContent = "✅ Прокачано";
    btn.disabled = true;
    setTimeout(() => (btn.textContent = "+ Прокачать", btn.disabled = false), 3000);
  });
});

// --- ПОКУПКА СЛОТОВ ---
const slotType = document.getElementById("slotType");
const slotViews = document.getElementById("slotViews");
const slotDays = document.getElementById("slotDays");
const slotTotal = document.getElementById("slotTotal");

function updateTotal() {
  const base = slotType.value === "vip" ? 5000 : 1000;
  const views = parseInt(slotViews.value);
  const days = parseInt(slotDays.value);
  const total = base * days + views * 0.2 * days;
  slotTotal.textContent = total.toFixed(0);
}
[slotType, slotViews, slotDays].forEach((el) =>
  el.addEventListener("input", updateTotal)
);
updateTotal();

document.getElementById("buyBtn").addEventListener("click", () => {
  tg?.showAlert?.(`Слот куплен на ${slotDays.value} дн. за ${slotTotal.textContent}⭐`);
});
