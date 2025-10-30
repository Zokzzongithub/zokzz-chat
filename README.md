# Zokzz Chat

Secure social starter for **Zokzz Chat** with account management, friend discovery, and real-time style messaging powered by Firebase.

## Features

- Light blue and white marketing landing page with a top-right **Log In** call to action.
- Dedicated login/register screen with client-side validation and helpful feedback.
- Messenger-inspired home dashboard where users can search people by username or email, send/accept friend requests, and manage conversations.
- Live-feeling chat experience with auto-refreshing messages and conversation polling.
- Backend powered by Express with Firebase Admin SDK, keeping credentials on the server only.
- Passwords hashed with SHA-256 plus per-user salt before storage in Firebase Realtime Database.
- Signed JSON Web Tokens (JWT) for authenticated browser sessions and baseline hardening via Helmet.

## Getting Started

1. Duplicate `.env.example` and rename it to `.env`.
2. Provide the required secrets (never commit them). Supply either a file path or a Base64 string for the Firebase service account:

   ```ini
   FIREBASE_DATABASE_URL=https://zokzzweb-default-rtdb.firebaseio.com
   FIREBASE_SERVICE_ACCOUNT_PATH=C:/absolute/path/to/serviceAccount.json
   # or
   # FIREBASE_SERVICE_ACCOUNT_BASE64=eyJ0eXBlIjoi....
   JWT_SECRET=use-a-long-random-string-here
   PORT=3000
   ```

3. Install dependencies:

   ```powershell
   npm install
   ```

4. Run the server:

   ```powershell
   npm run start
   ```

5. Open `http://localhost:3000` in your browser.

### Hosting the Frontend separately

- Update `public/js/config.js` with the external URL of your deployed API (for example, the Render service URL).
- Redeploy static assets (Firebase Hosting or any static host) after adjusting the config file.

## Firebase Structure

The backend stores users, friend requests, and conversations in Realtime Database:

```json
{
   "users": {
      "uid123": {
         "email": "user@example.com",
         "username": "user",
         "usernameLower": "user",
         "salt": "...",
         "passwordHash": "...",
         "createdAt": "2025-10-29T12:00:00.000Z",
         "lastLoginAt": "2025-10-29T13:00:00.000Z",
         "friends": {
            "uid456": true
         }
      }
   },
   "friendRequests": {
      "requestId": {
         "from": "uid123",
         "to": "uid456",
         "status": "pending",
         "createdAt": "2025-10-29T12:30:00.000Z",
         "respondedAt": null,
         "pairKey": "uid123:uid456"
      }
   },
   "conversations": {
      "uid123__uid456": {
         "participants": {
            "uid123": true,
            "uid456": true
         },
         "createdAt": "2025-10-29T13:00:00.000Z",
         "updatedAt": "2025-10-29T13:05:00.000Z",
         "messages": {
            "msgId": {
               "senderId": "uid123",
               "body": "Hello!",
               "createdAt": "2025-10-29T13:05:00.000Z"
            }
         }
      }
   }
}
```

### Required Realtime Database Indexes

Add the following to your database rules for efficient queries:

```json
"rules": {
   "users": {
      ".indexOn": ["email", "usernameLower"],
      "$uid": {
         ".read": "auth != null && auth.uid === $uid",
         ".write": "auth != null && auth.uid === $uid"
      }
   },
   "friendRequests": {
      ".indexOn": ["from", "to", "pairKey"]
   }
}
```

## Security Notes

- Keep the Firebase service account JSON **server-side only**. Never expose it to client JavaScript.
- Consider upgrading to a more resilient password hashing algorithm (e.g., bcrypt or Argon2) before going to production.
- Update the Helmet configuration with a strict Content Security Policy once all external resources are finalised.
- Use HTTPS everywhere and rotate your secrets regularly.
