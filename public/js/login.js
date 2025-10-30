import { authApiBase } from './config.js';

const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const feedbackEl = document.getElementById('authFeedback');

function setActiveTab(mode) {
  const showLogin = mode === 'login';

  loginTab.classList.toggle('active', showLogin);
  registerTab.classList.toggle('active', !showLogin);

  loginForm.classList.toggle('hidden', !showLogin);
  registerForm.classList.toggle('hidden', showLogin);

  clearFeedback();
}

function showFeedback(message, type = 'error') {
  if (!feedbackEl) {
    return;
  }

  feedbackEl.textContent = message;
  feedbackEl.classList.remove('error', 'success');

  if (type === 'success') {
    feedbackEl.classList.add('success');
  } else {
    feedbackEl.classList.add('error');
  }
}

function clearFeedback() {
  if (!feedbackEl) {
    return;
  }

  feedbackEl.textContent = '';
  feedbackEl.classList.remove('error', 'success');
}

async function authenticate(endpoint, payload) {
  const response = await fetch(`${authApiBase}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({ message: 'Unexpected response from server.' }));

  if (!response.ok) {
    const message = data?.message || 'Authentication failed.';
    throw new Error(message);
  }

  return data;
}

function persistSession({ token, user }) {
  sessionStorage.setItem('authToken', token);
  sessionStorage.setItem('zokzz.user', JSON.stringify(user));
}

function redirectToDashboard() {
  window.location.href = '/dashboard.html';
}

loginTab?.addEventListener('click', () => setActiveTab('login'));
registerTab?.addEventListener('click', () => setActiveTab('register'));

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFeedback();

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const result = await authenticate('login', payload);
    persistSession(result);
    redirectToDashboard();
  } catch (error) {
    showFeedback(error.message || 'Unable to log in.');
  }
});

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFeedback();

  const formData = new FormData(registerForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const result = await authenticate('register', payload);
    showFeedback('Account created! Signing you in...', 'success');
    persistSession(result);
    setTimeout(redirectToDashboard, 650);
  } catch (error) {
    showFeedback(error.message || 'Unable to register.');
  }
});

setActiveTab('login');
