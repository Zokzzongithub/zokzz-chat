const { getDatabase } = require('./firebaseAdmin');
const userService = require('./userService');

const CONVERSATIONS_COLLECTION = 'conversations';
const USER_CONVERSATIONS_COLLECTION = 'userConversations';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MESSAGE_ENCODING = 'utf-8';

function createError(message, code) {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  return error;
}

function parseImagePayload(dataUrl, fallbackMimeType) {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    throw createError('Image attachment is required.', 'INVALID_IMAGE');
  }

  const trimmed = dataUrl.trim();
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);

  let mimeType = fallbackMimeType || '';
  let base64Payload;

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64Payload = dataUrlMatch[2];
  } else if (trimmed.startsWith('data:')) {
    const markerIndex = trimmed.indexOf(';base64,');
    if (markerIndex === -1) {
      throw createError('Invalid image encoding.', 'INVALID_IMAGE');
    }
    mimeType = trimmed.substring('data:'.length, markerIndex);
    base64Payload = trimmed.substring(markerIndex + ';base64,'.length);
  } else {
    base64Payload = trimmed;
  }

  if (!mimeType) {
    throw createError('Only image attachments are supported.', 'INVALID_IMAGE');
  }

  if (!mimeType.startsWith('image/')) {
    throw createError('Only image attachments are supported.', 'INVALID_IMAGE');
  }

  const sanitizedBase64 = base64Payload.replace(/\s/g, '');

  let buffer;
  try {
    buffer = Buffer.from(sanitizedBase64, 'base64');
  } catch (error) {
    throw createError('Invalid image encoding.', 'INVALID_IMAGE');
  }

  if (!buffer || buffer.length === 0) {
    throw createError('Invalid image encoding.', 'INVALID_IMAGE');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createError('Image must be smaller than 2MB.', 'IMAGE_TOO_LARGE');
  }

  return {
    data: `data:${mimeType};base64,${sanitizedBase64}`,
    mimeType,
    size: buffer.length,
  };
}

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
    .map(([id, data]) => {
      const type = data?.type || 'text';
      const message = {
        id,
        ...data,
        type,
      };

      if (type !== 'image') {
        delete message.image;
      }

      return message;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function appendMessage(conversationId, senderId, payload) {
  const messagePayload = payload && typeof payload === 'object' ? payload : {};
  const type = messagePayload.type || 'text';
  const now = new Date().toISOString();
  const messageRef = conversationRef(conversationId).child('messages').push();

  const record = {
    senderId,
    type,
    createdAt: now,
    encoding: MESSAGE_ENCODING,
  };

  if (type === 'image') {
    const image = parseImagePayload(messagePayload.imageData, messagePayload.imageMimeType);
    record.image = image;

    if (typeof messagePayload.body === 'string' && messagePayload.body.trim()) {
      record.body = messagePayload.body.trim();
    }
  } else if (type === 'text') {
    const body = typeof messagePayload.body === 'string' ? messagePayload.body.trim() : '';
    if (!body) {
      throw createError('Message body is required.', 'MESSAGE_BODY_REQUIRED');
    }
    record.body = body;
  } else {
    throw createError('Unsupported message type.', 'UNSUPPORTED_MESSAGE_TYPE');
  }

  await messageRef.set(record);

  const preview = record.type === 'image'
    ? '[image]'
    : (record.body || '').slice(0, 120);

  await conversationRef(conversationId).update({
    updatedAt: now,
    lastMessagePreview: preview,
    lastMessageSender: senderId,
    lastMessageAt: now,
  });

  return { id: messageRef.key, createdAt: now, type: record.type };
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
