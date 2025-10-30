import { apiBase, authApiBase } from './config.js';

const token = sessionStorage.getItem('authToken');

if (!token) {
  window.location.replace('/login.html');
}

const sidebarUserEl = document.getElementById('sidebarUser');
const searchInputEl = document.getElementById('friendSearchInput');
const searchResultsEl = document.getElementById('searchResults');
const incomingRequestsEl = document.getElementById('incomingRequests');
const outgoingRequestsEl = document.getElementById('outgoingRequests');
const friendsListEl = document.getElementById('friendsList');
const incomingCountEl = document.getElementById('incomingCount');
const friendsCountEl = document.getElementById('friendsCount');
const chatPlaceholderEl = document.getElementById('chatPlaceholder');
const chatWindowEl = document.getElementById('chatWindow');
const chatFriendNameEl = document.getElementById('chatFriendName');
const chatFriendEmailEl = document.getElementById('chatFriendEmail');
const chatMessagesEl = document.getElementById('chatMessages');
const chatFormEl = document.getElementById('chatForm');
const chatInputEl = document.getElementById('chatInput');
const closeChatButton = document.getElementById('closeChat');

const state = {
  user: null,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  searchResults: [],
  activeConversationId: null,
  activeFriend: null,
  messages: [],
  messageIds: new Set(),
  lastMessageAt: null,
  pollTimer: null,
  latestSearchTerm: '',
};

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

async function apiRequest(path, { method = 'GET', body, base = apiBase } = {}) {
  const headers = { Authorization: `Bearer ${token}` };

  const options = { method, headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  const data = text ? parseJsonSafe(text) : null;

  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function updateSidebarUser() {
  if (!sidebarUserEl) {
    return;
  }

  sidebarUserEl.textContent = state.user ? state.user.username : 'Unknown user';
}

function setEmptyState(el, message) {
  el.classList.add('empty-state');
  el.textContent = message;
}

function resetList(el) {
  el.classList.remove('empty-state');
  el.innerHTML = '';
}

function createSidebarItem({ title, subtitle, actions = [] }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'sidebar-item';

  const textContainer = document.createElement('div');
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  const subtitleEl = document.createElement('span');
  subtitleEl.textContent = subtitle;
  textContainer.appendChild(titleEl);
  textContainer.appendChild(subtitleEl);
  wrapper.appendChild(textContainer);

  if (actions.length) {
    const actionContainer = document.createElement('div');
    actionContainer.className = 'sidebar-actions';
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (action.variant === 'ghost') {
        button.classList.add('ghost');
      }
      if (action.disabled) {
        button.disabled = true;
      }
      if (action.onClick) {
        button.addEventListener('click', action.onClick);
      }
      actionContainer.appendChild(button);
    });
    wrapper.appendChild(actionContainer);
  }

  return wrapper;
}

function renderIncomingRequests() {
  if (!incomingRequestsEl) {
    return;
  }

  const incoming = state.incomingRequests;
  incomingCountEl.textContent = incoming.length.toString();

  if (!incoming.length) {
    setEmptyState(incomingRequestsEl, 'No incoming requests');
    return;
  }

  resetList(incomingRequestsEl);

  incoming.forEach((request) => {
    const requester = request.from;
    const item = createSidebarItem({
      title: requester?.username || 'Unknown user',
      subtitle: requester?.email || 'No email provided',
      actions: [
        {
          label: 'Accept',
          onClick: () => handleAcceptRequest(request.id),
        },
        {
          label: 'Decline',
          variant: 'ghost',
          onClick: () => handleDeclineRequest(request.id),
        },
      ],
    });
    incomingRequestsEl.appendChild(item);
  });
}

function renderOutgoingRequests() {
  if (!outgoingRequestsEl) {
    return;
  }

  const outgoing = state.outgoingRequests;

  if (!outgoing.length) {
    setEmptyState(outgoingRequestsEl, 'No pending requests');
    return;
  }

  resetList(outgoingRequestsEl);

  outgoing.forEach((request) => {
    const target = request.to;
    const item = createSidebarItem({
      title: target?.username || 'Unknown user',
      subtitle: target?.email || 'No email provided',
      actions: [
        {
          label: 'Pending',
          disabled: true,
        },
      ],
    });
    outgoingRequestsEl.appendChild(item);
  });
}

function renderFriends() {
  if (!friendsListEl) {
    return;
  }

  const friends = state.friends;
  friendsCountEl.textContent = friends.length.toString();

  if (!friends.length) {
    setEmptyState(friendsListEl, 'You have no friends yet');
    return;
  }

  resetList(friendsListEl);

  friends.forEach((friend) => {
    const item = createSidebarItem({
      title: friend.username,
      subtitle: friend.email,
      actions: [
        {
          label: 'Message',
          onClick: () => openConversation(friend),
        },
      ],
    });
    friendsListEl.appendChild(item);
  });
}

function renderSearchResults() {
  if (!searchResultsEl) {
    return;
  }

  const results = state.searchResults;

  if (!state.latestSearchTerm) {
    setEmptyState(searchResultsEl, 'Start typing to search');
    return;
  }

  if (!results.length) {
    setEmptyState(searchResultsEl, 'No users found');
    return;
  }

  resetList(searchResultsEl);

  results.forEach((user) => {
    const actions = [];

    if (user.relationship === 'friend') {
      actions.push({ label: 'Message', onClick: () => openConversation(user) });
    } else if (user.relationship === 'incoming-request') {
      actions.push({ label: 'Respond', variant: 'ghost', disabled: true });
    } else if (user.relationship === 'outgoing-request') {
      actions.push({ label: 'Pending', disabled: true });
    } else {
      actions.push({ label: 'Add friend', onClick: () => handleSendRequest(user.id) });
    }

    const item = createSidebarItem({
      title: user.username,
      subtitle: user.email,
      actions,
    });
    searchResultsEl.appendChild(item);
  });
}

function clearChatState() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  state.activeConversationId = null;
  state.activeFriend = null;
  state.messages = [];
  state.messageIds = new Set();
  state.lastMessageAt = null;

  chatWindowEl?.classList.add('hidden');
  chatPlaceholderEl?.classList.remove('hidden');
}

function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderMessages() {
  if (!chatMessagesEl) {
    return;
  }

  chatMessagesEl.innerHTML = '';

  state.messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (message.senderId === state.user?.id) {
      bubble.classList.add('self');
    }

    const content = document.createElement('div');
    content.textContent = message.body;
    bubble.appendChild(content);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatTime(message.createdAt);
    bubble.appendChild(meta);

    chatMessagesEl.appendChild(bubble);
  });

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function fetchMessages() {
  if (!state.activeConversationId) {
    return;
  }

  try {
    const sinceParam = state.lastMessageAt ? `?since=${encodeURIComponent(state.lastMessageAt)}` : '';
    const response = await apiRequest(`/chats/${state.activeConversationId}/messages${sinceParam}`);
    const newMessages = response.messages || [];

    let updated = false;

    newMessages.forEach((message) => {
      if (!state.messageIds.has(message.id)) {
        state.messageIds.add(message.id);
        state.messages.push(message);
        state.lastMessageAt = message.createdAt;
        updated = true;
      }
    });

    if (updated) {
      renderMessages();
    }
  } catch (error) {
    console.error('Failed to fetch messages', error);
  }
}

async function sendMessage(event) {
  event.preventDefault();

  if (!state.activeConversationId) {
    return;
  }

  const body = chatInputEl?.value || '';
  if (!body.trim()) {
    return;
  }

  try {
    chatFormEl.classList.add('busy');
    await apiRequest(`/chats/${state.activeConversationId}/messages`, {
      method: 'POST',
      body: { body },
    });
    chatInputEl.value = '';
    await fetchMessages();
  } catch (error) {
    console.error('Failed to send message', error);
    alert('Could not send message. Please try again.');
  } finally {
    chatFormEl.classList.remove('busy');
  }
}

async function openConversation(friend) {
  try {
    const response = await apiRequest('/chats', {
      method: 'POST',
      body: { targetUserId: friend.id },
    });

    state.activeConversationId = response.conversationId;
    state.activeFriend = friend;
    state.messages = [];
    state.messageIds = new Set();
    state.lastMessageAt = null;

    if (chatFriendNameEl) {
      chatFriendNameEl.textContent = friend.username;
    }

    if (chatFriendEmailEl) {
      chatFriendEmailEl.textContent = friend.email;
    }

    chatPlaceholderEl?.classList.add('hidden');
    chatWindowEl?.classList.remove('hidden');

    await fetchMessages();

    if (state.pollTimer) {
      clearInterval(state.pollTimer);
    }

    state.pollTimer = setInterval(fetchMessages, 3500);
  } catch (error) {
    console.error('Failed to open conversation', error);
    alert(error.message || 'Unable to start chat.');
  }
}

async function refreshFriendRequests() {
  try {
    const response = await apiRequest('/friends/requests');
    state.incomingRequests = (response.incoming || []).filter((req) => req.status === 'pending');
    state.outgoingRequests = (response.outgoing || []).filter((req) => req.status === 'pending');
    renderIncomingRequests();
    renderOutgoingRequests();
  } catch (error) {
    console.error('Failed to fetch friend requests', error);
  }
}

async function refreshFriends() {
  try {
    const response = await apiRequest('/friends');
    state.friends = response.friends || [];
    renderFriends();
  } catch (error) {
    console.error('Failed to fetch friends', error);
  }
}

async function handleAcceptRequest(requestId) {
  try {
    await apiRequest(`/friends/requests/${requestId}/accept`, { method: 'POST' });
    await Promise.all([refreshFriendRequests(), refreshFriends()]);
  } catch (error) {
    console.error('Failed to accept request', error);
    alert(error.message || 'Unable to accept request.');
  }
}

async function handleDeclineRequest(requestId) {
  try {
    await apiRequest(`/friends/requests/${requestId}/decline`, { method: 'POST' });
    await refreshFriendRequests();
  } catch (error) {
    console.error('Failed to decline request', error);
    alert(error.message || 'Unable to decline request.');
  }
}

async function handleSendRequest(targetUserId) {
  try {
    await apiRequest('/friends/request', {
      method: 'POST',
      body: { targetUserId },
    });
    await Promise.all([refreshFriendRequests(), refreshFriends()]);
    performSearch(state.latestSearchTerm);
  } catch (error) {
    console.error('Failed to send friend request', error);
    alert(error.message || 'Unable to send friend request.');
  }
}

function debounceSearch(term) {
  state.latestSearchTerm = term;

  if (!searchResultsEl) {
    return;
  }

  searchResultsEl.classList.add('empty-state');
  searchResultsEl.textContent = term.length >= 2 ? 'Searching…' : 'Start typing to search';
}

let searchTimer;

function performSearch(term) {
  const query = term.trim();
  state.latestSearchTerm = query;

  if (query.length < 2) {
    state.searchResults = [];
    renderSearchResults();
    return;
  }

  debounceSearch(query);

  if (searchTimer) {
    clearTimeout(searchTimer);
  }

  searchTimer = setTimeout(async () => {
    try {
      const response = await apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
      if (state.latestSearchTerm !== query) {
        return;
      }
      state.searchResults = response.results || [];
      renderSearchResults();
    } catch (error) {
      console.error('Search failed', error);
      state.searchResults = [];
      renderSearchResults();
    }
  }, 300);
}

function attachEventListeners() {
  searchInputEl?.addEventListener('input', (event) => {
    performSearch(event.target.value || '');
  });

  chatFormEl?.addEventListener('submit', sendMessage);
  closeChatButton?.addEventListener('click', clearChatState);
}

async function loadProfile() {
  const cachedUser = (() => {
    try {
      const payload = sessionStorage.getItem('zokzz.user');
      return payload ? JSON.parse(payload) : null;
    } catch (error) {
      return null;
    }
  })();

  if (cachedUser) {
    state.user = cachedUser;
    updateSidebarUser();
  }

  try {
    const response = await apiRequest('/profile', { base: authApiBase });
    const freshUser = response.user;
    if (freshUser) {
      state.user = freshUser;
      sessionStorage.setItem('zokzz.user', JSON.stringify(freshUser));
      updateSidebarUser();
    }
  } catch (error) {
    console.error('Failed to load profile', error);
    window.location.replace('/login.html');
  }
}

async function initialise() {
  attachEventListeners();
  await loadProfile();
  await Promise.all([refreshFriendRequests(), refreshFriends()]);
}

initialise().catch((error) => {
  console.error('Failed to initialise dashboard', error);
});
