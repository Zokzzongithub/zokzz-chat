# Zokzz Chat

Secure starter web experience for **Zokzz Chat** with a Firebase-backed authentication flow.

## Features

- Light blue and white marketing landing page with a top-right **Log In** call to action.
- Dedicated login/register screen with client-side validation and helpful feedback.
- Backend powered by Express that proxies all auth traffic, keeping Firebase secrets on the server only.
- Passwords hashed with SHA-256 plus a per-user salt before storage in Firebase Realtime Database.
- Signed JSON Web Tokens (JWT) for authenticated browser sessions.
- Basic security headers via Helmet and Express hardening tweaks.

## Getting Started

1. Duplicate `.env.example` and rename it to `.env`.
2. Fill in the secrets (never commit them):

   ```ini
   FIREBASE_DATABASE_URL=https://zokzzweb-default-rtdb.firebaseio.com
   FIREBASE_DATABASE_SECRET=YOUR_FIREBASE_DB_SECRET
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

The backend stores users under the `users` collection in your Realtime Database. A sample document looks like this:

```json
{
  "email": "user@example.com",
  "username": "user",
  "salt": "...",
  "passwordHash": "...",
  "createdAt": "2025-10-29T12:00:00.000Z",
  "lastLoginAt": "2025-10-29T13:00:00.000Z"
}
```

## Security Notes

- Keep the Firebase database secret **server-side only**. Never expose it to client JavaScript.
- Consider upgrading to a more resilient password hashing algorithm (e.g., bcrypt or Argon2) before going to production.
- Update the Helmet configuration with a strict Content Security Policy once all external resources are finalised.
- Use HTTPS everywhere and rotate your secrets regularly.
