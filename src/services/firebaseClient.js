const { URLSearchParams } = require('url');

const fetchFn = globalThis.fetch
  ? globalThis.fetch.bind(globalThis)
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class FirebaseClient {
  constructor(databaseUrl, authSecret) {
    if (!databaseUrl || !authSecret) {
      throw new Error('FirebaseClient requires both database URL and secret.');
    }

    this.databaseUrl = databaseUrl.replace(/\/$/, '');
    this.authSecret = authSecret;
  }

  buildUrl(pathSuffix, query = {}) {
    const sanitizedSuffix = pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`;
    const params = new URLSearchParams({ ...query, auth: this.authSecret });
    return `${this.databaseUrl}${sanitizedSuffix}.json?${params.toString()}`;
  }

  async createUser(payload) {
    const response = await fetchFn(this.buildUrl('/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firebase createUser failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result.name;
  }

  async updateUser(userId, updates) {
    const response = await fetchFn(this.buildUrl(`/users/${userId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firebase updateUser failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  async findUserByEmail(email) {
    const query = new URLSearchParams({
      orderBy: '"email"',
      equalTo: JSON.stringify(email),
      auth: this.authSecret,
    });

    const url = `${this.databaseUrl}/users.json?${query.toString()}`;
    const response = await fetchFn(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firebase findUserByEmail failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();

    if (!payload) {
      return null;
    }

    const entries = Object.entries(payload);
    if (!entries.length) {
      return null;
    }

    const [userId, userRecord] = entries[0];
    return { id: userId, ...userRecord };
  }

  async getUserById(userId) {
    const response = await fetchFn(this.buildUrl(`/users/${userId}`));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firebase getUserById failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    if (!payload) {
      return null;
    }

    return { id: userId, ...payload };
  }
}

module.exports = FirebaseClient;
