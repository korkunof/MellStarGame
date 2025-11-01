// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// Глобальные переменные (расширенные по механикам)
let userId = tg.initDataUnsafe.user?.id || null;
let userName = tg.initDataUnsafe.user?.first_name || 'Пользователь';
let slots = []; // {name, link, logo, status: 'empty'|'pending'|'verified', expires}
let timerInterval = null;
let progress = 0; // 0-5 чекпоинтов
let level = 1; // 1-45
let points = 0; // Доступные очки от уровней
let allocatedPoints = 0; // Распределено на слоты
let referralPoints = 0; // От приглашений
let boostLevel = 0; // 0-4 Разгон (+25% каждый)
let refLevelBonus = 0; // + к уровню от рефералов (max 45)
let payoutBonus = 0; // + к 10 Stars/check
const payoutCosts = [10,11,13,17,24,36,58,98,127,166,215,280,364,473,615,677,744,819,860,903,948,995,1045,1066,1087,1109,1131,1154,1177,1188,1200,1212,1224,1237,1249,1261,1274,1287,1300]; // Массив стоимостей
let adSlots = []; // Купленные {name, link, logo, subs, timeLeft}
let totalUsers = 100; // Активных пользователей
const maxLevel = 45;
const showsOptions = [100,250,500,1000,3000,5000,7000,10000,20000,35000,50000,100000];
const baseTick = 1; // Базовый тик таймера
let direction = 1; // 1 вперёд, -1 назад
let timerStart = Date.now();

const API_BASE = 'https://mellstar-backend.onrender.com';

// Инициализация приложения
async function initApp() {
    console.log('initApp запущена'); // Отладка
    if (!userId) return alert('Ошибка: Не аккаунт Telegram');
    document.getElementById('user-name').textContent = userName;
    tg.MainButton.hide(); // Навигация берёт на себя
    await loadUserData();
    switchPage('main');
}

// Загрузка данных пользователя (fetch или заглушки)
async function loadUserData() {
    console.log('loadUserData запущена'); // Отладка
    try {
        const res = await fetch(`${API_BASE}/user/${userId}`);
        const data = await res.json();
        slots = data.slots || Array(5).fill({name: 'Слот пустой', status: 'empty', link: '', logo: ''});
        progress = data.progress || 0;
        level = data.level || 1;
        points = data.points || 0;
        allocatedPoints = data.allocatedPoints || 0;
        referralPoints = data.referralPoints || 0;
        boostLevel = data.boostLevel || 0;
        refLevelBonus = data.refLevelBonus || 0;
        payoutBonus = data.payoutBonus || 0;
        adSlots = data.adSlots || [];
        totalUsers = data.totalUsers || 100;
        console.log('Данные загружены:', data); // Отладка
    } catch (e) {
        console.error('Ошибка загрузки:', e);
        slots = Array(5).fill({name: 'Слот пустой', status: 'empty', link: '', logo: ''});
        totalUsers = 100; // Заглушка
    }
    updateSpeed();
    renderShowsOptions();
    updateUI();
}

// Сохранение данных пользователя
async function saveUserData() {
    console.log('saveUserData запущена'); // Отладка
    try {
        await fetch(`${API_BASE}/user/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slots, progress, level, points, allocatedPoints, referralPoints, boostLevel, refLevelBonus, payoutBonus, adSlots, totalUsers })
        });
    } catch (e) { console.error('Ошибка сохранения:', e); }
}

// Переключение страниц + рендер
function switchPage(pageId) {
    console.log(`Переключение на ${pageId}`); // Отладка
    const pageElement = document.getElementById(`${pageId}-page`);
    if (!pageElement) {
        console.error(`Страница ${pageId}-page не найдена!`); // Отладка, если ID неверный
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    pageElement.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btnElement = document.getElementById(`${pageId}-btn`);
    if (btnElement) btnElement.classList.add('active');
    else console.error(`Кнопка ${pageId}-btn не найдена!`); // Отладка
    tg.MainButton.hide();
    if (pageId === 'main') renderMainPage();
    if (pageId === 'subscriptions') renderSubscriptions();
    if (pageId === 'upgrades') renderUpgradesPage();
    if (pageId === 'buy') renderBuyPage();
}

// Рендер главной страницы (полный)
function renderMainPage() {
    console.log('renderMainPage запущена'); // Отладка
    const effLevel = Math.min(maxLevel, level + refLevelBonus);
    document.getElementById('level-display').textContent = effLevel;
    document.getElementById('points-available').textContent = points;
    document.getElementById('points-allocated').textContent = allocatedPoints;
    document.getElementById('slots-count').textContent = 5 + allocatedPoints;
    document.getElementById('referrals-count').textContent = referralPoints;
    document.getElementById('boost-level').textContent = boostLevel * 25;
    document.getElementById('payout-bonus-display').textContent = payoutBonus;
    document.getElementById('total-payout-display').textContent = 10 + payoutBonus;
    document.getElementById('total-users-display').textContent = totalUsers;

    const adList = document.getElementById('ad-slots-stats');
    if (adList) {
        adList.innerHTML = '';
        adSlots.forEach(slot => {
            const li = document.createElement('li');
            li.innerHTML = `${slot.name}: ${slot.subs || 0} подписок, осталось ${slot.timeLeft || 0} дней`;
            adList.appendChild(li);
        });
    }
}

// Рендер страницы подписок (полный)
function renderSubscriptions() {
    console.log('renderSubscriptions запущена'); // Отладка
    const container = document.getElementById('slots-container');
    if (!container) return console.error('slots-container не найдена');
    container.innerHTML = '';
    let pending = 0;
    slots.forEach(slot => {
        const card = document.createElement('div');
        card.className = `slot-card ${slot.status}`;
        if (slot.status === 'empty') {
            card.innerHTML = '<h4>Слот пустой</h4><p>Ожидает заполнения</p>';
        } else {
            card.innerHTML = `
                <img src="${slot.logo || 'https://via.placeholder.com/50?text=Лого'}" alt="Лого">
                <div>
                    <h4><a href="${slot.link}" target="_blank">${slot.name}</a></h4>
                    <p>Живёт до: ${slot.expires ? slot.expires.toLocaleDateString() : 'N/A'}</p>
                    <p>Статус: ${slot.status === 'verified' ? '✓ Активно' : 'Подпишись!'}</p>
                </div>
            `;
            if (slot.status === 'pending') {
                card.onclick = () => verifySubscription(slot);
                pending++;
            }
        }
        container.appendChild(card);
    });
    document.getElementById('pending-subs').textContent = pending;

    const statusEl = document.getElementById('activation-status');
    const timerEl = document.getElementById('timer');
    if (pending === 0 && slots.filter(s => s.status !== 'empty').length > 0) {
        statusEl.style.display = 'none';
        timerEl.classList.remove('hidden', 'red');
        timerEl.classList.add('green');
        startTimer();
    } else {
        statusEl.style.display = 'block';
        timerEl.classList.add('hidden');
        stopTimer();
    }

    document.getElementById('progress-fill').style.width = `${(progress / 5) * 100}%`;
    document.getElementById('progress-text').textContent = `${progress}/5 чекпоинтов (${progress * (10 + payoutBonus)} Stars)`;
}

// Рендер страницы прокачки (полный)
function renderUpgradesPage() {
    console.log('renderUpgradesPage запущена'); // Отладка
    const effLevel = Math.min(maxLevel, level + refLevelBonus);
    document.getElementById('level').textContent = level;
    document.getElementById('level-with-bonus').textContent = effLevel;
    document.getElementById('points').textContent = points;
    document.getElementById('slots-points').max = points;
    document.getElementById('referral-points').textContent = referralPoints;
    document.getElementById('boost-level-select').value = boostLevel;
    document.getElementById('ref-level-boost').max = Math.max(0, maxLevel - effLevel);
    document.getElementById('payout-bonus').textContent = payoutBonus;
    updatePayoutCost();
}

// Рендер страницы покупки (полный)
function renderBuyPage() {
    console.log('renderBuyPage запущена'); // Отладка
    const container = document.getElementById('ad-slots-detailed');
    if (!container) return console.error('ad-slots-detailed не найдена');
    container.innerHTML = '';
    adSlots.forEach(slot => {
        const card = document.createElement('div');
        card.className = 'slot-card';
        card.innerHTML = `
            <img src="${slot.logo || 'https://via.placeholder.com/50?text=Лого'}" alt="Лого">
            <div>
                <h4>${slot.name}</h4>
                <p>${slot.subs || 0} подписок, осталось ${slot.timeLeft || 0} дней</p>
            </div>
        `;
        container.appendChild(card);
    });
    updateCost();
}

// Динамические опции показов/периода (полный)
function renderShowsOptions() {
    console.log('renderShowsOptions запущена'); // Отладка
    const select = document.getElementById('shows-select');
    if (!select) return console.error('shows-select не найдена');
    select.innerHTML = '';
    showsOptions.filter(s => s <= totalUsers).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `${s} показов`;
        select.add(opt);
    });
    document.getElementById('max-shows').textContent = showsOptions.findLast(s => s <= totalUsers) || 100;

    const periodSelect = document.getElementById('period-select');
    if (!periodSelect) return console.error('period-select не найдена');
    periodSelect.innerHTML = '';
    for (let d = 1; d <= 30; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} дней`;
        periodSelect.add(opt);
    }
}

// Проверка подписки (полный)
async function verifySubscription(slot) {
    console.log('verifySubscription clicked'); // Отладка
    try {
        const res = await fetch(`${API_BASE}/verify-sub/${userId}/${slot.link}`);
        const data = await res.json();
        if (data.verified) {
            slot.status = 'verified';
            saveUserData();
            renderSubscriptions();
            tg.showAlert('Подписка подтверждена!');
        } else {
            tg.showAlert('Подпишись сначала!');
        }
    } catch (e) { console.error(e); }
}

// Таймер (полный)
function startTimer() {
    console.log('startTimer запущена'); // Отладка
    stopTimer();
    timerInterval = setInterval(() => {
        const elapsed = ((Date.now() - timerStart) / 1000) * (baseTick + allocatedPoints * 0.088) * direction * (1 + boostLevel * 0.25);
        const hours = Math.floor(elapsed / 3600);
        const mins = Math.floor((elapsed % 3600) / 60);
        const secs = Math.floor(elapsed % 60);
        document.getElementById('timer-display').textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (elapsed >= 86400 && direction > 0) {
            const newProgress = Math.floor(elapsed / 86400);
            if (newProgress > progress) {
                progress += newProgress - progress;
                if (progress >= 5) {
                    const amount = 5 * (10 + payoutBonus);
                    payoutStars(amount);
                    progress = 0; // Сброс
                    updateLevel();
                    tg.showAlert(`Выплата ${amount} Stars! Уровень обновлён.`);
                }
                saveUserData();
                renderSubscriptions();
            }
        }

        if (direction < 0) {
            document.getElementById('timer').classList.add('red');
        } else {
            document.getElementById('timer').classList.remove('red');
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

// Обновление уровня (полный)
function updateLevel() {
    let required = 1; // Для lvl 2
    for (let l = level; l < maxLevel; l++) {
        if (progress >= required) {
            level = l + 1;
            points += 1;
            required = Math.ceil(required * 1.5); // Следующий required
        } else break;
    }
}

// Приглашение друга (полный)
function inviteFriend() {
    console.log('inviteFriend clicked'); // Отладка
    const refLink = `https://t.me/MellStarGameBot?start=ref_${userId}`;
    tg.shareUrl(refLink, 'Пригласи друга в MellStarGameBot — +поинт реферала!');
    referralPoints += 1; // Позже подтверждение с backend
    saveUserData();
    tg.showAlert('Ссылка отправлена! За друга — поинт.');
}

// Применить слоты (полный)
document.getElementById('apply-slots').onclick = () => {
    console.log('apply-slots clicked'); // Отладка
    const add = parseInt(document.getElementById('slots-points').value);
    if (add > points) return tg.showAlert('Недостаточно очков!');
    allocatedPoints += add;
    points -= add;
    updateSpeed();
    saveUserData();
    renderUpgradesPage();
    tg.showAlert('Слоты прокачаны! Таймер ускорен.');
};

// Применить разгон (полный)
document.getElementById('apply-boost').onclick = () => {
    console.log('apply-boost clicked'); // Отладка
    const newBoost = parseInt(document.getElementById('boost-level-select').value);
    const cost = newBoost - boostLevel;
    if (cost > referralPoints) return tg.showAlert('Недостаточно поинтов!');
    boostLevel = newBoost;
    referralPoints -= cost;
    saveUserData();
    renderUpgradesPage();
    tg.showAlert('Разгон применён!');
};

// Применить +lvl (полный)
document.getElementById('apply-ref-level').onclick = () => {
    console.log('apply-ref-level clicked'); // Отладка
    const add = parseInt(document.getElementById('ref-level-boost').value);
    const effLevel = level + refLevelBonus;
    if (add > referralPoints || effLevel + add > maxLevel) return tg.showAlert('Недостаточно или максимальный уровень!');
    refLevelBonus += add;
    referralPoints -= add;
    saveUserData();
    renderUpgradesPage();
    tg.showAlert('+Уровень применён!');
};

// Купить прокачку выплат (полный)
document.getElementById('buy-payout').onclick = () => {
    console.log('buy-payout clicked'); // Отладка
    const add = parseInt(document.getElementById('payout-increase').value);
    const cost = payoutCosts.slice(payoutBonus, payoutBonus + add).reduce((sum, c) => sum + c, 0);
    try {
        tg.openInvoice('upgrade_payout', cost, `+${add} к выплатам`);
        payoutBonus += add;
        saveUserData();
        renderUpgradesPage();
        tg.showAlert('Выплаты прокачаны!');
    } catch (e) { tg.showAlert('Отменено'); }
};

document.getElementById('payout-increase').oninput = updatePayoutCost;

function updatePayoutCost() {
    const add = parseInt(document.getElementById('payout-increase').value);
    const cost = payoutCosts.slice(payoutBonus, payoutBonus + add).reduce((sum, c) => sum + c, 0);
    document.getElementById('payout-cost').textContent = cost;
}

// Форма покупки слота (полный)
document.getElementById('buy-form').onsubmit = async (e) => {
    console.log('buy-form submitted'); // Отладка
    e.preventDefault();
    const status = document.getElementById('status-select').value;
    const shows = parseInt(document.getElementById('shows-select').value);
    const period = parseInt(document.getElementById('period-select').value);
    const base = status === 'standard' ? 1000 : 5000;
    const cost = base * period + shows * 0.2 * period;
    const formData = { name: document.getElementById('channel-name').value, link: document.getElementById('channel-link').value, status, shows, period, cost };
    try {
        await tg.openInvoice('buy_slot', cost, 'Купить слот');
        await fetch(`${API_BASE}/buy-slot`, { method: 'POST', body: JSON.stringify(formData) });
        adSlots.push({ name: formData.name, link: formData.link, logo: 'https://via.placeholder.com/50?text=Лого', subs: 0, timeLeft: period });
        saveUserData();
        renderBuyPage();
        tg.showAlert('Слот куплен! VIP приоритет.');
    } catch (e) { tg.showAlert('Отменено'); }
};

function updateCost() {
    const status = document.getElementById('status-select').value;
    const shows = parseInt(document.getElementById('shows-select').value || 100);
    const period = parseInt(document.getElementById('period-select').value || 1);
    const base = status === 'standard' ? 1000 : 5000;
    const total = base * period + shows * 0.2 * period;
    document.getElementById('total-cost').textContent = total;
}
document.getElementById('status-select').onchange = updateCost;
document.getElementById('shows-select').onchange = updateCost;
document.getElementById('period-select').onchange = updateCost;

// Модальное окно информации
document.getElementById('info-btn').onclick = () => {
    document.getElementById('info-modal').classList.remove('hidden');
};
document.getElementById('close-info').onclick = () => {
    document.getElementById('info-modal').classList.add('hidden');
};

// Привязка событий к кнопкам навигации (обёрнуто в DOMContentLoaded)
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM готова, привязываю навигацию'); // Отладка
    document.getElementById('main-btn').onclick = () => switchPage('main');
    document.getElementById('subs-btn').onclick = () => switchPage('subscriptions');
    document.getElementById('upgrades-btn').onclick = () => switchPage('upgrades');
    document.getElementById('buy-btn').onclick = () => switchPage('buy');
    // Привязка других элементов (применить, форма и т.д.)
    document.getElementById('invite-btn').onclick = inviteFriend;
    document.getElementById('apply-slots').onclick = () => {
        console.log('apply-slots clicked'); // Отладка
        const add = parseInt(document.getElementById('slots-points').value);
        if (add > points) return tg.showAlert('Недостаточно очков!');
        allocatedPoints += add;
        points -= add;
        updateSpeed();
        saveUserData();
        renderUpgradesPage();
        tg.showAlert('Слоты прокачаны! Таймер ускорен.');
    };
    document.getElementById('apply-boost').onclick = () => {
        console.log('apply-boost clicked'); // Отладка
        const newBoost = parseInt(document.getElementById('boost-level-select').value);
        const cost = newBoost - boostLevel;
        if (cost > referralPoints) return tg.showAlert('Недостаточно поинтов!');
        boostLevel = newBoost;
        referralPoints -= cost;
        saveUserData();
        renderUpgradesPage();
        tg.showAlert('Разгон применён!');
    };
    document.getElementById('apply-ref-level').onclick = () => {
        console.log('apply-ref-level clicked'); // Отладка
        const add = parseInt(document.getElementById('ref-level-boost').value);
        const effLevel = level + refLevelBonus;
        if (add > referralPoints || effLevel + add > maxLevel) return tg.showAlert('Недостаточно или максимальный уровень!');
        refLevelBonus += add;
        referralPoints -= add;
        saveUserData();
        renderUpgradesPage();
        tg.showAlert('+Уровень применён!');
    };
    document.getElementById('buy-payout').onclick = () => {
        console.log('buy-payout clicked'); // Отладка
        const add = parseInt(document.getElementById('payout-increase').value);
        const cost = payoutCosts.slice(payoutBonus, payoutBonus + add).reduce((sum, c) => sum + c, 0);
        try {
            tg.openInvoice('upgrade_payout', cost, `+${add} к выплатам`);
            payoutBonus += add;
            saveUserData();
            renderUpgradesPage();
            tg.showAlert('Выплаты прокачаны!');
        } catch (e) { tg.showAlert('Отменено'); }
    };
    document.getElementById('payout-increase').oninput = updatePayoutCost;
    document.getElementById('buy-form').onsubmit = (e) => {
        console.log('buy-form submitted'); // Отладка
        e.preventDefault();
        const status = document.getElementById('status-select').value;
        const shows = parseInt(document.getElementById('shows-select').value);
        const period = parseInt(document.getElementById('period-select').value);
        const base = status === 'standard' ? 1000 : 5000;
        const cost = base * period + shows * 0.2 * period;
        const formData = { name: document.getElementById('channel-name').value, link: document.getElementById('channel-link').value, status, shows, period, cost };
        try {
            tg.openInvoice('buy_slot', cost, 'Купить слот');
            fetch(`${API_BASE}/buy-slot`, { method: 'POST', body: JSON.stringify(formData) });
            adSlots.push({ name: formData.name, link: formData.link, logo: 'https://via.placeholder.com/50?text=Лого', subs: 0, timeLeft: period });
            saveUserData();
            renderBuyPage();
            tg.showAlert('Слот куплен! VIP приоритет.');
        } catch (e) { tg.showAlert('Отменено'); }
    };
    document.getElementById('status-select').onchange = updateCost;
    document.getElementById('shows-select').onchange = updateCost;
    document.getElementById('period-select').onchange = updateCost;
    // ... (остальные привязки, если есть)
    initApp(); // Запуск инициализации здесь
});

// Обновление скорости (периодическая проверка)
function updateSpeed() {
    // Fetch /check-subs каждые 5 мин, если отписка: direction = -1
    setInterval(async () => {
        console.log('Периодическая проверка подписок'); // Отладка
        // Позже: fetch(`${API_BASE}/check-subs/${userId}`)
    }, 300000);
}

// Другие функции (полные, копируй из предыдущего кода, если нужно)
function updateLevel() {
    let required = 1; // Для lvl 2
    for (let l = level; l < maxLevel; l++) {
        if (progress >= required) {
            level = l + 1;
            points += 1;
            required = Math.ceil(required * 1.5); // Следующий required
        } else break;
    }
}

async function payoutStars(amount) {
    console.log('Выплата', amount); // Отладка
    try {
        await fetch(`${API_BASE}/payout/${userId}/${amount}`);
        tg.showAlert(`${amount} Stars на счёт!`);
    } catch (e) { console.error(e); }
}

function updatePayoutCost() {
    const add = parseInt(document.getElementById('payout-increase').value);
    const cost = payoutCosts.slice(payoutBonus, payoutBonus + add).reduce((sum, c) => sum + c, 0);
    document.getElementById('payout-cost').textContent = cost;
}

function updateCost() {
    const status = document.getElementById('status-select').value;
    const shows = parseInt(document.getElementById('shows-select').value || 100);
    const period = parseInt(document.getElementById('period-select').value || 1);
    const base = status === 'standard' ? 1000 : 5000;
    const total = base * period + shows * 0.2 * period;
    document.getElementById('total-cost').textContent = total;
}

// Обновление UI (полный)
function updateUI() {
    console.log('updateUI запущена'); // Отладка
    // Вызов всех рендеров, если нужно
}