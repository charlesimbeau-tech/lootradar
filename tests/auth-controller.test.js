const test = require('node:test');
const assert = require('node:assert/strict');

const { safeRedirect } = require('../lib/safe-redirect.js');
const {
  CALLBACK_RECOVERY_MESSAGE,
  GOOGLE_RECOVERY_MESSAGE,
  createLoginController,
  bindGoogleIdentityLink,
  resolveNext
} = require('../lib/auth-controller.js');

class FakeControl {
  constructor(value = '') {
    this.value = value;
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
    this.focused = false;
  }

  addEventListener(event, listener) {
    this.listeners.set(event, listener);
  }

  async fire(event, detail = {}) {
    const listener = this.listeners.get(event);
    assert.ok(listener, `missing ${event} listener`);
    return listener({
      preventDefault() {},
      ...detail
    });
  }

  focus() {
    this.focused = true;
  }
}

function locationStub(overrides = {}) {
  const assigned = [];
  return {
    origin: 'https://thelootradar.com',
    search: '',
    hash: '',
    assign(value) {
      assigned.push(value);
    },
    assigned,
    ...overrides
  };
}

function elements() {
  return {
    googleButton: new FakeControl(),
    emailButton: new FakeControl(),
    emailInput: new FakeControl(),
    message: { textContent: '' }
  };
}

test('canonicalizes login next targets so an existing session cannot redirect-loop', async () => {
  for (const candidate of [
    '/login.html',
    '/login.html?next=%2Flogin.html',
    '/login.html#again',
    '/account/../login.html?error=1',
    '%2Flogin.html%3Fnext%3D%252Flogin.html'
  ]) {
    assert.equal(resolveNext(candidate, safeRedirect), '/account.html', candidate);
  }

  const location = locationStub();
  const controls = elements();
  const controller = createLoginController({
    client: {
      auth: {
        async getSession() {
          return { data: { session: { user: { id: 'private' } } }, error: null };
        },
        onAuthStateChange() {}
      }
    },
    location,
    analytics: null,
    next: resolveNext('/login.html?next=/login.html', safeRedirect),
    elements: controls
  });

  await controller.start();
  assert.deepEqual(location.assigned, ['/account.html']);
});

test('callback errors use one fixed recovery message without disabling fallback', async () => {
  for (const location of [
    locationStub({
      search: '?error=access_denied&error_description=private-provider-detail'
    }),
    locationStub({
      hash: '#error_code=oauth_failed&error_description=other-private-detail'
    })
  ]) {
    const controls = elements();
    const controller = createLoginController({
      client: {
        auth: {
          async getSession() {
            return {
              data: { session: null },
              error: null
            };
          },
          onAuthStateChange() {}
        }
      },
      location,
      analytics: null,
      next: '/account.html',
      elements: controls
    });

    await controller.start();
    assert.equal(controls.message.textContent, CALLBACK_RECOVERY_MESSAGE);
    assert.doesNotMatch(controls.message.textContent, /provider|private|oauth_failed/i);
    assert.equal(controls.googleButton.disabled, false);
    assert.equal(controls.emailButton.disabled, false);
    assert.ok(controls.googleButton.listeners.has('click'));
    assert.ok(controls.emailButton.listeners.has('click'));
  }
});

test('session lookup errors use the fixed recovery message and keep both methods ready', async () => {
  const controls = elements();
  const controller = createLoginController({
    client: {
      auth: {
        async getSession() {
          return {
            data: { session: null },
            error: { message: 'provider account detail must stay private' }
          };
        },
        onAuthStateChange() {}
      }
    },
    location: locationStub(),
    analytics: null,
    next: '/account.html',
    elements: controls
  });

  await controller.start();
  assert.equal(controls.message.textContent, CALLBACK_RECOVERY_MESSAGE);
  assert.doesNotMatch(controls.message.textContent, /provider|private/i);
  assert.equal(controls.googleButton.disabled, false);
  assert.equal(controls.emailButton.disabled, false);
  assert.ok(controls.googleButton.listeners.has('click'));
  assert.ok(controls.emailButton.listeners.has('click'));
});

test('Google OAuth failure restores the button and points to the email fallback', async () => {
  const location = locationStub();
  const controls = elements();
  const analyticsCalls = [];
  let oauthRequest = null;
  const controller = createLoginController({
    client: {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        async signInWithOAuth(request) {
          oauthRequest = request;
          return { error: { message: 'hidden provider response' } };
        },
        onAuthStateChange() {}
      }
    },
    location,
    analytics: {
      track(event, properties) {
        analyticsCalls.push({ event, properties });
      }
    },
    next: '/account.html',
    elements: controls
  });

  await controller.start();
  await controls.googleButton.fire('click');

  assert.deepEqual(oauthRequest, {
    provider: 'google',
    options: {
      redirectTo: 'https://thelootradar.com/login.html?next=%2Faccount.html'
    }
  });
  assert.deepEqual(analyticsCalls, [{
    event: 'auth_request',
    properties: { surface: 'login', provider: 'google', signedIn: false }
  }]);
  assert.equal(controls.googleButton.disabled, false);
  assert.equal(controls.emailButton.disabled, false);
  assert.equal(controls.message.textContent, GOOGLE_RECOVERY_MESSAGE);
  assert.doesNotMatch(controls.message.textContent, /hidden provider response/i);
});

test('identity linking is a reusable account-page action with a fixed return path', async () => {
  const button = new FakeControl();
  const location = locationStub();
  const messages = [];
  let linkRequest = null;
  const result = await bindGoogleIdentityLink({
    client: {
      auth: {
        async getUserIdentities() {
          return {
            data: { identities: [{ provider: 'email' }] },
            error: null
          };
        },
        async linkIdentity(request) {
          linkRequest = request;
          return { error: null };
        }
      }
    },
    button,
    location,
    show(message) {
      messages.push(message);
    }
  });

  assert.deepEqual(result, { available: true, linked: false });
  assert.equal(button.hidden, false);
  await button.fire('click');
  assert.deepEqual(linkRequest, {
    provider: 'google',
    options: {
      redirectTo: 'https://thelootradar.com/account.html?linked=google'
    }
  });
  assert.equal(button.disabled, true);
  assert.deepEqual(messages, ['Connecting Google…']);
});

test('identity linking remains hidden when Google is already connected', async () => {
  const button = new FakeControl();
  const result = await bindGoogleIdentityLink({
    client: {
      auth: {
        async getUserIdentities() {
          return {
            data: { identities: [{ provider: 'google' }] },
            error: null
          };
        }
      }
    },
    button,
    location: locationStub(),
    show() {}
  });

  assert.deepEqual(result, { available: false, linked: true });
  assert.equal(button.hidden, true);
  assert.equal(button.listeners.size, 0);
});
