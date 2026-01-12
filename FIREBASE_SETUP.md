# Настройка Firebase

## Шаги для подключения Firebase:

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Создайте новый проект или выберите существующий
3. В настройках проекта перейдите в раздел "Общие" → "Ваши приложения"
4. Добавьте веб-приложение (иконка `</>`)
5. Скопируйте конфигурацию Firebase
6. Вставьте конфигурацию в файл `app.js`, заменив объект `firebaseConfig`

Пример конфигурации:
```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

## Настройка Firestore:

1. В Firebase Console перейдите в раздел "Firestore Database"
2. Создайте базу данных (режим тестовый или продакшн)
3. Установите правила безопасности (для тестирования можно использовать):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null || true; // Временно для тестирования
    }
  }
}
```

**Внимание:** Для продакшн используйте правильные правила безопасности с проверкой авторизации!
