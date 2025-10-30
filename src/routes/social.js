const express = require('express');

const requireAuth = require('../middleware/requireAuth');
const userService = require('../services/userService');
const friendService = require('../services/friendService');
const chatService = require('../services/chatService');

const router = express.Router();

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

router.get('/users/search', requireAuth, asyncHandler(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (query.length < 2) {
    return res.json({ results: [] });
  }

  const currentUser = await userService.getUserById(req.user.sub);
  if (!currentUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const [incoming, outgoing, results] = await Promise.all([
    friendService.listIncomingRequests(req.user.sub),
    friendService.listOutgoingRequests(req.user.sub),
    userService.searchUsers(query, 10),
  ]);

  const incomingMap = new Map(incoming.map((request) => [request.from, request]));
  const outgoingMap = new Map(outgoing.map((request) => [request.to, request]));

  const response = results
    .filter((user) => user.id !== req.user.sub)
    .map((user) => {
      let relationship = 'none';

      if (currentUser.friends && currentUser.friends[user.id]) {
        relationship = 'friend';
      } else if (incomingMap.has(user.id)) {
        relationship = 'incoming-request';
      } else if (outgoingMap.has(user.id)) {
        relationship = 'outgoing-request';
      }

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        relationship,
      };
    });

  res.json({ results: response });
}));

router.post('/friends/request', requireAuth, asyncHandler(async (req, res) => {
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';

  if (!targetUserId) {
    return res.status(400).json({ message: 'targetUserId is required.' });
  }

  const outcome = await friendService.sendFriendRequest(req.user.sub, targetUserId);

  if (outcome.alreadyFriends) {
    return res.status(200).json({ message: 'You are already friends.' });
  }

  if (outcome.alreadyRequested) {
    return res.status(200).json({ message: 'Friend request already sent.' });
  }

  if (outcome.autoAccepted) {
    return res.status(200).json({ message: 'You are now friends.' });
  }

  return res.status(201).json({
    message: 'Friend request sent.',
    requestId: outcome.requestId,
  });
}));

router.get('/friends/requests', requireAuth, asyncHandler(async (req, res) => {
  const [incoming, outgoing] = await Promise.all([
    friendService.listIncomingRequests(req.user.sub),
    friendService.listOutgoingRequests(req.user.sub),
  ]);

  const incomingWithUsers = await Promise.all(incoming.map(async (request) => {
    const fromUser = await userService.getUserById(request.from);
    return {
      id: request.id,
      from: fromUser ? { id: fromUser.id, username: fromUser.username, email: fromUser.email } : null,
      status: request.status,
      createdAt: request.createdAt,
    };
  }));

  const outgoingWithUsers = await Promise.all(outgoing.map(async (request) => {
    const toUser = await userService.getUserById(request.to);
    return {
      id: request.id,
      to: toUser ? { id: toUser.id, username: toUser.username, email: toUser.email } : null,
      status: request.status,
      createdAt: request.createdAt,
    };
  }));

  res.json({
    incoming: incomingWithUsers,
    outgoing: outgoingWithUsers,
  });
}));

router.post('/friends/requests/:requestId/accept', requireAuth, asyncHandler(async (req, res) => {
  await friendService.acceptFriendRequest(req.params.requestId, req.user.sub);
  res.json({ message: 'Friend request accepted.' });
}));

router.post('/friends/requests/:requestId/decline', requireAuth, asyncHandler(async (req, res) => {
  await friendService.declineFriendRequest(req.params.requestId, req.user.sub);
  res.json({ message: 'Friend request declined.' });
}));

router.get('/friends', requireAuth, asyncHandler(async (req, res) => {
  const friends = await friendService.getFriends(req.user.sub);
  const mapped = friends.map((friend) => ({
    id: friend.id,
    username: friend.username,
    email: friend.email,
  }));
  res.json({ friends: mapped });
}));

router.post('/chats', requireAuth, asyncHandler(async (req, res) => {
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';

  if (!targetUserId) {
    return res.status(400).json({ message: 'targetUserId is required.' });
  }

  const currentUser = await userService.getUserById(req.user.sub);
  if (!currentUser?.friends || !currentUser.friends[targetUserId]) {
    return res.status(403).json({ message: 'You can only chat with friends.' });
  }

  const conversationId = await chatService.ensureConversation(req.user.sub, targetUserId);
  res.status(201).json({ conversationId });
}));

router.get('/chats', requireAuth, asyncHandler(async (req, res) => {
  const conversations = await chatService.listConversations(req.user.sub);

  const payload = conversations.map((conversation) => ({
    id: conversation.id,
    updatedAt: conversation.updatedAt,
    otherUser: conversation.otherUser
      ? {
        id: conversation.otherUser.id,
        username: conversation.otherUser.username,
        email: conversation.otherUser.email,
      }
      : null,
  }));

  res.json({ conversations: payload });
}));

router.get('/chats/:conversationId/messages', requireAuth, asyncHandler(async (req, res) => {
  await chatService.ensureParticipant(req.params.conversationId, req.user.sub);
  const since = typeof req.query.since === 'string' ? req.query.since : undefined;
  const messages = await chatService.fetchMessages(req.params.conversationId, since);
  res.json({ messages });
}));

router.post('/chats/:conversationId/messages', requireAuth, asyncHandler(async (req, res) => {
  await chatService.ensureParticipant(req.params.conversationId, req.user.sub);

  const rawType = typeof req.body?.type === 'string' ? req.body.type.toLowerCase() : 'text';
  const payload = {
    type: rawType === 'image' ? 'image' : 'text',
  };

  if (typeof req.body?.body === 'string') {
    payload.body = req.body.body;
  }

  if (typeof req.body?.imageData === 'string') {
    payload.imageData = req.body.imageData;
  }

  if (typeof req.body?.imageMimeType === 'string') {
    payload.imageMimeType = req.body.imageMimeType;
  }

  try {
    const message = await chatService.appendMessage(req.params.conversationId, req.user.sub, payload);
    res.status(201).json({ message });
  } catch (error) {
    const clientErrorCodes = new Set([
      'MESSAGE_BODY_REQUIRED',
      'INVALID_IMAGE',
      'IMAGE_TOO_LARGE',
      'UNSUPPORTED_MESSAGE_TYPE',
    ]);

    if (clientErrorCodes.has(error.code)) {
      return res.status(400).json({ message: error.message });
    }

    console.error('Failed to append message', error);
    throw error;
  }
}));

module.exports = router;
