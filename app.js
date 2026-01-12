// ====== НАЧАЛО app.js ======
// Проверка зависимостей и прелоадер
(function() {
  console.log("App.js начал загрузку...");
  
  // Проверяем зависимости
  function checkDependencies() {
    const statusEl = document.getElementById('load-status');
    
    if (typeof firebase === 'undefined') {
      if (statusEl) statusEl.innerHTML = '<span style="color:red">❌ Firebase не загружен</span><br>Обновите с Ctrl+F5';
      return false;
    }
    
    if (typeof Telegram === 'undefined') {
      console.log("Telegram SDK не найден (нормально в браузере)");
    }
    
    if (statusEl) statusEl.textContent = "✅ Все зависимости загружены";
    return true;
  }
  
  // Ждем немного и проверяем
  setTimeout(() => {
    if (checkDependencies()) {
      // Скрываем прелоадер через 500мс
      setTimeout(() => {
        const preloader = document.getElementById('preloader');
        if (preloader) preloader.style.display = 'none';
      }, 500);
    } else {
      // Показываем ошибку
      document.body.style.backgroundColor = '#fff';
    }
  }, 1000);
  
})();

// Глобальные переменные
window.isDevMode = true;
window.userData = null;
window.db = null;
window.passiveIncomeInterval = null;
window.energyUpdateInterval = null;

console.log("App.js loading...");

// МАССИВ УЛУЧШЕНИЙ (ГЛОБАЛЬНЫЙ)
window.upgrades = [
  {
    id: 'click_multiplier',
    name: 'Усилитель клика',
    description: 'Увеличивает доход за клик на +1',
    basePrice: 10,
    priceIncrease: 1.5,
    type: 'click',
    effect: 1
  },
  {
    id: 'auto_clicker',
    name: 'Авто-кликер',
    description: 'Автоматически кликает 1 раз в секунду',
    basePrice: 50,
    priceIncrease: 2.0,
    type: 'passive',
    effect: 1
  },
  {
    id: 'click_factory',
    name: 'Фабрика кликов',
    description: 'Производит 5 кликов в секунду',
    basePrice: 500,
    priceIncrease: 2.5,
    type: 'passive',
    effect: 5
  },
  {
    id: 'battery',
    name: 'Батарейка',
    description: 'Увеличивает максимальную энергию на +200',
    basePrice: 100,
    priceIncrease: 1.8,
    type: 'energy',
    effectType: 'maxEnergy',
    effect: 200
  },
  {
    id: 'coffee',
    name: 'Кофе',
    description: 'Увеличивает скорость восстановления энергии на +50/час',
    basePrice: 150,
    priceIncrease: 2.0,
    type: 'energy',
    effectType: 'energyPerHour',
    effect: 50
  },
  {
    id: 'energy_drink',
    name: 'Энергетик',
    description: 'Мгновенно восстанавливает 500 энергии (одноразово)',
    basePrice: 200,
    priceIncrease: 1.5,
    type: 'energy',
    effectType: 'instant',
    effect: 500
  }
];

// ФУНКЦИЯ: Рендер магазина
function renderShop() {
  console.log("renderShop called");
  const shopTab = document.getElementById('shop-tab');
  if (!shopTab) return;
  
  if (!shopItemsEl) return;
  
  shopItemsEl.innerHTML = '';
  
  window.upgrades.forEach(upgrade => {
    const userUpgrades = window.userData?.upgrades || {};
    const level = userUpgrades[upgrade.id + 'Level'] || 0;
    const price = Math.floor(upgrade.basePrice * Math.pow(upgrade.priceIncrease, level));
    const canAfford = window.userData?.balance >= price;
    
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    const button = document.createElement('button');
    button.className = 'buy-btn';
    button.setAttribute('data-id', upgrade.id);
    button.disabled = !canAfford;
    button.textContent = canAfford ? `Купить за ${price}` : `Недостаточно средств (${price})`;
    
    card.innerHTML = `
      <h3>${upgrade.name}</h3>
      <p>${upgrade.description}</p>
      <p>Уровень: ${level}</p>
      <p>Цена: ${price} монет</p>
    `;
    card.appendChild(button);
    
    shopItemsEl.appendChild(card);
  });
  
  // Назначаем обработчики кнопок
  shopItemsEl.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const upgradeId = this.getAttribute('data-id');
      buyUpgrade(upgradeId);
    });
  });
}

// ФУНКЦИЯ: Обновление энергии по времени
function updateEnergy() {
  if (!window.userData || !window.userData.lastEnergyUpdate) return;
  
  const now = new Date();
  const lastUpdate = window.userData.lastEnergyUpdate.toDate 
    ? window.userData.lastEnergyUpdate.toDate() 
    : new Date(window.userData.lastEnergyUpdate);
  
  const hoursPassed = (now - lastUpdate) / (1000 * 60 * 60);
  
  if (hoursPassed > 0) {
    const energyToAdd = hoursPassed * (window.userData.energyPerHour || 100);
    const oldEnergy = Math.floor(window.userData.energy || 0);
    window.userData.energy = Math.min(
      (window.userData.energy || 0) + energyToAdd,
      window.userData.maxEnergy || 1000
    );
    // Округляем энергию до целых
    window.userData.energy = Math.floor(window.userData.energy);
    
    // Обновляем в Firestore только если энергия изменилась
    if (window.userData.energy !== oldEnergy && window.db) {
      window.db.collection('users').doc(window.userData.userId).update({
        energy: window.userData.energy,
        lastEnergyUpdate: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        // Обновляем lastEnergyUpdate в локальных данных
        window.userData.lastEnergyUpdate = firebase.firestore.FieldValue.serverTimestamp();
        updateEnergyUI();
        console.log(`updateEnergy: Энергия обновлена: ${oldEnergy} -> ${window.userData.energy}`);
      }).catch(err => {
        console.error('Ошибка обновления энергии:', err);
      });
    } else if (window.userData.energy !== oldEnergy) {
      // Обновляем UI даже если нет подключения к БД
      updateEnergyUI();
    }
  }
}

// ФУНКЦИЯ: Пассивный доход
function applyPassiveIncome() {
  if (!window.userData || !window.db) return;
  
  const passiveIncome = window.userData.passiveIncome || 0;
  if (passiveIncome > 0) {
    const newBalance = window.userData.balance + passiveIncome;
    window.userData.balance = newBalance;
    
    window.db.collection("users").doc(window.userData.userId).update({
      balance: firebase.firestore.FieldValue.increment(passiveIncome),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    updateUI();
  }
}

// ФУНКЦИЯ: Покупка улучшения
async function buyUpgrade(upgradeId) {
  console.log("buyUpgrade called:", { upgradeId, balance: window.userData?.balance, upgrades: window.userData?.upgrades });
  
  if (!window.userData || !window.db) {
    console.error("buyUpgrade: Данные не загружены");
    return;
  }
  
  const upgrade = window.upgrades.find(u => u.id === upgradeId);
  if (!upgrade) {
    console.error("buyUpgrade: Улучшение не найдено:", upgradeId);
    return;
  }
  
  const userUpgrades = window.userData.upgrades || {};
  const level = userUpgrades[upgrade.id + 'Level'] || 0;
  const price = Math.floor(upgrade.basePrice * Math.pow(upgrade.priceIncrease, level));
  
  console.log("buyUpgrade: Проверка покупки:", { upgrade: upgrade.name, level, price, balance: window.userData.balance });
  
  if (window.userData.balance < price) {
    console.log("buyUpgrade: Недостаточно средств", { balance: window.userData.balance, price });
    return;
  }
  
  // Вычитаем цену
  window.userData.balance -= price;
  
  // Обновляем статистику заработанного (при покупке тоже считаем как активность)
  updateEarnedStats(price);
  
  // Увеличиваем уровень
  userUpgrades[upgrade.id + 'Level'] = level + 1;
  window.userData.upgrades = userUpgrades;
  
  // Пересчитываем статистику на основе ВСЕХ улучшений
  recalculateStats();
  
  // Обработка улучшений энергии
  if (upgrade.type === 'energy') {
    if (upgrade.effectType === 'maxEnergy') {
      window.userData.maxEnergy += upgrade.effect;
      // Если максимальная энергия увеличилась, увеличиваем и текущую
      window.userData.energy = Math.min(
        window.userData.energy + upgrade.effect,
        window.userData.maxEnergy
      );
    } else if (upgrade.effectType === 'energyPerHour') {
      window.userData.energyPerHour += upgrade.effect;
    } else if (upgrade.effectType === 'instant') {
      window.userData.energy = Math.min(
        (window.userData.energy || 0) + upgrade.effect,
        window.userData.maxEnergy || 1000
      );
    }
    // Округляем энергию до целых
    window.userData.energy = Math.floor(window.userData.energy);
    console.log(`buyUpgrade: Улучшение энергии применено:`, {
      type: upgrade.effectType,
      effect: upgrade.effect,
      energy: window.userData.energy,
      maxEnergy: window.userData.maxEnergy,
      energyPerHour: window.userData.energyPerHour
    });
  }
  
  // Сохраняем в Firestore
  await window.db.collection("users").doc(window.userData.userId).update({
    balance: window.userData.balance,
    perClickValue: window.userData.perClickValue,
    passiveIncome: window.userData.passiveIncome,
    upgrades: window.userData.upgrades,
    energy: window.userData.energy,
    maxEnergy: window.userData.maxEnergy,
    energyPerHour: window.userData.energyPerHour,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  console.log(`buyUpgrade: Куплено ${upgrade.name}, уровень: ${level + 1}, новые значения:`, {
    perClickValue: window.userData.perClickValue,
    passiveIncome: window.userData.passiveIncome,
    energy: window.userData.energy,
    maxEnergy: window.userData.maxEnergy
  });
  
  updateUI();
  renderShop();

  // Перезапускаем пассивный доход если он изменился
  if (upgrade.type === 'passive' && window.userData.passiveIncome > 0) {
    if (window.passiveIncomeInterval) {
      clearInterval(window.passiveIncomeInterval);
    }
    window.passiveIncomeInterval = setInterval(applyPassiveIncome, 1000);
    console.log("buyUpgrade: Пассивный доход обновлен:", window.userData.passiveIncome, "в секунду");
  }
}

// ФУНКЦИЯ: Пересчет статистики на основе всех улучшений
function recalculateStats() {
  if (!window.userData || !window.upgrades) return;
  
  let totalPerClick = 1; // Базовое значение
  let totalPassive = 0;
  let totalMaxEnergy = 1000; // Базовое значение
  let totalEnergyPerHour = 100; // Базовое значение
  
  window.upgrades.forEach(upgrade => {
    const level = window.userData.upgrades?.[upgrade.id + 'Level'] || 0;
    if (level > 0) {
      if (upgrade.type === 'click') {
        totalPerClick += upgrade.effect * level;
      } else if (upgrade.type === 'passive') {
        totalPassive += upgrade.effect * level;
      } else if (upgrade.type === 'energy') {
        if (upgrade.effectType === 'maxEnergy') {
          totalMaxEnergy += upgrade.effect * level;
        } else if (upgrade.effectType === 'energyPerHour') {
          totalEnergyPerHour += upgrade.effect * level;
        }
      }
    }
  });
  
  window.userData.perClickValue = totalPerClick;
  window.userData.passiveIncome = totalPassive;
  
  // Обновляем максимальную энергию (если увеличилась, увеличиваем и текущую)
  const oldMaxEnergy = window.userData.maxEnergy || 1000;
  window.userData.maxEnergy = totalMaxEnergy;
  if (totalMaxEnergy > oldMaxEnergy) {
    window.userData.energy = Math.min(window.userData.energy || 1000, totalMaxEnergy);
  }
  
  window.userData.energyPerHour = totalEnergyPerHour;
  
  console.log("Статистика пересчитана:", { 
    perClick: totalPerClick, 
    passive: totalPassive,
    maxEnergy: totalMaxEnergy,
    energyPerHour: totalEnergyPerHour
  });
}

// ФУНКЦИЯ: Остановка пассивного дохода
function stopPassiveIncome() {
  if (window.passiveIncomeInterval) {
    clearInterval(window.passiveIncomeInterval);
    window.passiveIncomeInterval = null;
    console.log("Пассивный доход остановлен");
  }
}

// ========== РЕФЕРАЛЬНАЯ СИСТЕМА ==========

// Генерация реферальной ссылки
function generateReferralLink() {
  const userId = window.userData?.userId;
  if (!userId) return '';
  
  if (window.isDevMode) {
    // В режиме разработки - локальная ссылка с параметром
    return `${window.location.origin}${window.location.pathname}?ref=${userId}`;
  } else {
    // В Telegram - генерируем ссылку на бота
    // Нужно заменить 'your_bot' на реальное имя вашего бота
    // Или получить его из конфигурации
    const botUsername = 'your_bot'; // TODO: Замените на имя вашего бота
    
    // Используем формат для Telegram Bot с параметром start
    // Параметр start будет доступен в initDataUnsafe.start_param
    return `https://t.me/${botUsername}?start=ref_${userId}`;
  }
}

// Обновление интерфейса рефералов
function updateReferralsUI() {
  if (!window.userData) return;
  
  // Статистика
  const referralsCount = window.userData.referrals?.length || 0;
  const referralsEarned = window.userData.referralsEarned || 0;
  
  const countEl = document.getElementById('referrals-count');
  const earnedEl = document.getElementById('referrals-earned');
  
  if (countEl) countEl.textContent = referralsCount;
  if (earnedEl) earnedEl.textContent = `${referralsEarned} монет`;
  
  // Реферальная ссылка
  const linkInput = document.getElementById('referral-link');
  if (linkInput) {
    linkInput.value = generateReferralLink();
  }
  
  // Список рефералов
  const listContent = document.getElementById('referrals-list-content');
  if (!listContent) return;
  
  if (referralsCount === 0) {
    listContent.innerHTML = '<p class="empty-list">Вы еще никого не пригласили</p>';
  } else {
    listContent.innerHTML = '<p>Загрузка списка рефералов...</p>';
    // TODO: позже добавим загрузку данных рефералов
  }
}

// Копирование ссылки
function setupCopyLinkButton() {
  const copyBtn = document.getElementById('copy-link-btn');
  if (!copyBtn) return;
  
  copyBtn.addEventListener('click', async function() {
    const linkInput = document.getElementById('referral-link');
    if (!linkInput) return;
    
    try {
      await navigator.clipboard.writeText(linkInput.value);
      
      // Визуальная обратная связь
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Скопировано!';
      copyBtn.style.background = '#4CAF50';
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      }, 2000);
      
      console.log('Ссылка скопирована:', linkInput.value);
    } catch (err) {
      console.error('Ошибка копирования:', err);
      // Fallback для старых браузеров
      linkInput.select();
      document.execCommand('copy');
    }
  });
}

// Обработка реферального параметра из URL или Telegram start_param
async function processReferralParam() {
  if (!window.userData || !window.db) return;
  
  let refId = null;
  
  // Проверяем start_param из Telegram (для продакшена)
  // Согласно документации, start_param находится в initDataUnsafe
  const tg = getTelegramWebApp();
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
    const startParam = tg.initDataUnsafe.start_param;
    
    if (startParam && startParam.startsWith('ref_')) {
      refId = startParam.replace('ref_', '');
      console.log('✅ Реферальный параметр найден в Telegram start_param:', refId);
    }
  }
  
  // Проверяем параметр из URL (для режима разработки или fallback)
  if (!refId) {
    const urlParams = new URLSearchParams(window.location.search);
    refId = urlParams.get('ref');
    if (refId) {
      console.log('Реферальный параметр найден в URL:', refId);
    }
  }
  
  // Также проверяем tgWebAppStartParam из URL (Telegram может передавать параметр в URL)
  if (!refId) {
    const urlParams = new URLSearchParams(window.location.search);
    const tgStartParam = urlParams.get('tgWebAppStartParam');
    if (tgStartParam && tgStartParam.startsWith('ref_')) {
      refId = tgStartParam.replace('ref_', '');
      console.log('Реферальный параметр найден в tgWebAppStartParam:', refId);
    }
  }
  
  if (!refId) {
    console.log('Реферальный параметр не найден');
    return;
  }
  
  // Нельзя пригласить себя
  if (refId === window.userData.userId) {
    console.log('Пользователь пытается пригласить себя');
    return;
  }
  
  // Проверяем, не приглашал ли уже кто-то этого пользователя
  if (window.userData.invitedBy) {
    console.log('Пользователь уже приглашен кем-то другим:', window.userData.invitedBy);
    return;
  }
  
  console.log(`Обработка реферальной ссылки от: ${refId}`);
  
  try {
    // Проверяем, существует ли приглашающий пользователь
    const inviterDoc = await window.db.collection('users').doc(refId).get();
    if (!inviterDoc.exists) {
      console.log('Приглашающий пользователь не найден в базе данных');
      return;
    }
    
    // 1. Записываем кто пригласил
    await window.db.collection('users').doc(window.userData.userId).update({
      invitedBy: refId
    });
    
    window.userData.invitedBy = refId;
    
    // 2. Добавляем реферала к приглашающему
    await window.db.collection('users').doc(refId).update({
      referrals: firebase.firestore.FieldValue.arrayUnion(window.userData.userId)
    });
    
    // 3. Начисляем бонус приглашающему (10 монет)
    await window.db.collection('users').doc(refId).update({
      balance: firebase.firestore.FieldValue.increment(10),
      referralsEarned: firebase.firestore.FieldValue.increment(10)
    });
    
    console.log('✅ Реферал успешно зарегистрирован! Бонус 10 монет начислен приглашающему.');
    
    // Обновляем UI рефералов
    updateReferralsUI();
    
  } catch (error) {
    console.error('Ошибка обработки реферала:', error);
  }
}

// ========== СИСТЕМА ЛИДЕРБОРДА ==========

// Флаг для отслеживания состояния индексов
window.indexesStatus = {
  globalIndexExists: null,
  weeklyIndexExists: null,
  checked: false
};

// Проверка индексов Firestore
async function checkAndCreateIndexes() {
  if (!window.db) {
    console.warn('Firestore не инициализирован, пропускаем проверку индексов');
    return;
  }
  
  try {
    console.log("Проверка индексов Firestore...");
    
    // Проверяем индекс для глобального лидерборда
    try {
      const testQueryGlobal = await window.db.collection('users')
        .where('leaderboardVisible', '==', true)
        .orderBy('totalEarned', 'desc')
        .limit(1)
        .get();
      
      window.indexesStatus.globalIndexExists = true;
      console.log('✅ Индекс для глобального лидерборда существует');
    } catch (error) {
      if (error.code === 'failed-precondition') {
        window.indexesStatus.globalIndexExists = false;
        console.warn('⚠️ Требуется создание индекса для глобального лидерборда');
      } else {
        console.error('Ошибка проверки индекса глобального лидерборда:', error);
      }
    }
    
    // Проверяем индекс для недельного лидерборда
    try {
      const testQueryWeekly = await window.db.collection('users')
        .where('leaderboardVisible', '==', true)
        .orderBy('weeklyEarned', 'desc')
        .limit(1)
        .get();
      
      window.indexesStatus.weeklyIndexExists = true;
      console.log('✅ Индекс для недельного лидерборда существует');
    } catch (error) {
      if (error.code === 'failed-precondition') {
        window.indexesStatus.weeklyIndexExists = false;
        console.warn('⚠️ Требуется создание индекса для недельного лидерборда');
      } else {
        console.error('Ошибка проверки индекса недельного лидерборда:', error);
      }
    }
    
    window.indexesStatus.checked = true;
    
  } catch (error) {
    console.error('Ошибка проверки индексов:', error);
  }
}

// Обновление earned полей при кликах/покупках
function updateEarnedStats(amount) {
  if (!window.userData) return;
  
  window.userData.totalEarned = (window.userData.totalEarned || 0) + amount;
  window.userData.weeklyEarned = (window.userData.weeklyEarned || 0) + amount;
  
  // Сохраняем в Firestore
  if (window.db) {
    window.db.collection('users').doc(window.userData.userId).update({
      totalEarned: firebase.firestore.FieldValue.increment(amount),
      weeklyEarned: firebase.firestore.FieldValue.increment(amount)
    });
  }
}

// Сброс недельного рейтинга (каждый понедельник)
async function resetWeeklyIfNeeded() {
  if (!window.userData || !window.db) return;
  
  try {
    const now = new Date();
    const lastReset = window.userData.lastWeeklyReset?.toDate?.() || new Date(0);
    const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));
    
    // Сбрасываем каждый понедельник (раз в 7 дней)
    if (daysSinceReset >= 7) {
      await window.db.collection('users').doc(window.userData.userId).update({
        weeklyEarned: 0,
        lastWeeklyReset: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      window.userData.weeklyEarned = 0;
      window.userData.lastWeeklyReset = firebase.firestore.FieldValue.serverTimestamp();
      console.log('Недельный рейтинг сброшен');
    }
  } catch (error) {
    console.error('Ошибка сброса недельного рейтинга:', error);
  }
}

// Загрузка глобального рейтинга
async function loadGlobalLeaderboard(limit = 20) {
  if (!window.db) return [];
  
  try {
    const usersSnapshot = await window.db.collection('users')
      .where('leaderboardVisible', '==', true)
      .orderBy('totalEarned', 'desc')
      .limit(limit)
      .get();
    
    const leaderboard = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      leaderboard.push({
        id: doc.id,
        name: data.firstName || 'Аноним',
        username: data.username,
        score: data.totalEarned || 0,
        balance: data.balance || 0,
        rank: leaderboard.length + 1
      });
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Ошибка загрузки рейтинга:', error);
    
    // Если ошибка из-за отсутствия индекса, используем fallback
    if (error.code === 'failed-precondition') {
      console.warn('Индекс отсутствует, используем fallback с сортировкой на клиенте');
      window.indexesStatus.globalIndexExists = false;
      
      // Fallback: загружаем всех видимых пользователей и сортируем на клиенте
      try {
        const allUsersSnapshot = await window.db.collection('users')
          .where('leaderboardVisible', '==', true)
          .get();
        
        const leaderboard = [];
        allUsersSnapshot.forEach(doc => {
          const data = doc.data();
          leaderboard.push({
            id: doc.id,
            name: data.firstName || 'Аноним',
            username: data.username,
            score: data.totalEarned || 0,
            balance: data.balance || 0
          });
        });
        
        // Сортируем на клиенте по totalEarned (по убыванию)
        leaderboard.sort((a, b) => b.score - a.score);
        
        // Ограничиваем количество и добавляем ранги
        return leaderboard.slice(0, limit).map((item, index) => ({
          ...item,
          rank: index + 1
        }));
      } catch (fallbackError) {
        console.error('Ошибка fallback загрузки рейтинга:', fallbackError);
        return [];
      }
    }
    
    return [];
  }
}

// Загрузка рейтинга друзей (из рефералов)
async function loadFriendsLeaderboard() {
  if (!window.userData || !window.db) return [];
  
  const friends = [];
  
  // Добавляем самого пользователя
  friends.push({
    id: window.userData.userId,
    name: window.userData.firstName || 'Вы',
    score: window.userData.totalEarned || 0,
    isCurrentUser: true
  });
  
  // Добавляем рефералов
  if (window.userData.referrals && window.userData.referrals.length > 0) {
    for (const friendId of window.userData.referrals) {
      try {
        const friendDoc = await window.db.collection('users').doc(friendId).get();
        if (friendDoc.exists) {
          const data = friendDoc.data();
          friends.push({
            id: friendId,
            name: data.firstName || 'Друг',
            score: data.totalEarned || 0,
            isReferral: true
          });
        }
      } catch (error) {
        console.error('Ошибка загрузки друга:', error);
      }
    }
  }
  
  // Сортируем по очкам
  return friends.sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

// Загрузка недельного рейтинга
async function loadWeeklyLeaderboard(limit = 20) {
  if (!window.db) return [];
  
  try {
    // Сначала сбросим старые недельные данные если нужно
    await resetWeeklyIfNeeded();
    
    const usersSnapshot = await window.db.collection('users')
      .where('leaderboardVisible', '==', true)
      .orderBy('weeklyEarned', 'desc')
      .limit(limit)
      .get();
    
    const leaderboard = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      leaderboard.push({
        id: doc.id,
        name: data.firstName || 'Аноним',
        username: data.username,
        score: data.weeklyEarned || 0,
        rank: leaderboard.length + 1
      });
    });
    
    return leaderboard;
  } catch (error) {
    console.error('Ошибка загрузки недельного рейтинга:', error);
    
    // Если ошибка из-за отсутствия индекса, используем fallback
    if (error.code === 'failed-precondition') {
      console.warn('Индекс отсутствует, используем fallback с сортировкой на клиенте');
      window.indexesStatus.weeklyIndexExists = false;
      
      // Fallback: загружаем всех видимых пользователей и сортируем на клиенте
      try {
        const allUsersSnapshot = await window.db.collection('users')
          .where('leaderboardVisible', '==', true)
          .get();
        
        const leaderboard = [];
        allUsersSnapshot.forEach(doc => {
          const data = doc.data();
          leaderboard.push({
            id: doc.id,
            name: data.firstName || 'Аноним',
            username: data.username,
            score: data.weeklyEarned || 0
          });
        });
        
        // Сортируем на клиенте по weeklyEarned (по убыванию)
        leaderboard.sort((a, b) => b.score - a.score);
        
        // Ограничиваем количество и добавляем ранги
        return leaderboard.slice(0, limit).map((item, index) => ({
          ...item,
          rank: index + 1
        }));
      } catch (fallbackError) {
        console.error('Ошибка fallback загрузки недельного рейтинга:', fallbackError);
        return [];
      }
    }
    
    return [];
  }
}

// Отображение рейтинга
function renderLeaderboard(list, elementId, showCrown = true) {
  const container = document.getElementById(elementId);
  if (!container) return;
  
  if (list.length === 0) {
    container.innerHTML = '<div class="empty">Нет данных</div>';
    return;
  }
  
  let html = '';
  
  list.forEach((player, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    const crown = showCrown && index < 3 ? ' 👑' : '';
    const isCurrent = player.id === window.userData?.userId;
    const highlightClass = isCurrent ? 'current-user' : '';
    
    html += `
      <div class="leaderboard-item ${highlightClass}">
        <div class="rank">${medal}</div>
        <div class="avatar">${player.name.charAt(0)}</div>
        <div class="info">
          <div class="name">${player.name}${player.username ? ` (@${player.username})` : ''}${crown}</div>
          <div class="stats">
            <span class="score">🏆 ${player.score.toLocaleString()} очков</span>
            ${player.balance ? `<span class="balance">💰 ${player.balance.toLocaleString()} монет</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Загрузка и отображение рейтинга по типу
async function loadAndRenderLeaderboard(type) {
  let list = [];
  let elementId = '';
  
  switch(type) {
    case 'global':
      list = await loadGlobalLeaderboard();
      elementId = 'global-leaderboard';
      break;
    case 'friends':
      list = await loadFriendsLeaderboard();
      elementId = 'friends-leaderboard';
      break;
    case 'weekly':
      list = await loadWeeklyLeaderboard();
      elementId = 'weekly-leaderboard';
      break;
  }
  
  if (elementId) {
    renderLeaderboard(list, elementId);
  }
  
  // Обновляем позицию пользователя
  updateUserRank(type, list);
}

// Обновление позиции пользователя
function updateUserRank(type, list) {
  const rankEl = document.getElementById('user-rank');
  if (!rankEl || !window.userData) return;
  
  const userIndex = list.findIndex(p => p.id === window.userData.userId);
  
  if (userIndex !== -1) {
    const user = list[userIndex];
    rankEl.innerHTML = `
      <div class="rank-info">
        <span class="rank-number">${user.rank} место</span>
        <span class="rank-score">🏆 ${user.score.toLocaleString()} очков</span>
      </div>
    `;
  } else {
    rankEl.textContent = 'Вы не в топе';
  }
}

// Инициализация лидерборда
function initLeaderboard() {
  // Останавливаем старый интервал если есть
  if (window.leaderboardUpdateInterval) {
    clearInterval(window.leaderboardUpdateInterval);
  }
  
  const lbTabs = document.querySelectorAll('.lb-tab');
  const leaderboardLists = document.querySelectorAll('.leaderboard-list');
  
  let currentType = 'global';
  
  lbTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const type = this.getAttribute('data-type');
      currentType = type;
      
      // Убираем активный класс со всех вкладок
      lbTabs.forEach(t => t.classList.remove('active'));
      leaderboardLists.forEach(list => list.style.display = 'none');
      
      // Активируем выбранную вкладку
      this.classList.add('active');
      
      // Показываем соответствующий список
      let elementId = '';
      switch(type) {
        case 'global':
          elementId = 'global-leaderboard';
          break;
        case 'friends':
          elementId = 'friends-leaderboard';
          break;
        case 'weekly':
          elementId = 'weekly-leaderboard';
          break;
      }
      
      if (elementId) {
        document.getElementById(elementId).style.display = 'block';
        loadAndRenderLeaderboard(type);
      }
    });
  });
  
  // Загружаем глобальный рейтинг по умолчанию
  loadAndRenderLeaderboard('global');
  
  // Автообновление рейтинга каждые 30 секунд
  window.leaderboardUpdateInterval = setInterval(() => {
    // Обновляем только если вкладка лидерборда открыта
    const leaderboardTab = document.getElementById('leaderboard-tab');
    if (leaderboardTab && leaderboardTab.style.display !== 'none') {
      loadAndRenderLeaderboard(currentType);
    }
  }, 30000); // Каждые 30 секунд
}

// ФУНКЦИЯ: Инициализация навигации
function initNavigation() {
  console.log("initNavigation called");
  
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');
  
  navButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      // Скрываем все вкладки
      tabs.forEach(tab => tab.style.display = 'none');
      
      // Показываем выбранную
      document.getElementById(tabId).style.display = 'block';
      
      // Обновляем активную кнопку
      navButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Если открыли магазин - рендерим
      if (tabId === 'shop-tab') {
        renderShop();
      }
      
      // Если открыли рефералы - обновляем UI
      if (tabId === 'referrals-tab') {
        updateReferralsUI();
      }
      
      // Если открыли лидерборд - загружаем данные
      if (tabId === 'leaderboard-tab') {
        initLeaderboard();
      }
    });
  });
}

// ====== ОСТАЛЬНОЙ КОД (оставь существующий без изменений) ======

// ========== ОСТАЛЬНОЙ КОД ==========

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSiUtRU12VLbNAgc34vVJlzq7sV6mOGvo",
  authDomain: "telegram-clicker2.firebaseapp.com",
  projectId: "telegram-clicker2",
  storageBucket: "telegram-clicker2.firebasestorage.app",
  messagingSenderId: "367826082536",
  appId: "1:367826082536:web:be692072223caa20ed075d"
};

// Функция инициализации Firebase
function initFirebase() {
  try {
    if (!firebase.apps.length) {
      const app = firebase.initializeApp(firebaseConfig);
      window.db = firebase.firestore(); // NOT getFirestore(app)
      console.log("✅ Firebase initialized successfully");
    } else {
      window.db = firebase.firestore(); // NOT getFirestore(app)
      console.log("✅ Firebase already initialized");
    }
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
  }
}

// Функция проверки, запущено ли приложение в Telegram
function isTelegramWebApp() {
    // Проверяем наличие Telegram Web App API
    if (!window.Telegram || !window.Telegram.WebApp) {
        return false;
    }
    
    const tg = window.Telegram.WebApp;
    
    // Проверяем, что мы действительно в Telegram (не в обычном браузере)
    // В Telegram всегда есть platform, и он не равен 'unknown'
    if (tg.platform && tg.platform !== 'unknown' && tg.platform !== 'web') {
        return true;
    }
    
    // Дополнительная проверка: если есть initDataUnsafe, значит мы в Telegram
    if (tg.initDataUnsafe) {
        return true;
    }
    
    return false;
}

// Функция получения экземпляра Telegram Web App
function getTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        return window.Telegram.WebApp;
    }
    return null;
}

// Элементы DOM
const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('content');
const errorEl = document.getElementById('error');
const clickButton = document.getElementById('clickButton');
const balanceEl = document.getElementById('balance');
const clicksEl = document.getElementById('clicks');
const devModeIndicator = document.getElementById('devModeIndicator');
const perClickEl = document.getElementById('per-click');
const passiveIncomeEl = document.getElementById('passive-income');
const shopItemsEl = document.getElementById('shop-items');

// Функция получения тестовых данных пользователя
function getTestUserData() {
    return {
        id: 123456789,
        first_name: "TestUser",
        username: "testuser",
        photo_url: ""
    };
}

// Функция загрузки данных пользователя
async function loadUserData() {
    console.log("Loading user data...");
    
    showLoading();
    hideError();
    
    // Инициализируем Firebase если еще не инициализирован
    if (!window.db) {
        initFirebase();
    }
    
    if (!window.db) {
        console.error("Firestore not initialized!");
        return;
    }
    
    // Определяем режим работы: проверяем, запущено ли в Telegram
    let userInfo = null;
    
    if (isTelegramWebApp()) {
        // Режим Telegram - используем реальные данные
        window.isDevMode = false;
        hideDevModeIndicator();
        
        const tg = getTelegramWebApp();
        if (!tg) {
            console.error("Ошибка: Telegram WebApp недоступен");
            showError('Ошибка: Telegram WebApp недоступен');
            return;
        }
        
        // Инициализируем Telegram Web App (ready() уже вызван в initApp, но для надежности вызываем еще раз)
        tg.ready();
        tg.expand();
        
        // Получаем данные пользователя из initDataUnsafe
        // Это единственный правильный способ согласно документации Telegram
        let tgUser = null;
        
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            tgUser = tg.initDataUnsafe.user;
        }
        
        // Если данные пользователя еще не загружены, ждем немного
        if (!tgUser) {
            console.warn("Данные пользователя Telegram еще не загружены, ждем...");
            
            // Ждем до 2 секунд для загрузки данных
            let attempts = 0;
            while (attempts < 20 && !tgUser) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                    tgUser = tg.initDataUnsafe.user;
                    break;
                }
                attempts++;
            }
        }
        
        if (tgUser && tgUser.id) {
            userInfo = {
                userId: tgUser.id.toString(),
                firstName: tgUser.first_name || 'Пользователь',
                username: tgUser.username || '',
                photoUrl: tgUser.photo_url || '',
                lastName: tgUser.last_name || '',
                languageCode: tgUser.language_code || 'ru'
            };
            console.log("✅ Запуск в Telegram, пользователь:", userInfo);
            console.log("Telegram WebApp данные:", {
                platform: tg.platform,
                version: tg.version,
                colorScheme: tg.colorScheme,
                initDataUnsafe: {
                    query_id: tg.initDataUnsafe.query_id,
                    auth_date: tg.initDataUnsafe.auth_date,
                    hash: tg.initDataUnsafe.hash ? 'present' : 'missing',
                    start_param: tg.initDataUnsafe.start_param
                }
            });
        } else {
            console.error("❌ Не удалось получить данные пользователя Telegram");
            console.log("Доступные данные initDataUnsafe:", tg.initDataUnsafe);
            console.log("Платформа:", tg.platform);
            showError('Ошибка: не удалось получить данные пользователя Telegram. Попробуйте перезапустить приложение.');
            return;
        }
    } else {
        // Режим разработки - используем тестовые данные
        window.isDevMode = true;
        showDevModeIndicator();
        console.log("⚠️ Запуск в режиме разработки (Telegram не обнаружен)");
        
        userInfo = {
            userId: "123456789",
            firstName: "TestUser",
            username: "testuser",
            photoUrl: ""
        };
    }
    
    try {
        const userRef = window.db.collection("users").doc(userInfo.userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            window.userData = userDoc.data();
            
            // Обновляем userId если его нет (для старых записей)
            if (!window.userData.userId) {
                window.userData.userId = userInfo.userId;
            }
            
            // Обновляем имя и username если они изменились
            if (userInfo.firstName && window.userData.firstName !== userInfo.firstName) {
                window.userData.firstName = userInfo.firstName;
            }
            if (userInfo.username && window.userData.username !== userInfo.username) {
                window.userData.username = userInfo.username;
            }
            
            // Инициализируем upgrades если отсутствует
            if (!window.userData.upgrades) {
                window.userData.upgrades = {};
            }
            
            // Инициализируем реферальные поля если отсутствуют
            if (!window.userData.referrals) {
                window.userData.referrals = [];
            }
            if (window.userData.referralsEarned === undefined) {
                window.userData.referralsEarned = 0;
            }
            if (window.userData.invitedBy === undefined) {
                window.userData.invitedBy = null;
            }
            
            // Инициализируем поля энергии если отсутствуют
            if (window.userData.energy === undefined) {
                window.userData.energy = 1000;
            }
            if (window.userData.maxEnergy === undefined) {
                window.userData.maxEnergy = 1000;
            }
            if (window.userData.energyPerHour === undefined) {
                window.userData.energyPerHour = 100;
            }
            
            // Инициализируем поля рейтинга если отсутствуют
            if (window.userData.totalEarned === undefined) {
                window.userData.totalEarned = 0;
            }
            if (window.userData.weeklyEarned === undefined) {
                window.userData.weeklyEarned = 0;
            }
            if (window.userData.leaderboardVisible === undefined) {
                window.userData.leaderboardVisible = true;
            }
            if (!window.userData.lastWeeklyReset) {
                window.userData.lastWeeklyReset = firebase.firestore.FieldValue.serverTimestamp();
            }
            
            // Восстанавливаем энергию на основе времени
            updateEnergy();
            
            // Сбрасываем недельный рейтинг если нужно
            await resetWeeklyIfNeeded();
            
            // Устанавливаем текущее время как последнее обновление если его нет
            if (!window.userData.lastEnergyUpdate) {
                window.userData.lastEnergyUpdate = firebase.firestore.FieldValue.serverTimestamp();
            }
            
            // Пересчитываем статистику на основе всех улучшений
            recalculateStats();
            
            // Округляем энергию до целых
            window.userData.energy = Math.floor(window.userData.energy || 0);
            
            // Обновляем в Firestore если значения изменились
            const updateData = {
                userId: window.userData.userId,
                firstName: window.userData.firstName,
                username: window.userData.username,
                perClickValue: window.userData.perClickValue,
                passiveIncome: window.userData.passiveIncome,
                upgrades: window.userData.upgrades,
                referrals: window.userData.referrals,
                referralsEarned: window.userData.referralsEarned,
                invitedBy: window.userData.invitedBy,
                energy: window.userData.energy,
                maxEnergy: window.userData.maxEnergy,
                energyPerHour: window.userData.energyPerHour,
                lastEnergyUpdate: window.userData.lastEnergyUpdate || firebase.firestore.FieldValue.serverTimestamp(),
                totalEarned: window.userData.totalEarned,
                weeklyEarned: window.userData.weeklyEarned,
                leaderboardVisible: window.userData.leaderboardVisible,
                lastWeeklyReset: window.userData.lastWeeklyReset,
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await userRef.update(updateData);
            
            updateUI();
            renderShop(); // Обновляем магазин после загрузки данных
            updateReferralsUI(); // Обновляем интерфейс рефералов
            if (window.userData?.passiveIncome > 0) {
                if (window.passiveIncomeInterval) {
                    clearInterval(window.passiveIncomeInterval);
                }
                window.passiveIncomeInterval = setInterval(applyPassiveIncome, 1000);
                console.log("Пассивный доход запущен:", window.userData.passiveIncome, "в секунду");
            }
            hideLoading();
            showContent();
            // Скрываем прелоадер если он еще виден
            const preloader = document.getElementById('preloader');
            if (preloader) preloader.style.display = 'none';
            console.log("Данные загружены:", window.userData);
            console.log("User data set:", window.userData);
        } else {
            // Новый пользователь - создаем запись
            console.log("🆕 Создание нового пользователя:", userInfo);
            
            window.userData = { 
                userId: userInfo.userId,
                firstName: userInfo.firstName,
                username: userInfo.username,
                photoUrl: userInfo.photoUrl || '',
                balance: 0, 
                totalClicks: 0, 
                perClickValue: 1, 
                passiveIncome: 0, 
                upgrades: {},
                referrals: [], 
                referralsEarned: 0,
                invitedBy: null,
                energy: 1000,
                maxEnergy: 1000,
                energyPerHour: 100,
                totalEarned: 0,
                weeklyEarned: 0,
                leaderboardVisible: true,
                lastEnergyUpdate: firebase.firestore.FieldValue.serverTimestamp(),
                lastWeeklyReset: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Пересчитываем статистику (для нового пользователя будет базовое значение)
            recalculateStats();
            
            // Создаем запись в базе данных
            await userRef.set({
                userId: userInfo.userId,
                firstName: userInfo.firstName,
                username: userInfo.username || '',
                photoUrl: userInfo.photoUrl || '',
                balance: 0,
                totalClicks: 0,
                perClickValue: window.userData.perClickValue,
                passiveIncome: window.userData.passiveIncome,
                upgrades: window.userData.upgrades,
                referrals: [],
                referralsEarned: 0,
                invitedBy: null,
                energy: 1000,
                maxEnergy: 1000,
                energyPerHour: 100,
                lastEnergyUpdate: firebase.firestore.FieldValue.serverTimestamp(),
                totalEarned: 0,
                weeklyEarned: 0,
                leaderboardVisible: true,
                lastWeeklyReset: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log("✅ Новый пользователь создан в базе данных:", userInfo.userId);
            
            updateUI();
            renderShop(); // Обновляем магазин после создания нового пользователя
            updateReferralsUI(); // Обновляем интерфейс рефералов
            if (window.userData?.passiveIncome > 0) {
                if (window.passiveIncomeInterval) {
                    clearInterval(window.passiveIncomeInterval);
                }
                window.passiveIncomeInterval = setInterval(applyPassiveIncome, 1000);
                console.log("Пассивный доход запущен:", window.userData.passiveIncome, "в секунду");
            }
            hideLoading();
            showContent();
            // Скрываем прелоадер если он еще виден
            const preloader2 = document.getElementById('preloader');
            if (preloader2) preloader2.style.display = 'none';
            console.log("Новый пользователь создан");
            console.log("User data set:", window.userData);
        }
    } catch (error) {
        console.error("Ошибка Firebase:", error);
        showError('Ошибка соединения с базой данных. Проверьте конфигурацию Firebase.');
        hideLoading();
    }
}

// Функция обновления UI энергии
function updateEnergyUI() {
    if (!window.userData) return;
    
    // Округляем энергию до целых
    const energy = Math.floor(window.userData.energy || 0);
    const maxEnergy = Math.floor(window.userData.maxEnergy || 1000);
    const energyPerHour = window.userData.energyPerHour || 100;
    const energyFill = document.getElementById('energy-fill');
    const energyText = document.getElementById('energy-text');
    const energyTimer = document.getElementById('energy-timer');
    const clickBtn = document.getElementById('clickButton');
    
    // Обновляем прогресс-бар
    if (energyFill) {
        const percentage = Math.max(0, Math.min(100, (energy / maxEnergy) * 100));
        energyFill.style.width = `${percentage}%`;
        
        // Меняем цвет в зависимости от уровня энергии
        if (percentage < 10) {
            energyFill.style.background = 'linear-gradient(90deg, #f44336, #e91e63)';
        } else if (percentage < 30) {
            energyFill.style.background = 'linear-gradient(90deg, #ff9800, #ff5722)';
        } else {
            energyFill.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
        }
    }
    
    // Обновляем текст
    if (energyText) {
        energyText.textContent = `${energy}/${maxEnergy}`;
    }
    
    // Обновляем таймер до полного восстановления
    if (energyTimer) {
        if (energy >= maxEnergy) {
            energyTimer.textContent = 'Энергия полная';
        } else {
            const energyNeeded = maxEnergy - energy;
            const hoursNeeded = energyNeeded / energyPerHour;
            const minutesNeeded = Math.ceil(hoursNeeded * 60);
            
            if (minutesNeeded < 60) {
                energyTimer.textContent = `Восстановление через ${minutesNeeded} мин`;
            } else {
                const hours = Math.floor(hoursNeeded);
                const minutes = Math.ceil((hoursNeeded - hours) * 60);
                energyTimer.textContent = `Восстановление через ${hours}ч ${minutes}м`;
            }
        }
    }
    
    // Обновляем кнопку клика
    if (clickBtn) {
        if (energy <= 0) {
            clickBtn.style.opacity = '0.6';
            clickBtn.style.cursor = 'not-allowed';
        } else {
            clickBtn.style.opacity = '1';
            clickBtn.style.cursor = 'pointer';
        }
    }
}

// Функция обновления UI
function updateUI() {
    if (window.userData) {
        balanceEl.textContent = `Баланс: ${window.userData.balance || 0}`;
        clicksEl.textContent = `Кликов: ${window.userData.totalClicks || 0}`;
        
        // Обновляем статистику
        if (perClickEl) {
            perClickEl.textContent = `За клик: ${window.userData.perClickValue || 1}`;
        }
        if (passiveIncomeEl) {
            passiveIncomeEl.textContent = `В секунду: ${window.userData.passiveIncome || 0}`;
        }
        
        // Обновляем энергию
        updateEnergyUI();
    }
}

// Функция обработки клика
async function handleClick() {
    console.log("handleClick called:", { 
        userData: !!window.userData, 
        balance: window.userData?.balance,
        perClickValue: window.userData?.perClickValue,
        energy: window.userData?.energy
    });
    
    if (!window.userData) {
        console.error('handleClick: Данные пользователя не загружены');
        return;
    }
    
    // Проверяем энергию
    const currentEnergy = window.userData.energy || 0;
    if (currentEnergy <= 0) {
        // Нет энергии - показываем сообщение и визуальную обратную связь
        const btn = document.getElementById('clickButton');
        if (btn) {
            btn.style.animation = 'shake 0.5s';
            btn.style.background = '#cccccc';
            setTimeout(() => {
                btn.style.animation = '';
                btn.style.background = '';
            }, 500);
        }
        showError('Нет энергии! Жди восстановления');
        console.log("handleClick: Нет энергии для клика");
        return;
    }
    
    const currentBalance = window.userData.balance || 0;
    const perClickValue = window.userData.perClickValue || 1;
    
    console.log("handleClick: Текущее состояние:", { 
        balance: currentBalance, 
        perClickValue: perClickValue,
        energy: currentEnergy,
        increment: perClickValue
    });
    
    try {
        if (!window.db) {
            throw new Error('Firebase не инициализирован');
        }
        if (!window.userData) {
            throw new Error('Данные пользователя не загружены');
        }
        
        const userId = window.userData.userId.toString();
        const userRef = window.db.collection('users').doc(userId);
        
        // Тратим энергию
        window.userData.energy = Math.max(0, (window.userData.energy || 0) - 1);
        window.userData.energy = Math.floor(window.userData.energy); // Округляем до целых
        
        // Атомарное увеличение balance и totalClicks, уменьшение энергии
        await userRef.update({
            balance: firebase.firestore.FieldValue.increment(perClickValue),
            totalClicks: firebase.firestore.FieldValue.increment(1),
            energy: firebase.firestore.FieldValue.increment(-1),
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Обновляем локальные данные
        window.userData.balance = (window.userData.balance || 0) + perClickValue;
        window.userData.totalClicks = (window.userData.totalClicks || 0) + 1;
        
        // Обновляем статистику заработанного
        updateEarnedStats(perClickValue);
        
        console.log("handleClick: После клика:", { 
            balance: window.userData.balance, 
            totalClicks: window.userData.totalClicks,
            energy: window.userData.energy,
            increment: perClickValue
        });
        
        // Обновляем UI
        updateUI();
        
        // Вибрация при клике (только в Telegram, не в режиме разработки)
        if (!window.isDevMode) {
            const tg = getTelegramWebApp();
            if (tg && tg.HapticFeedback) {
                try {
                    tg.HapticFeedback.impactOccurred('light');
                } catch (error) {
                    console.warn('Ошибка вибрации:', error);
                }
            }
        }
        
        console.log(`handleClick: Клик выполнен! Баланс: ${window.userData.balance}, Кликов: ${window.userData.totalClicks}, Энергия: ${window.userData.energy}`);
        
    } catch (error) {
        console.error('handleClick: Ошибка при обработке клика:', error);
        showError('Ошибка при сохранении данных. Попробуйте еще раз.');
    }
}

// Функции для управления UI
function showLoading() {
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
}

function hideLoading() {
    loadingEl.style.display = 'none';
}

function showContent() {
    contentEl.style.display = 'block';
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    contentEl.style.display = 'none';
}

function hideError() {
    errorEl.style.display = 'none';
}

function showDevModeIndicator() {
    if (devModeIndicator) {
        devModeIndicator.style.display = 'block';
    }
}

function hideDevModeIndicator() {
    if (devModeIndicator) {
        devModeIndicator.style.display = 'none';
    }
}

// Функция инициализации приложения
async function initApp() {
    try {
        // 1. Инициализация Firebase (compat версия)
        // Конфигурация Firebase (замени значения)
        const firebaseConfig = {
            apiKey: "AIzaSyCSiUtRU12VLbNAgc34vVJlzq7sV6mOGvo",
            authDomain: "telegram-clicker2.firebaseapp.com",
            projectId: "telegram-clicker2",
            storageBucket: "telegram-clicker2.firebasestorage.app",
            messagingSenderId: "367826082536",
            appId: "1:367826082536:web:be692072223caa20ed075d"
        };
        
        try {
            const app = firebase.initializeApp(firebaseConfig);
            window.db = firebase.firestore();
            console.log("✅ Firebase initialized successfully, db:", window.db);
        } catch (error) {
            console.error("❌ Firebase error:", error);
            showError('Ошибка инициализации Firebase');
            return;
        }
        
        // 2. Инициализация Telegram Web App (если доступен)
        // Важно: инициализация должна происходить ДО загрузки данных пользователя
        const tg = getTelegramWebApp();
        if (tg) {
            // Вызываем ready() - это обязательный метод для инициализации
            tg.ready();
            
            // Разворачиваем приложение на весь экран
            tg.expand();
            
            // Настраиваем тему Telegram
            if (tg.colorScheme) {
                document.documentElement.setAttribute('data-theme', tg.colorScheme);
                // Также можно установить цвет фона
                if (tg.backgroundColor) {
                    document.body.style.backgroundColor = tg.backgroundColor;
                }
            }
            
            // Обработчик изменения темы
            tg.onEvent('themeChanged', () => {
                if (tg.colorScheme) {
                    document.documentElement.setAttribute('data-theme', tg.colorScheme);
                }
                if (tg.backgroundColor) {
                    document.body.style.backgroundColor = tg.backgroundColor;
                }
            });
            
            // Обработчик изменения размера окна
            tg.onEvent('viewportChanged', () => {
                // Можно обработать изменение размера окна
                console.log('Viewport changed:', tg.viewportHeight);
            });
            
            // Включаем вибрацию при клике (если поддерживается)
            if (tg.HapticFeedback) {
                // Будет использоваться в handleClick
            }
            
            console.log('✅ Telegram WebApp инициализирован');
            console.log('Платформа:', tg.platform);
            console.log('Версия:', tg.version);
            console.log('Цветовая схема:', tg.colorScheme);
            console.log('Высота viewport:', tg.viewportHeight);
        } else {
            console.log('⚠️ Telegram WebApp не обнаружен - режим разработки');
        }
        
        // 3. Режим работы определится в loadUserData()
        
        // 4. Загрузка данных пользователя (после инициализации Firebase)
        await loadUserData();
        
        // 5. Проверка индексов Firestore (после загрузки данных пользователя)
        await checkAndCreateIndexes();
        
        // 6. Инициализация навигации (ДО запуска пассивного дохода)
        initNavigation();
        
        // 7. Настройка реферальной системы
        setupCopyLinkButton();
        await processReferralParam();
        
        // 8. Запускаем интервал для обновления энергии (каждую минуту)
        if (window.energyUpdateInterval) {
            clearInterval(window.energyUpdateInterval);
        }
        window.energyUpdateInterval = setInterval(() => {
            updateEnergy();
        }, 60000); // Каждую минуту
        
    } catch (error) {
        console.error('Ошибка инициализации приложения:', error);
        showError('Ошибка инициализации приложения');
    }
}

// Обработчик для кнопки "Клик"
if (clickButton) {
    clickButton.addEventListener('click', handleClick);
}

// Инициализация приложения (после загрузки DOM)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initApp();
    });
} else {
    // DOM уже загружен
    initApp();
}

// В КОНЦЕ файла добавь:
console.log("=== ФУНКЦИИ ЗАГРУЖЕНЫ ===");
console.log("renderShop:", typeof renderShop);
console.log("applyPassiveIncome:", typeof applyPassiveIncome);
console.log("buyUpgrade:", typeof buyUpgrade);
console.log("initNavigation:", typeof initNavigation);
