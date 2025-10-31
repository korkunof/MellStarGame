// TG Web App init
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); // Полноэкранный режим

// Глобальные vars
let userId = tg.initDataUnsafe.user?.id || null;
let slots = []; // Массив слотов {id, name, link, status: 'verified'|'pending', expires: Date}
let timerInterval = null;
let progress = 0; // 0-5 чекпоинтов
let speedMultiplier = 1; // От рефералов/улучшений
let level = 1;
let payoutBonus = 0;

// Backend URL (замени на ngrok или деплой)
const API_BASE = 'http://localhost:3000'; // Или твой ngrok

// Авторизация и загрузка данных при старте
async function initApp() {
    if (!userId) {
        alert('Ошибка: Не TG-аккаунт');
        return;
    }
    tg.MainButton.setText('Заработать Stars').show().onClick(openSubscriptions);
    await loadUserData();
    renderMainPage();
}

// Загрузка данных с backend (пока заглушки, подключи эндпоинты)
async function loadUserData() {
    try {
        const res = await fetch(`${API_BASE}/user/${userId}`);
        const data = await res.json();
        slots = data.slots || [{name: 'Канал 1', link: 't.me/channel1', status: 'pending', expires: new Date(Date.now() + 7*24*60*60*1000)}]; // Заглушка
        progress = data.progress || 0;
        level = data.level || 1;
        speedMultiplier = data.speed || 1;
        payoutBonus = data.payoutBonus || 0;
        updateUI();
    } catch (e) {
        console.error('Ошибка загрузки:', e);
        // Заглушки для теста
        slots = Array(5).fill().map((_, i) => ({name: `Канал ${i+1}`, link: `t.me/channel${i+1}`, status: 'pending', expires: new Date(Date.now() + 7*24*60*60*1000)}));
    }
}

// Сохранить на backend
async function saveUserData() {
    try {
        await fetch(`${API_BASE}/user/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slots, progress, level, speedMultiplier, payoutBonus })
        });
    } catch (e) { console.error('Сохранение:', e); }
}

// Рендер главной
function renderMainPage() {
    document.getElementById('subs-count').textContent = `Подписок: ${slots.filter(s => s.status === 'verified').length}/${level * 5}`;
    document.getElementById('progress-stars').textContent = `Прогресс: ${progress * 10 + payoutBonus * progress}/50 Stars`;
}

// Открыть Подписки
function openSubscriptions() {
    document.getElementById('main-page').classList.remove('active');
    document.getElementById('subscriptions-page').classList.add('active');
    renderSubscriptions();
}

// Рендер Подписки
function renderSubscriptions() {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    const verifiedCount = slots.filter(s => s.status === 'verified').length;
    const pending = slots.length - verifiedCount;
    document.getElementById('pending-subs').textContent = pending;

    if (pending === 0) {
        document.getElementById('activation-status').style.display = 'none';
        document.getElementById('timer').classList.remove('hidden', 'red');
        document.getElementById('timer').classList.add('green');
        startTimer();
    } else {
        stopTimer();
        document.getElementById('activation-status').style.display = 'block';
        document.getElementById('timer').classList.add('hidden');
    }

    // Шкала прогресса
    const fill = document.getElementById('progress-fill');
    fill.style.width = `${(progress / 5) * 100}%`;
    document.getElementById('progress-text').textContent = `${progress}/5 чекпоинтов (${progress * 10 + payoutBonus * progress} Stars)`;

    // Слоты
    slots.forEach(slot => {
        const card = document.createElement('div');
        card.className = `slot-card ${slot.status}`;
        card.innerHTML = `
            <h4><a href="${slot.link}" target="_blank">${slot.name}</a></h4>
            <p>Живёт до: ${slot.expires.toLocaleDateString()}</p>
            <p>Статус: ${slot.status === 'verified' ? '✓ Активно' : 'Подпишись!'}</p>
        `;
        if (slot.status === 'pending') {
            card.onclick = () => verifySubscription(slot); // Проверка getChatMember
        }
        container.appendChild(card);
    });

    // Кнопки
    document.getElementById('upgrades-btn').onclick = () => showModal('upgrades');
    document.getElementById('info-btn').onclick = () => showModal('info');
    document.getElementById('buy-slot-btn').onclick = () => openBuyPage();
    document.getElementById('invite-btn').onclick = () => inviteFriend();
    document.getElementById('back-btn').onclick = () => backToMain();
}

// Проверка подписки (fetch на backend с getChatMember)
async function verifySubscription(slot) {
    try {
        const res = await fetch(`${API_BASE}/verify-sub/${userId}/${slot.link}`);
        const data = await res.json();
        if (data.verified) {
            slot.status = 'verified';
            saveUserData();
            renderSubscriptions();
            tg.showAlert('Подписка подтверждена! Таймер ускорен.');
        } else {
            tg.showAlert('Подпишись сначала!');
        }
    } catch (e) { console.error(e); }
}

// Таймер (24ч интервалы, × speed, красный ×2 назад)
let timerStart = Date.now();
let direction = 1; // 1 вперёд, -1 назад
function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - timerStart) / 1000 * speedMultiplier * direction;
        const hours = Math.floor(elapsed / 3600);
        const mins = Math.floor((elapsed % 3600) / 60);
        const secs = Math.floor(elapsed % 60);
        document.getElementById('timer-display').textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // Чекпоинт каждые 24ч (86400 сек)
        if (elapsed >= 86400 && direction > 0 && Math.floor(elapsed / 86400) > progress) {
            progress = Math.min(5, Math.floor(elapsed / 86400));
            if (progress === 5) {
                payoutStars(50 + payoutBonus * 5);
                tg.showAlert('50 Stars твои! Продолжай для большего.');
            }
            saveUserData();
            renderSubscriptions();
        }

        // Откат при отписке (симуляция, реал — Celery check)
        if (direction < 0) {
            document.getElementById('timer').classList.remove('green');
            document.getElementById('timer').classList.add('red');
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

// Проверка отписки (фоново, каждые 5 мин)
setInterval(async () => {
    // Fetch на backend для check all slots
    // Если отписка: direction = -1; speedMultiplier *= 2; (но чекпоинт спасает)
}, 300000);

// Выплата Stars (TG Stars API)
async function payoutStars(amount) {
    try {
        await tg.openInvoice('pay_stars', amount, 'Заработанные Stars'); // Или fetch на backend для sendStars
    } catch (e) { console.error(e); }
}

// Реферал
function inviteFriend() {
    const refLink = `https://t.me/MellStarGameBot?start=ref_${userId}`;
    tg.shareUrl(refLink, 'Пригласи друга в MellStarGameBot — скип чекпоинта +5% скорости!');
    // Backend: +1 реферал, speed += 0.05
    speedMultiplier += 0.05;
    saveUserData();
    tg.showAlert('Ссылка отправлена! За друга — бонус.');
}

// Модалки
function showModal(type) {
    document.getElementById(`${type}-modal`).classList.remove('hidden');
    if (type === 'upgrades') {
        document.getElementById('speed-level').textContent = `${(speedMultiplier - 1) * 100}%`;
        document.getElementById('level').textContent = level;
        document.getElementById('payout-bonus').textContent = payoutBonus;
        document.getElementById('next-upgrade-cost').textContent = 50 * Math.pow(2, payoutBonus);
    }
}
document.getElementById('close-modal').onclick = () => document.getElementById('upgrades-modal').classList.add('hidden');
document.getElementById('close-info').onclick = () => document.getElementById('info-modal').classList.add('hidden');

// Применить улучшения
document.getElementById('apply-upgrades').onclick = () => {
    const points = parseInt(document.getElementById('slots-points').value);
    if (points > 50 - level) return tg.showAlert('Недостаточно очков!');
    level += points;
    saveUserData();
    showModal('upgrades'); // Refresh
};

// Купить улучшение выплат
document.getElementById('buy-upgrade').onclick = async () => {
    const cost = 50 * Math.pow(2, payoutBonus);
    // TG Stars payment
    try {
        await tg.openInvoice('upgrade_payout', cost, 'Улучшить выплаты');
        payoutBonus++;
        saveUserData();
        showModal('upgrades');
    } catch (e) { tg.showAlert('Платёж отменён'); }
};

// Покупка слота
function openBuyPage() {
    document.getElementById('subscriptions-page').classList.remove('active');
    document.getElementById('buy-page').classList.add('active');
    updateCost();
}
document.getElementById('back-buy').onclick = () => {
    document.getElementById('buy-page').classList.remove('active');
    document.getElementById('subscriptions-page').classList.add('active');
};
document.getElementById('period-select').onchange = updateCost;
document.getElementById('status-select').onchange = updateCost;

function updateCost() {
    const status = document.getElementById('status-select').value;
    const period = parseInt(document.getElementById('period-select').value);
    const baseCost = status === 'standard' ? 1000 : 100000;
    const total = baseCost * period / 30; // Формула
    const shows = 1000 * (status === 'vip' ? 10 : 1) * period;
    document.getElementById('shows-estimate').textContent = `~${shows}`;
    document.getElementById('total-cost').textContent = total;
}

document.getElementById('buy-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = {
        name: document.getElementById('channel-name').value,
        link: document.getElementById('channel-link').value,
        status: document.getElementById('status-select').value,
        period: parseInt(document.getElementById('period-select').value),
        cost: parseInt(document.getElementById('total-cost').textContent)
    };
    // TG Stars payment
    try {
        await tg.openInvoice('buy_slot', formData.cost, 'Купить слот');
        // Backend: add slot to pool
        await fetch(`${API_BASE}/buy-slot`, { method: 'POST', body: JSON.stringify(formData) });
        tg.showAlert('Слот куплен! Он появится у пользователей.');
        openSubscriptions();
    } catch (e) { tg.showAlert('Платёж отменён'); }
};

// Назад
function backToMain() {
    document.getElementById('subscriptions-page').classList.remove('active');
    document.getElementById('main-page').classList.add('active');
}

// Update UI
function updateUI() {
    renderMainPage();
    if (document.getElementById('subscriptions-page').classList.contains('active')) renderSubscriptions();
}

// Events
document.getElementById('subscriptions-btn').onclick = openSubscriptions;
document.getElementById('upgrades-btn').onclick = () => showModal('upgrades'); // Пока модалка
document.getElementById('how-it-works-btn').onclick = () => tg.showAlert('Подпишись, удержи — Stars!');

// Старт
initApp();