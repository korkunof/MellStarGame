const tg = window.Telegram?.WebApp || {};
tg.ready?.();

let user = {
  id: 1,
  name: "Пользователь",
  level: 1,
  points: 3,
  referrals: 2,
  payoutBonus: 0,
  progress: 2,
  slots: [
    { name: "Канал A", link: "#", status: "verified" },
    { name: "Канал B", link: "#", status: "pending" },
    { name: "Слот пустой", status: "empty" },
  ]
};

// Навигация
document.getElementById("main-btn").onclick = () => switchPage("main");
document.getElementById("subs-btn").onclick = () => switchPage("subscriptions");
document.getElementById("upgrades-btn").onclick = () => switchPage("upgrades");

function switchPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`${page}-page`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`${page}-btn`).classList.add("active");
}

// Главная
function renderMain() {
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("level-display").textContent = user.level;
  document.getElementById("points").textContent = user.points;
  document.getElementById("referrals-count").textContent = user.referrals;
  document.getElementById("payout-bonus").textContent = user.payoutBonus;
}
renderMain();

// Подписки
function renderSubscriptions() {
  const cont = document.getElementById("slots-container");
  cont.innerHTML = "";
  user.slots.forEach(slot => {
    const div = document.createElement("div");
    div.className = `slot-card ${slot.status}`;
    div.innerHTML = `<h4>${slot.name}</h4><p>${slot.status}</p>`;
    cont.appendChild(div);
  });

  document.getElementById("progress-fill").style.width = `${(user.progress / 5) * 100}%`;
  document.getElementById("progress-text").textContent = `${user.progress}/5 чекпоинтов`;
}
renderSubscriptions();

// Прокачка
document.getElementById("apply-slots").onclick = () => alert("Заглушка: Слот добавлен!");
document.getElementById("apply-boost").onclick = () => alert("Заглушка: Разгон применён!");
document.getElementById("buy-payout").onclick = () => alert("Заглушка: Покупка улучшения!");

// Модальное окно
document.getElementById("info-btn").onclick = () => document.getElementById("info-modal").classList.remove("hidden");
document.getElementById("close-info").onclick = () => document.getElementById("info-modal").classList.add("hidden");

// Кнопка приглашения
document.getElementById("invite-btn").onclick = () => alert("Заглушка: Ссылка для друга создана!");
