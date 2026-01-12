# Инструкция по созданию индексов Firestore для лидербордов

## Проблема
Лидерборды могут не работать из-за отсутствия составных индексов в Firestore. Firestore требует создания индексов для запросов, которые используют `where()` и `orderBy()` одновременно.

## Решение

### Способ 1: Через Firebase Console (рекомендуется)

1. Перейдите в [Firebase Console → Firestore Database → Indexes](https://console.firebase.google.com/project/telegram-clicker2/firestore/indexes)

2. Нажмите кнопку **"Create index"**

3. **Индекс #1 (глобальный лидерборд):**
   - **Collection ID:** `users`
   - **Fields to index:**
     - Field: `leaderboardVisible`, Type: **Ascending**
     - Field: `totalEarned`, Type: **Descending**
   - **Query scope:** Collection

4. **Индекс #2 (недельный лидерборд):**
   - **Collection ID:** `users`
   - **Fields to index:**
     - Field: `leaderboardVisible`, Type: **Ascending**
     - Field: `weeklyEarned`, Type: **Descending**
   - **Query scope:** Collection

5. Подождите несколько минут пока индексы создадутся (статус изменится на "Enabled")

6. Обновите страницу приложения после создания индексов

### Способ 2: Через Firebase CLI (автоматический)

Если у вас установлен Firebase CLI:

```bash
# Установите Firebase CLI (если еще не установлен)
npm install -g firebase-tools

# Войдите в Firebase
firebase login

# Инициализируйте проект (если еще не инициализирован)
firebase init firestore

# Разверните индексы
firebase deploy --only firestore:indexes
```

Файл `firestore.indexes.json` уже создан в проекте и содержит все необходимые индексы.

## Проверка работы

После создания индексов:

1. Откройте приложение
2. Перейдите на вкладку "Лидерборд"
3. Проверьте работу глобального и недельного лидербордов
4. Если индексы отсутствуют, появится модальное окно с инструкциями

## Fallback решение

Если индексы не созданы, приложение автоматически использует fallback-решение:
- Загружает всех видимых пользователей
- Сортирует их на клиенте
- Это работает, но может быть медленнее при большом количестве пользователей

## Важно

- Создание индексов может занять несколько минут
- Индексы создаются автоматически при первом запросе, но лучше создать их заранее
- После создания индексов обновите страницу приложения
