const { getDatabase } = require('./firebaseAdmin');
const userService = require('./userService');

const CONVERSATIONS_COLLECTION = 'conversations';
const USER_CONVERSATIONS_COLLECTION = 'userConversations';

function getConversationId(userA, userB) {
  return [userA, userB].sort().join('__');
}

function conversationRef(conversationId) {
  return getDatabase().ref(`${CONVERSATIONS_COLLECTION}/${conversationId}`);
}

function userConversationsRef(userId) {
  return getDatabase().ref(`${USER_CONVERSATIONS_COLLECTION}/${userId}`);
}

async function ensureConversation(userA, userB) {
  const conversationId = getConversationId(userA, userB);
  const ref = conversationRef(conversationId);
  const snapshot = await ref.once('value');

  if (!snapshot.exists()) {
    const now = new Date().toISOString();
    await ref.set({
      participants: {
        [userA]: true,
        [userB]: true,
      },
      createdAt: now,
      updatedAt: now,
    });

    const updates = {};
    updates[`${USER_CONVERSATIONS_COLLECTION}/${userA}/${conversationId}`] = true;
    updates[`${USER_CONVERSATIONS_COLLECTION}/${userB}/${conversationId}`] = true;
    await getDatabase().ref().update(updates);
  }

  return conversationId;
}

async function listConversations(userId) {
  const snapshot = await userConversationsRef(userId).once('value');
  const value = snapshot.val();

  if (!value) {
    return [];
  }

  const conversationIds = Object.keys(value);
  const conversations = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const convSnapshot = await conversationRef(conversationId).once('value');
      const payload = convSnapshot.val();
      if (!payload) {
        return null;
      }

      const otherParticipantId = Object.keys(payload.participants || {})
        .find((participantId) => participantId !== userId);

      const otherUser = otherParticipantId
        ? await userService.getUserById(otherParticipantId)
        : null;

      return {
        id: conversationId,
        otherUser,
        updatedAt: payload.updatedAt,
      };
    }),
  );

  return conversations.filter(Boolean).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function fetchMessages(conversationId, since) {
  const ref = conversationRef(conversationId).child('messages');
  let query = ref.orderByChild('createdAt');

  if (since) {
    query = query.startAt(since);
  }

  const snapshot = await query.limitToLast(100).once('value');
  const value = snapshot.val();

  if (!value) {
    return [];
  }

  return Object.entries(value)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function appendMessage(conversationId, senderId, body) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error('Message body required.');
  }

  const now = new Date().toISOString();
  const messageRef = conversationRef(conversationId).child('messages').push();

  await messageRef.set({
    senderId,
    body: trimmed,
    createdAt: now,
  });

  await conversationRef(conversationId).update({
    updatedAt: now,
    lastMessagePreview: trimmed.slice(0, 120),
    lastMessageSender: senderId,
    lastMessageAt: now,
  });

  return { id: messageRef.key, createdAt: now };
}

async function getConversation(conversationId) {
  const snapshot = await conversationRef(conversationId).once('value');
  return snapshot.val();
}

async function ensureParticipant(conversationId, userId) {
  const conversation = await getConversation(conversationId);

  if (!conversation || !conversation.participants || !conversation.participants[userId]) {
    throw new Error('Conversation not found.');
  }

  return conversation;
}

module.exports = {
  appendMessage,
  ensureConversation,
  ensureParticipant,
  fetchMessages,
  getConversationId,
  getConversation,
  listConversations,
};
