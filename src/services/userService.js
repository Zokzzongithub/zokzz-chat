const { getDatabase } = require('./firebaseAdmin');

const USERS_COLLECTION = 'users';

function usersRef() {
  return getDatabase().ref(USERS_COLLECTION);
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

async function findUserByEmail(email) {
  const snapshot = await usersRef()
    .orderByChild('email')
    .equalTo(email)
    .limitToFirst(1)
    .once('value');

  const value = snapshot.val();
  if (!value) {
    return null;
  }

  const [userId, userData] = Object.entries(value)[0];
  return normaliseUserRecord(userId, userData);
}

async function findUserByUsernameLower(usernameLower) {
  const snapshot = await usersRef()
    .orderByChild('usernameLower')
    .equalTo(usernameLower)
    .limitToFirst(1)
    .once('value');

  const value = snapshot.val();
  if (!value) {
    return null;
  }

  const [userId, userData] = Object.entries(value)[0];
  return normaliseUserRecord(userId, userData);
}

async function createUser(payload) {
  const createdRef = usersRef().push();
  await createdRef.set(payload);
  return createdRef.key;
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
