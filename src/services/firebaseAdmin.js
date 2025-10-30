const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let initialised = false;

function loadServiceAccount() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (base64) {
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  }

  if (filePath) {
    const resolvedPath = path.resolve(filePath);
    const fileContents = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(fileContents);
  }

  throw new Error('Firebase Admin credentials are not configured.');
}

function ensureApp() {
  if (initialised) {
    return admin.app();
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL must be set.');
  }

  const credential = admin.credential.cert(loadServiceAccount());

  admin.initializeApp({
    credential,
    databaseURL,
  });

  initialised = true;
  return admin.app();
}

function getDatabase() {
  return ensureApp().database();
}

module.exports = {
  getAdminApp: ensureApp,
  getDatabase,
};
