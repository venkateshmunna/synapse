const Auth = {
  getSession() {
    const raw = localStorage.getItem('synapse_active_session');
    return raw ? JSON.parse(raw) : null;
  },

  setSession(userData) {
    localStorage.setItem('synapse_active_session', JSON.stringify(userData));
    this.syncNavbar();
  },

  logout() {
    localStorage.removeItem('synapse_active_session');
    this.syncNavbar();
    alert('You have been logged out.');
    showPage('landing');
  },

  getLocalAccounts() {
    return JSON.parse(localStorage.getItem('synapse_local_users') || '[]');
  },

  saveLocalAccount(account) {
    const accounts = this.getLocalAccounts();
    const filtered = accounts.filter(a => a.email !== account.email);
    filtered.push(account);
    localStorage.setItem('synapse_local_users', JSON.stringify(filtered));
  },

  syncNavbar() {
    const session = this.getSession();
    const navBtn = document.getElementById('nav-auth-btn');
    const badge = document.getElementById('user-badge');

    if (session) {
      if (navBtn) {
        navBtn.textContent = 'Sign Out';
        navBtn.onclick = () => Auth.logout();
      }
      if (badge) {
        badge.style.display = 'flex';
        const parts = session.full_name ? session.full_name.trim().split(' ') : ['User'];
        badge.textContent = parts.length > 1 
          ? (parts[0][0] + parts[1][0]).toUpperCase() 
          : parts[0].substring(0, 2).toUpperCase();
      }
    } else {
      if (navBtn) {
        navBtn.textContent = 'Sign In';
        navBtn.onclick = () => showPage('login');
      }
      if (badge) badge.style.display = 'none';
    }
  }
};

let pendingTarget = '';

async function requestOTP() {
  const targetInput = document.getElementById('login-target');
  const target = targetInput ? targetInput.value.trim().toLowerCase() : '';
  if (!targetInput || !targetInput.checkValidity() || !target) {
    alert('Please enter a valid email address.');
    return;
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    const data = await res.json();
    if (res.ok) {
      pendingTarget = target;
      document.getElementById('otp-step-1').style.display = 'none';
      document.getElementById('otp-step-2').style.display = 'block';
      document.getElementById('otp-sent-label').textContent = `Code sent to ${target}`;
    } else {
      alert(`Error: ${data.detail || 'Unable to send verification code.'}`);
    }
  } catch (err) {
    alert('Failed to connect to backend.');
  }
}

async function verifyOTP() {
  const codeInput = document.getElementById('login-otp-code');
  const nameInput = document.getElementById('login-name');
  const code = codeInput ? codeInput.value.trim() : '';
  const name = nameInput ? nameInput.value.trim() || 'User' : 'User';

  if (!code || code.length < 6) {
    alert('Please enter the 6-digit verification code.');
    return;
  }
  if (!pendingTarget) {
    alert('Please request a verification code first.');
    return;
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: pendingTarget, code, full_name: name })
    });
    const data = await res.json();
    if (res.ok) {
      Auth.setSession(data.user);
      alert(`Authenticated successfully as ${data.user.full_name}!`);
      showPage('debate');
    } else {
      alert(`Verification Failed: ${data.detail || 'Unable to verify code.'}`);
    }
  } catch (err) {
    alert('Failed to verify OTP.');
  }
}

async function handleRegister() {
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const passInput = document.getElementById('reg-password');

  const full_name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (!full_name || !email || !password) {
    alert('Please fill in your name, email, and password.');
    return;
  }

  // 1. Try Backend Registration First
  try {
    const res = await fetch('http://127.0.0.1:8000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(`Registration Failed: ${err.detail}`);
      return;
    }
  } catch (e) {
    console.warn('Backend server offline; registering in local browser storage.');
  }

  // 2. Persist to local storage for offline verification
  Auth.saveLocalAccount({ full_name, email, password });
  Auth.setSession({ full_name, email });

  alert(`Account successfully created! Welcome, ${full_name}.`);
  showPage('debate');
}

async function handleLogin() {
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');

  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const password = passInput ? passInput.value.trim() : '';

  if (!email || !password) {
    alert('Please enter both email and password.');
    return;
  }

  let authenticated = false;
  let userName = '';

  // 1. Authenticate with backend database
  try {
    const res = await fetch('http://127.0.0.1:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (res.ok) {
      const data = await res.json();
      authenticated = true;
      userName = data.user.full_name;
    } else {
      const err = await res.json();
      alert(`Authentication Failed: ${err.detail}`);
      return;
    }
  } catch (e) {
    // 2. If backend is offline, check local storage
    console.warn('Backend unavailable, verifying against local storage accounts.');
    const accounts = Auth.getLocalAccounts();
    const matched = accounts.find(a => a.email === email);

    if (!matched) {
      alert('Authentication Failed: No account found with this email.');
      return;
    }
    if (matched.password !== password) {
      alert('Authentication Failed: Incorrect password.');
      return;
    }

    authenticated = true;
    userName = matched.full_name;
  }

  if (authenticated) {
    Auth.setSession({ full_name: userName, email });
    alert(`Welcome back, ${userName}!`);
    showPage('debate');
  }
}