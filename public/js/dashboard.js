import { apiBase, authApiBase } from './config.js';

const token = sessionStorage.getItem('authToken');

if (!token) {
  window.location.replace('/login.html');
}

const layoutParam = new URLSearchParams(window.location.search).get('layout');
const supportedLayouts = new Set(['compact', 'wide']);
if (layoutParam && supportedLayouts.has(layoutParam)) {
  document.body.dataset.layout = layoutParam;
}

const THEME_STORAGE_KEY = 'zokzz.theme';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const sidebarUserEl = document.getElementById('sidebarUser');
const themeToggleButton = document.getElementById('themeToggle');
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
const chatImageButton = document.getElementById('chatImageButton');
const chatImageInput = document.getElementById('chatImageInput');
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

function applyThemePreference(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = nextTheme;

  if (themeToggleButton) {
    const isDark = nextTheme === 'dark';
    themeToggleButton.textContent = isDark ? '☀️' : '🌙';
    themeToggleButton.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to read theme preference', error);
    return null;
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Unable to persist theme preference', error);
  }
}

const initialTheme = getStoredTheme();
applyThemePreference(initialTheme);

themeToggleButton?.addEventListener('click', () => {
  const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  applyThemePreference(nextTheme);
  setStoredTheme(nextTheme);
});

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
    headers['Content-Type'] = 'application/json; charset=UTF-8';
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

  setChatBusy(false);
  toggleDropTarget(false);
  if (chatImageInput) {
    chatImageInput.value = '';
  }

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

function setChatBusy(isBusy) {
  if (!chatFormEl) {
    return;
  }

  chatFormEl.classList.toggle('busy', Boolean(isBusy));
}

function toggleDropTarget(active) {
  if (!chatFormEl) {
    return;
  }

  chatFormEl.classList.toggle('drop-target', Boolean(active));
}

function eventHasFile(event) {
  if (!event.dataTransfer) {
    return false;
  }

  if (event.dataTransfer.items) {
    return Array.from(event.dataTransfer.items).some((item) => item.kind === 'file');
  }

  return event.dataTransfer.files && event.dataTransfer.files.length > 0;
}

function validateImageFile(file) {
  if (!file) {
    return 'No file provided.';
  }

  if (!file.type.startsWith('image/')) {
    return 'Only image files are supported.';
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'Images must be smaller than 2MB.';
  }

  return null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

async function sendImageAttachment(file) {
  if (!state.activeConversationId) {
    alert('Select a friend before sending an image.');
    return;
  }

  toggleDropTarget(false);

  const validationMessage = validateImageFile(file);
  if (validationMessage) {
    alert(validationMessage);
    return;
  }

  if (chatFormEl?.classList.contains('busy')) {
    return;
  }

  try {
    setChatBusy(true);
    const dataUrl = await readFileAsDataUrl(file);
    await apiRequest(`/chats/${state.activeConversationId}/messages`, {
      method: 'POST',
      body: {
        type: 'image',
        imageData: dataUrl,
        imageMimeType: file.type,
      },
    });
    await fetchMessages();
  } catch (error) {
    console.error('Failed to send image', error);
    alert(error.message || 'Could not send image.');
  } finally {
    setChatBusy(false);
  }
}

function normaliseMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const type = message.type || 'text';
  const rawImage = message.image && typeof message.image === 'object' ? message.image : null;
  const imageData = rawImage && typeof rawImage.data === 'string' ? rawImage.data : '';
  return {
    ...message,
    type,
    body: typeof message.body === 'string' ? message.body : '',
    image: type === 'image' && imageData
      ? {
        data: imageData,
        mimeType: typeof rawImage.mimeType === 'string' ? rawImage.mimeType : '',
        size: typeof rawImage.size === 'number' ? rawImage.size : undefined,
      }
      : null,
  };
}

function handleDragOver(event) {
  if (!eventHasFile(event)) {
    return;
  }

  event.preventDefault();
  toggleDropTarget(true);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleDragLeave(event) {
  if (!eventHasFile(event)) {
    return;
  }

  event.preventDefault();
  if (chatFormEl && event.relatedTarget && chatFormEl.contains(event.relatedTarget)) {
    return;
  }
  toggleDropTarget(false);
}

async function handleDrop(event) {
  if (!eventHasFile(event)) {
    return;
  }

  event.preventDefault();
  toggleDropTarget(false);

  const file = event.dataTransfer?.files?.[0];
  if (file) {
    await sendImageAttachment(file);
  }
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

    const messageType = message.type || 'text';
    if (messageType === 'image' && message.image?.data) {
      const image = document.createElement('img');
      image.src = message.image.data;
      image.alt = message.image?.alt || 'Shared image';
      bubble.appendChild(image);

      if (typeof message.body === 'string' && message.body.trim()) {
        const caption = document.createElement('div');
        caption.className = 'message-text';
        caption.textContent = message.body;
        bubble.appendChild(caption);
      }
    } else {
      const content = document.createElement('div');
      content.className = 'message-text';
      const messageBody = typeof message.body === 'string' ? message.body : '';
      if (messageType !== 'text' && !messageBody.trim()) {
        content.textContent = '[Unsupported message]';
      } else {
        content.textContent = messageBody;
      }
      bubble.appendChild(content);
    }

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
        const prepared = normaliseMessage(message);
        if (!prepared) {
          return;
        }

        state.messageIds.add(prepared.id);
        state.messages.push(prepared);
        state.lastMessageAt = prepared.createdAt;
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
    setChatBusy(true);
    await apiRequest(`/chats/${state.activeConversationId}/messages`, {
      method: 'POST',
      body: { type: 'text', body },
    });
    chatInputEl.value = '';
    await fetchMessages();
  } catch (error) {
    console.error('Failed to send message', error);
    alert('Could not send message. Please try again.');
  } finally {
    setChatBusy(false);
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
    toggleDropTarget(false);
    setChatBusy(false);

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

  chatImageButton?.addEventListener('click', () => {
    chatImageInput?.click();
  });

  chatImageInput?.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      await sendImageAttachment(file);
    }
    event.target.value = '';
  });

  [chatFormEl, chatInputEl, chatMessagesEl].forEach((element) => {
    if (!element) {
      return;
    }

    element.addEventListener('dragenter', handleDragOver);
    element.addEventListener('dragover', handleDragOver);
    element.addEventListener('dragleave', handleDragLeave);
    element.addEventListener('drop', handleDrop);
  });

  window.addEventListener('dragend', () => toggleDropTarget(false));
  window.addEventListener('drop', (event) => {
    if (eventHasFile(event)) {
      event.preventDefault();
    }
    toggleDropTarget(false);
  });
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
