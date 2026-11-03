const RouteGuard = {
  // Routes accessible without login
  publicRoutes: ['landing', 'about', 'pricing', 'login'],

  check(targetPageId) {
    const session = Auth.getSession();
    const isPublic = this.publicRoutes.includes(targetPageId);

    if (!session && !isPublic) {
      alert("🔒 Access Restricted: Please sign in or verify your account first.");
      showPage('login');
      return false;
    }
    return true;
  }
};