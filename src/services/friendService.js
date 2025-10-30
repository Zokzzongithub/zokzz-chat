const { getDatabase } = require('./firebaseAdmin');
const userService = require('./userService');

const FRIEND_REQUESTS_COLLECTION = 'friendRequests';

function friendRequestsRef() {
  return getDatabase().ref(FRIEND_REQUESTS_COLLECTION);
}

function buildPairKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

async function findRequestBetween(userA, userB) {
  const snapshot = await friendRequestsRef()
    .orderByChild('pairKey')
    .equalTo(buildPairKey(userA, userB))
    .limitToFirst(1)
    .once('value');

  const value = snapshot.val();
  if (!value) {
    return null;
  }

  const [requestId, requestData] = Object.entries(value)[0];
  return { id: requestId, ...requestData };
}

async function sendFriendRequest(fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    throw new Error('Cannot send a friend request to yourself.');
  }

  const fromUser = await userService.getUserById(fromUserId);
  const toUser = await userService.getUserById(toUserId);

  if (!fromUser || !toUser) {
    throw new Error('User not found.');
  }

  if (fromUser.friends && fromUser.friends[toUserId]) {
    return { alreadyFriends: true };
  }

  const existingRequest = await findRequestBetween(fromUserId, toUserId);

  if (existingRequest) {
    if (existingRequest.status === 'accepted') {
      return { alreadyFriends: true };
    }

    if (existingRequest.status === 'pending') {
      if (existingRequest.from === fromUserId && existingRequest.to === toUserId) {
        return { alreadyRequested: true };
      }

      if (existingRequest.from === toUserId && existingRequest.to === fromUserId) {
        await acceptFriendRequest(existingRequest.id, fromUserId);
        return { autoAccepted: true };
      }
    }
  }

  const now = new Date().toISOString();
  const payload = {
    from: fromUserId,
    to: toUserId,
    status: 'pending',
    createdAt: now,
    respondedAt: null,
    pairKey: buildPairKey(fromUserId, toUserId),
  };

  const requestRef = friendRequestsRef().push();
  await requestRef.set(payload);

  return { requestId: requestRef.key };
}

async function listIncomingRequests(userId) {
  const snapshot = await friendRequestsRef()
    .orderByChild('to')
    .equalTo(userId)
    .once('value');

  const value = snapshot.val();
  if (!value) {
    return [];
  }

  return Object.entries(value)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listOutgoingRequests(userId) {
  const snapshot = await friendRequestsRef()
    .orderByChild('from')
    .equalTo(userId)
    .once('value');

  const value = snapshot.val();
  if (!value) {
    return [];
  }

  return Object.entries(value)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function markFriendship(userA, userB) {
  const updates = {};
  updates[`users/${userA}/friends/${userB}`] = true;
  updates[`users/${userB}/friends/${userA}`] = true;

  await getDatabase().ref().update(updates);
}

async function acceptFriendRequest(requestId, actingUserId) {
  const snapshot = await friendRequestsRef().child(requestId).once('value');
  const request = snapshot.val();

  if (!request) {
    throw new Error('Request not found.');
  }

  if (request.to !== actingUserId) {
    throw new Error('Only the recipient can accept this request.');
  }

  if (request.status !== 'pending') {
    return { alreadyProcessed: true, request };
  }

  const now = new Date().toISOString();

  await friendRequestsRef().child(requestId).update({
    status: 'accepted',
    respondedAt: now,
  });

  await markFriendship(request.from, request.to);

  return { accepted: true };
}

async function declineFriendRequest(requestId, actingUserId) {
  const snapshot = await friendRequestsRef().child(requestId).once('value');
  const request = snapshot.val();

  if (!request) {
    throw new Error('Request not found.');
  }

  if (request.to !== actingUserId) {
    throw new Error('Only the recipient can decline this request.');
  }

  if (request.status !== 'pending') {
    return { alreadyProcessed: true, request };
  }

  const now = new Date().toISOString();

  await friendRequestsRef().child(requestId).update({
    status: 'declined',
    respondedAt: now,
  });

  return { declined: true };
}

async function getFriends(userId) {
  const user = await userService.getUserById(userId);

  if (!user || !user.friends) {
    return [];
  }

  const friendIds = Object.keys(user.friends);
  const friends = await Promise.all(friendIds.map((id) => userService.getUserById(id)));
  return friends.filter(Boolean);
}

module.exports = {
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  listIncomingRequests,
  listOutgoingRequests,
  sendFriendRequest,
};
