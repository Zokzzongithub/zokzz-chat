const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.FIREBASE_DATABASE_URL || !process.env.FIREBASE_DATABASE_SECRET) {
  // Warn early when backend secrets are missing to avoid leaking credentials in the client.
  console.warn('Firebase configuration is incomplete. Set FIREBASE_DATABASE_URL and FIREBASE_DATABASE_SECRET in your .env file.');
}

app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Zokzz Chat server listening on http://localhost:${PORT}`);
});
