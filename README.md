# FinanceApp Pro

App financeiro com Firebase Authentication + Firestore, sincronização entre PC e celular e PWA.

## Regras do Firestore
Cole SOMENTE isto em Firestore > Regras:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Publicação no GitHub Pages
Envie todos os arquivos deste ZIP para o repositório `Planilha`, substituindo os antigos.
