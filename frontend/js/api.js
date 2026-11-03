const API = {
  BASE_URL: 'http://127.0.0.1:8000',

  async runDebate(question, mode) {
    const session = Auth.getSession();
    const payload = {
      question: question,
      mode: mode,
      user_email: session ? (session.email || session.identifier) : null,
      recipient: session ? session.identifier : null
    };

    let res;
    try {
      res = await fetch(`${this.BASE_URL}/api/debate/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      throw new Error(`Cannot reach backend server at ${this.BASE_URL}. Ensure uvicorn is running.`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (contentType.includes('application/json')) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Debate processing failed.');
      } else {
        const textErr = await res.text();
        throw new Error(`Server returned error (${res.status}): ${textErr.substring(0, 150)}`);
      }
    }

    return await res.json();
  },

  async persistDebate(debateRecord) {
    // Save to local storage history
    const history = JSON.parse(localStorage.getItem('synapse_history') || '[]');
    history.unshift(debateRecord);
    localStorage.setItem('synapse_history', JSON.stringify(history));

    // Optional SQLite sync
    try {
      await fetch(`${this.BASE_URL}/api/debate/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(debateRecord)
      });
    } catch (e) {
      console.warn('Backend SQLite sync skipped; saved in localStorage.');
    }
  }
};