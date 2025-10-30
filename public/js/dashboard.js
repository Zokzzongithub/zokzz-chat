import { apiBase } from './config.js';

const usernameTarget = document.getElementById('usernameDisplay');

function redirectToLogin() {
  window.location.replace('/login.html');
}

function renderUsername(username) {
  if (usernameTarget) {
    usernameTarget.textContent = username || 'Unknown user';
  }
}

async function loadProfile() {
  const token = sessionStorage.getItem('authToken');

  if (!token) {
    redirectToLogin();
    return;
  }

  const cachedUser = (() => {
    try {
      const payload = sessionStorage.getItem('zokzz.user');
      return payload ? JSON.parse(payload) : null;
    } catch (error) {
      return null;
    }
  })();

  if (cachedUser?.username) {
    renderUsername(cachedUser.username);
  }

  try {
  const response = await fetch(`${apiBase}/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      redirectToLogin();
      return;
    }

    const data = await response.json();
    if (data?.user) {
      sessionStorage.setItem('zokzz.user', JSON.stringify(data.user));
      renderUsername(data.user.username);
    }
  } catch (error) {
    console.error('Failed to load profile', error);
    redirectToLogin();
  }
}

loadProfile();
