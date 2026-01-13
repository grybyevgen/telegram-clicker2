# Решение проблем с Firebase

## Ошибка: "Ошибка соединения с базой данных. Проверьте конфигурацию Firebase"

### Шаги для диагностики:

1. **Откройте консоль разработчика** (F12) и проверьте:
   - Есть ли ошибки в консоли?
   - Загружается ли Firebase SDK?
   - Что показывает сообщение об ошибке?

2. **Проверьте подключение Firebase SDK в `index.html`:**
   ```html
   <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js"></script>
   ```

3. **Проверьте конфигурацию Firebase в `app.js`:**
   - Убедитесь, что все поля заполнены правильно
   - `projectId`, `apiKey`, `authDomain` должны совпадать с консолью Firebase

4. **Проверьте Firestore в Firebase Console:**
   - Перейдите на https://console.firebase.google.com/
   - Убедитесь, что Firestore Database создан
   - Проверьте правила безопасности Firestore

5. **Правила безопасности Firestore (для тестирования):**
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if true; // Для тестирования
       }
     }
   }
   ```

6. **Частые проблемы:**
   - ❌ Firestore не создан в консоли
   - ❌ Неправильные правила безопасности (блокируют доступ)
   - ❌ Неверная конфигурация (projectId, apiKey)
   - ❌ Firebase SDK не загружается (проблемы с сетью/CDN)
   - ❌ База данных в режиме "Production" без правильных правил

### Коды ошибок и их значения:

- `permission-denied` - Недостаточно прав. Проверьте правила Firestore.
- `unavailable` - Сервис недоступен. Проверьте интернет-соединение.
- `unauthenticated` - Требуется аутентификация (нормально для Web App без auth).

### Что делать:

1. Откройте консоль браузера (F12)
2. Найдите сообщения об ошибках (они начинаются с ❌)
3. Проверьте код ошибки и сообщение
4. Следуйте инструкциям выше в зависимости от типа ошибки

### Проверка подключения:

В консоли браузера должны быть сообщения:
- ✅ "Firebase initialized successfully"
- ✅ "Firestore создан успешно"
- ✅ "Подключение к Firestore, userId: ..."

Если их нет - проблема в инициализации Firebase.