const { getDatabase } = require('./firebaseAdmin');

const USERS_COLLECTION = 'users';
const EMAIL_INDEX_PATH = 'indexes/email';
const USERNAME_INDEX_PATH = 'indexes/username';

function usersRef() {
  return getDatabase().ref(USERS_COLLECTION);
}

function normaliseKey(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/[.#$/\[\]]/g, '_');
}

function normaliseUserRecord(id, payload) {
  if (!payload) {
    return null;
  }

  return {
    id,
    email: payload.email,
    username: payload.username,
    usernameLower: payload.usernameLower,
    salt: payload.salt,
    passwordHash: payload.passwordHash,
    createdAt: payload.createdAt,
    lastLoginAt: payload.lastLoginAt,
    friends: payload.friends || {},
  };
}

async function reserveIndex(ref, userId) {
  const result = await ref.transaction((current) => {
    if (current === null) {
      return userId;
    }
    return current;
  });

  return result;
}

async function releaseIndex(ref) {
  try {
    await ref.remove();
  } catch (error) {
    console.warn('Failed to release index', ref.toString(), error);
  }
}

async function backfillIndex(path, key, userId) {
  if (!key || !userId) {
    return;
  }

  try {
    await getDatabase().ref(`${path}/${key}`).set(userId);
  } catch (error) {
    console.warn('Failed to backfill index', path, key, error);
  }
}

async function findUserByEmail(email) {
  const db = getDatabase();
  const key = normaliseKey(email);
  if (!key) {
    return null;
  }

  const indexSnapshot = await db.ref(`${EMAIL_INDEX_PATH}/${key}`).once('value');
  const userId = indexSnapshot.val();

  if (!userId) {
    const fallback = await usersRef()
      .orderByChild('email')
      .equalTo(email)
      .limitToFirst(1)
      .once('value');

    const value = fallback.val();
    if (!value) {
      return null;
    }

    const [legacyId, legacyData] = Object.entries(value)[0];
    await backfillIndex(EMAIL_INDEX_PATH, key, legacyId);
    return normaliseUserRecord(legacyId, legacyData);
  }

  const userSnapshot = await usersRef().child(userId).once('value');
  return normaliseUserRecord(userId, userSnapshot.val());
}

async function findUserByUsernameLower(usernameLower) {
  const db = getDatabase();
  const key = normaliseKey(usernameLower);
  if (!key) {
    return null;
  }

  const indexSnapshot = await db.ref(`${USERNAME_INDEX_PATH}/${key}`).once('value');
  const userId = indexSnapshot.val();

  if (!userId) {
    const fallback = await usersRef()
      .orderByChild('usernameLower')
      .equalTo(usernameLower)
      .limitToFirst(1)
      .once('value');

    const value = fallback.val();
    if (!value) {
      return null;
    }

    const [legacyId, legacyData] = Object.entries(value)[0];
    await backfillIndex(USERNAME_INDEX_PATH, key, legacyId);
    return normaliseUserRecord(legacyId, legacyData);
  }

  const userSnapshot = await usersRef().child(userId).once('value');
  return normaliseUserRecord(userId, userSnapshot.val());
}

async function createUser(payload) {
  const db = getDatabase();
  const createdRef = usersRef().push();
  const userId = createdRef.key;

  const emailKey = normaliseKey(payload.email);
  const usernameKey = normaliseKey(payload.usernameLower);

  const emailIndexRef = db.ref(`${EMAIL_INDEX_PATH}/${emailKey}`);
  const usernameIndexRef = db.ref(`${USERNAME_INDEX_PATH}/${usernameKey}`);

  let emailReserved = false;
  let usernameReserved = false;

  try {
    const emailReservation = await reserveIndex(emailIndexRef, userId);

    if (!emailReservation.committed || emailReservation.snapshot.val() !== userId) {
      const error = new Error('Email already in use');
      error.code = 'EMAIL_TAKEN';
      throw error;
    }

    emailReserved = true;

    const usernameReservation = await reserveIndex(usernameIndexRef, userId);

    if (!usernameReservation.committed || usernameReservation.snapshot.val() !== userId) {
      const error = new Error('Username already in use');
      error.code = 'USERNAME_TAKEN';
      throw error;
    }

    usernameReserved = true;

    await createdRef.set(payload);

    return userId;
  } catch (error) {
    if (usernameReserved) {
      await releaseIndex(usernameIndexRef);
    }

    if (emailReserved) {
      await releaseIndex(emailIndexRef);
    }

    throw error;
  }
}

async function updateUser(userId, updates) {
  await usersRef().child(userId).update(updates);
}

async function getUserById(userId) {
  const snapshot = await usersRef().child(userId).once('value');
  return normaliseUserRecord(userId, snapshot.val());
}

async function searchUsers(query, limit = 10) {
  const lowerQuery = query.toLowerCase();
  const usernameSnapshot = await usersRef()
    .orderByChild('usernameLower')
    .startAt(lowerQuery)
    .endAt(`${lowerQuery}\uf8ff`)
    .limitToFirst(limit)
    .once('value');

  const emailSnapshot = await usersRef()
    .orderByChild('email')
    .startAt(lowerQuery)
    .endAt(`${lowerQuery}\uf8ff`)
    .limitToFirst(limit)
    .once('value');

  const aggregated = new Map();

  function collect(snapshot) {
    const value = snapshot.val();
    if (!value) {
      return;
    }
    Object.entries(value).forEach(([userId, userData]) => {
      aggregated.set(userId, normaliseUserRecord(userId, userData));
    });
  }

  collect(usernameSnapshot);
  collect(emailSnapshot);

  return Array.from(aggregated.values())
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsernameLower,
  getUserById,
  searchUsers,
  updateUser,
};
