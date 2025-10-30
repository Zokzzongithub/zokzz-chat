const express = require('express');
const jwt = require('jsonwebtoken');

const { getDatabase } = require('../services/firebaseAdmin');
const userService = require('../services/userService');
const { hashPassword, verifyPassword } = require('../utils/crypto');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

function ensureFirebaseConfigured(res) {
  try {
    getDatabase();
    return true;
  } catch (error) {
    console.error('Authentication service not configured', error);
    res.status(500).json({ message: 'Authentication service not configured.' });
    return false;
  }
}

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
    },
    secret,
    { expiresIn: '1h' },
  );
}

function normaliseCredentials({ email, password, username }) {
  return {
    email: typeof email === 'string' ? email.trim().toLowerCase() : '',
    password: typeof password === 'string' ? password.trim() : '',
    username: typeof username === 'string' ? username.trim() : '',
  };
}

function validateEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function validatePassword(password) {
  return password.length >= 10;
}

function validateUsername(username) {
  return username.length >= 3;
}

router.post('/register', async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }

  try {
    const { email, password, username } = normaliseCredentials(req.body || {});

    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 10 characters long.' });
    }

    if (!validateUsername(username)) {
      return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
    }

    const existingUser = await userService.findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const existingUsername = await userService.findUserByUsernameLower(username.toLowerCase());

    if (existingUsername) {
      return res.status(409).json({ message: 'Username is already taken.' });
    }

    const { salt, hash } = hashPassword(password);
    const timestamp = new Date().toISOString();

    const userPayload = {
      email,
      username,
      usernameLower: username.toLowerCase(),
      salt,
      passwordHash: hash,
      createdAt: timestamp,
      lastLoginAt: null,
      friends: {},
    };

    const userId = await userService.createUser(userPayload);

    const token = createToken({ id: userId, email, username });

    return res.status(201).json({
      token,
      user: { id: userId, email, username },
    });
  } catch (error) {
    if (error?.code === 'EMAIL_TAKEN') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    if (error?.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ message: 'Username is already taken.' });
    }

    console.error('Registration failed', error);
    return res.status(500).json({ message: 'Unable to register at this time.' });
  }
});

router.post('/login', async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }

  try {
    const { email, password } = normaliseCredentials(req.body || {});

    if (!validateEmail(email) || !password) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const userRecord = await userService.findUserByEmail(email);

    if (!userRecord) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isPasswordValid = verifyPassword(password, userRecord.salt, userRecord.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const now = new Date().toISOString();

    userService
      .updateUser(userRecord.id, { lastLoginAt: now })
      .catch((error) => console.error('Failed to update lastLoginAt', error));

    const token = createToken({
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username,
    });

    return res.json({
      token,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        username: userRecord.username,
      },
    });
  } catch (error) {
    console.error('Login failed', error);
    return res.status(500).json({ message: 'Unable to login at this time.' });
  }
});

router.get('/profile', requireAuth, async (req, res) => {
  if (!ensureFirebaseConfigured(res)) {
    return;
  }

  try {
    const user = await userService.getUserById(req.user.sub);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Profile fetch failed', error);
    return res.status(500).json({ message: 'Unable to fetch profile.' });
  }
});

module.exports = router;
