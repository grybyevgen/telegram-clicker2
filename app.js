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
    // В Telegram - ссылка на бота с параметром start
    return `https://t.me/your_bot?start=ref_${userId}`;
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

// Обработка реферального параметра из URL
async function processReferralParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const refId = urlParams.get('ref');
  
  if (!refId || !window.userData || !window.db) return;
  
  // Нельзя пригласить себя
  if (refId === window.userData.userId) return;
  
  // Проверяем, не приглашал ли уже кто-то этого пользователя
  if (window.userData.invitedBy) {
    console.log('Пользователь уже приглашен кем-то другим');
    return;
  }
  
  console.log(`Обработка реферальной ссылки от: ${refId}`);
  
  try {
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
    
    console.log('Реферал успешно зарегистрирован! Бонус 10 монет начислен.');
    
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
    
    // Показываем инструкции если индексы отсутствуют
    if (window.indexesStatus.globalIndexExists === false || window.indexesStatus.weeklyIndexExists === false) {
      showIndexCreationInstructions();
    }
    
  } catch (error) {
    console.error('Ошибка проверки индексов:', error);
  }
}

// Показ инструкций по созданию индексов
function showIndexCreationInstructions() {
  // Проверяем, не показывали ли уже инструкции
  if (document.getElementById('index-instructions-modal')) {
    return; // Уже показано
  }
  
  const modal = document.createElement('div');
  modal.id = 'index-instructions-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  const missingIndexes = [];
  if (window.indexesStatus.globalIndexExists === false) {
    missingIndexes.push('глобального лидерборда (totalEarned)');
  }
  if (window.indexesStatus.weeklyIndexExists === false) {
    missingIndexes.push('недельного лидерборда (weeklyEarned)');
  }
  
  content.innerHTML = `
    <h2 style="margin-top: 0; color: #f44336;">⚠️ Требуется создание индексов Firestore</h2>
    <p>Для корректной работы лидербордов необходимо создать индексы в Firebase Console.</p>
    
    <h3>Способ 1: Через Firebase Console (рекомендуется)</h3>
    <ol style="line-height: 1.8;">
      <li>Перейдите в <a href="https://console.firebase.google.com/project/telegram-clicker2/firestore/indexes" target="_blank">Firebase Console → Firestore Database → Indexes</a></li>
      <li>Нажмите "Create index"</li>
      ${window.indexesStatus.globalIndexExists === false ? `
      <li><strong>Индекс #1 (глобальный лидерборд):</strong>
        <ul>
          <li>Collection ID: <code>users</code></li>
          <li>Fields to index:
            <ul>
              <li>Field: <code>leaderboardVisible</code>, Type: <strong>Ascending</strong></li>
              <li>Field: <code>totalEarned</code>, Type: <strong>Descending</strong></li>
            </ul>
          </li>
          <li>Query scope: <strong>Collection</strong></li>
        </ul>
      </li>
      ` : ''}
      ${window.indexesStatus.weeklyIndexExists === false ? `
      <li><strong>Индекс #2 (недельный лидерборд):</strong>
        <ul>
          <li>Collection ID: <code>users</code></li>
          <li>Fields to index:
            <ul>
              <li>Field: <code>leaderboardVisible</code>, Type: <strong>Ascending</strong></li>
              <li>Field: <code>weeklyEarned</code>, Type: <strong>Descending</strong></li>
            </ul>
          </li>
          <li>Query scope: <strong>Collection</strong></li>
        </ul>
      </li>
      ` : ''}
      <li>Подождите несколько минут пока индексы создадутся</li>
      <li>Обновите страницу после создания индексов</li>
    </ol>
    
    <h3>Способ 2: Через Firebase CLI</h3>
    <p>Если у вас установлен Firebase CLI, выполните:</p>
    <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;"><code>firebase deploy --only firestore:indexes</code></pre>
    <p><small>Файл <code>firestore.indexes.json</code> уже создан в проекте.</small></p>
    
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
      <button id="close-index-instructions" style="
        background: #4CAF50;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        width: 100%;
      ">Понятно, закрыть</button>
      <button id="retry-index-check" style="
        background: #2196F3;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        width: 100%;
        margin-top: 10px;
      ">Проверить индексы снова</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Обработчики кнопок
  document.getElementById('close-index-instructions').addEventListener('click', () => {
    modal.remove();
  });
  
  document.getElementById('retry-index-check').addEventListener('click', async () => {
    window.indexesStatus.checked = false;
    await checkAndCreateIndexes();
    if (window.indexesStatus.globalIndexExists === true && window.indexesStatus.weeklyIndexExists === true) {
      modal.remove();
      // Перезагружаем лидерборд если он открыт
      const leaderboardTab = document.getElementById('leaderboard-tab');
      if (leaderboardTab && leaderboardTab.style.display !== 'none') {
        const activeTab = document.querySelector('.lb-tab.active');
        if (activeTab) {
          const type = activeTab.getAttribute('data-type');
          if (type) {
            loadAndRenderLeaderboard(type);
          }
        }
      }
    }
  });
  
  // Закрытие по клику вне модального окна
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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
    return window.Telegram && 
           window.Telegram.WebApp && 
           window.Telegram.WebApp.initDataUnsafe && 
           window.Telegram.WebApp.initDataUnsafe.user;
}

// Инициализация Telegram Web App
const tg = window.Telegram?.WebApp;

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
    
    // ВСЕГДА используем тестовый режим для локальной разработки
    window.isDevMode = true;
    showDevModeIndicator();
    console.log("Запуск в режиме разработки");
    
    const testUser = {
        userId: "123456789",
        firstName: "TestUser",
        username: "testuser",
        photoUrl: ""
    };
    
    // Пропускаем весь код с Telegram
    // И сразу работаем с Firebase
    if (!window.db) {
        console.error("Firestore not initialized!");
        return;
    }
    
    try {
        
        const userRef = window.db.collection("users").doc(testUser.userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            window.userData = userDoc.data();
            
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
            const userRef = window.db.collection("users").doc(testUser.userId);
            await userRef.update({
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
                lastWeeklyReset: window.userData.lastWeeklyReset
            });
            
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
            window.userData = { 
                ...testUser, 
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
                leaderboardVisible: true
            };
            
            // Пересчитываем статистику (для нового пользователя будет базовое значение)
            recalculateStats();
            
            await userRef.set({
                userId: testUser.userId,
                firstName: testUser.firstName,
                username: testUser.username,
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
        if (!window.isDevMode && tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
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
        
        // 2. Определяем режим работы
        if (window.isDevMode) {
            showDevModeIndicator();
            console.log('Режим: разработки');
        } else {
            hideDevModeIndicator();
            console.log('Режим: Telegram');
        }
        
        // 3. Инициализация Telegram Web App (только если не режим разработки)
        if (!window.isDevMode && tg) {
            tg.expand();
            tg.ready();
        }
        
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
