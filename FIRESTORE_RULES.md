# Правила безопасности Firestore для Telegram Web App

## Важно!
Для работы Telegram Web App с Firestore необходимо настроить правила безопасности.

## Правила для тестирования (НЕ для продакшн!)

Перейдите в Firebase Console → Firestore Database → Rules и вставьте следующие правила:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Правила для коллекции users
    match /users/{userId} {
      // Разрешаем чтение и запись для всех (только для тестирования!)
      allow read, write: if true;
    }
  }
}
```

## Правила для продакшн (рекомендуется)

Для продакшн используйте более строгие правила. Поскольку Telegram Web App не использует Firebase Authentication, 
можно использовать проверку по userId из Telegram:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Разрешаем чтение всем
      allow read: if true;
      
      // Разрешаем запись только если userId соответствует документу
      // Это предотвращает изменение данных других пользователей
      allow create: if request.resource.data.userId == userId;
      allow update: if request.resource.data.userId == userId && 
                       resource.data.userId == userId;
      allow delete: if false; // Запрещаем удаление
    }
  }
}
```

## Как применить правила:

1. Откройте [Firebase Console](https://console.firebase.google.com/)
2. Выберите ваш проект
3. Перейдите в **Firestore Database** → **Rules**
4. Вставьте правила выше
5. Нажмите **Publish**

## Проверка подключения:

После настройки правил приложение должно успешно подключаться к Firestore.
Если возникают ошибки, проверьте:
- Правила безопасности опубликованы
- База данных Firestore создана
- Конфигурация Firebase в app.js правильная
