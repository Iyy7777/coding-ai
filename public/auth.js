// auth.js
// Login / signup screen behaviour. Talks to Supabase Auth via window.db
// (see supabaseClient.js). On success, calls window.onAuthSuccess(session)
// which app.js defines to take over and show the rest of the app.

(() => {
  'use strict';

  const authScreen = document.getElementById('auth');
  const authHeading = document.getElementById('auth-heading');
  const authTabs = document.querySelectorAll('.auth-tab');

  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');

  const signupForm = document.getElementById('signup-form');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const signupConfirm = document.getElementById('signup-confirm');
  const agreeTerms = document.getElementById('agree-terms');
  const notRobot = document.getElementById('not-robot');
  const signupError = document.getElementById('signup-error');
  const signupNotice = document.getElementById('signup-notice');
  const signupSubmit = document.getElementById('signup-submit');

  const openTermsBtn = document.getElementById('open-terms');
  const termsModal = document.getElementById('terms-modal');
  const closeTermsBtn = document.getElementById('close-terms');
  const modalTabs = document.querySelectorAll('.modal-tab');
  const termsDoc = document.getElementById('terms-doc');
  const privacyDoc = document.getElementById('privacy-doc');

  function showError(el, message) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
  function clearError(el) {
    el.textContent = '';
    el.classList.add('hidden');
  }

  // ---------- Tab switching (Log in / Sign up) ----------
  authTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      authTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      const isLogin = mode === 'login';
      loginForm.classList.toggle('hidden', !isLogin);
      signupForm.classList.toggle('hidden', isLogin);
      authHeading.textContent = isLogin ? 'Welcome back' : 'Create your account';
      clearError(loginError);
      clearError(signupError);
      signupNotice.classList.add('hidden');
    });
  });

  // ---------- Signup submit button gating ----------
  function updateSignupGate() {
    const emailOk = signupEmail.value.trim().length > 3;
    const pwOk = signupPassword.value.length >= 6;
    const matchOk = signupPassword.value === signupConfirm.value && signupConfirm.value.length > 0;
    signupSubmit.disabled = !(emailOk && pwOk && matchOk && agreeTerms.checked && notRobot.checked);
  }
  [signupEmail, signupPassword, signupConfirm].forEach((el) =>
    el.addEventListener('input', updateSignupGate)
  );
  [agreeTerms, notRobot].forEach((el) => el.addEventListener('change', updateSignupGate));

  // ---------- Terms & Privacy modal ----------
  openTermsBtn.addEventListener('click', () => {
    termsModal.classList.remove('hidden');
  });
  closeTermsBtn.addEventListener('click', () => termsModal.classList.add('hidden'));
  termsModal.addEventListener('click', (e) => {
    if (e.target === termsModal) termsModal.classList.add('hidden');
  });
  modalTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      modalTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isTerms = tab.dataset.doc === 'terms';
      termsDoc.classList.toggle('hidden', !isTerms);
      privacyDoc.classList.toggle('hidden', isTerms);
    });
  });

  // ---------- Login ----------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginError);
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Logging in…';

    const { data, error } = await window.db.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value,
    });

    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Log in';

    if (error) {
      showError(loginError, error.message);
      return;
    }
    window.onAuthSuccess(data.session);
  });

  // ---------- Signup ----------
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(signupError);
    signupNotice.classList.add('hidden');

    if (!agreeTerms.checked) {
      showError(signupError, 'You must agree to the Terms & Conditions and Privacy Policy.');
      return;
    }
    if (!notRobot.checked) {
      showError(signupError, 'Please confirm you are not a robot.');
      return;
    }
    if (signupPassword.value !== signupConfirm.value) {
      showError(signupError, 'Passwords do not match.');
      return;
    }

    signupSubmit.disabled = true;
    signupSubmit.textContent = 'Creating account…';

    const { data, error } = await window.db.auth.signUp({
      email: signupEmail.value.trim(),
      password: signupPassword.value,
    });

    signupSubmit.textContent = 'Sign up';
    updateSignupGate();

    if (error) {
      showError(signupError, error.message);
      return;
    }

    if (data.session) {
      // Email confirmation is disabled on this project — log straight in.
      window.onAuthSuccess(data.session);
      return;
    }

    // Email confirmation is required: no session yet.
    signupNotice.textContent =
      'Account created! Check your email for a confirmation link, then log in.';
    signupNotice.classList.remove('hidden');
    signupForm.reset();
    updateSignupGate();
    document.querySelector('.auth-tab[data-mode="login"]').click();
  });

  // ---------- Sign out (called from app.js) ----------
  window.signOut = async () => {
    await window.db.auth.signOut();
    window.location.reload();
  };

  // Expose a way for app.js to reset the auth screen to its default (login) tab
  window.resetAuthScreen = () => {
    document.querySelector('.auth-tab[data-mode="login"]').click();
    loginForm.reset();
    signupForm.reset();
    updateSignupGate();
  };
})();
