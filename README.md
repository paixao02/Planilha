# FinanceApp Pro

App financeiro com Firebase Authentication, Firestore, PWA, categorias automáticas e sincronização entre PC e celular.

## Publicação
Envie todos os arquivos para o repositório GitHub Pages.

## Regras Firestore recomendadas
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
