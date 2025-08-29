// assets/js/bridge.js

// Initialize app modules in order.
(async () => {
  // 1) Tracker boot (loads data, etc.)
  if (window.tracker && typeof window.tracker.init === "function") {
    await window.tracker.init();
  }
  // 2) Auth boot (loads users + session, applies RBAC, shows main/login)
  if (window.auth && typeof window.auth.init === "function") {
    await window.auth.init();
  }
})();

// ---- Login form handler
window.handleLogin = async (e) => {
  e.preventDefault();
  const u = document.getElementById("loginUsername").value.trim();
  const p = document.getElementById("loginPassword").value;
  const ok = await window.auth.login(u, p);
  if (ok) {
    // Tracker already switches to main via tracker.login
    // Ensure role chips/visibility refresh:
    window.auth.showMain();
  }
};

// Expose existing tracker functions unchanged
window.showTab = (evt, name) => window.tracker.showTab(evt, name);
window.exportDashboardPDF = () => window.tracker.exportDashboardPDF();
window.exportProgressPDF = () => window.tracker.exportProgressPDF();
window.exportReportsPDF = () => window.tracker.exportReportsPDF();
window.printReports = () => window.tracker.printReports();
window.showLocationForm = () => window.tracker.showLocationForm();
window.closeLocationModal = () => window.tracker.closeLocationModal();
window.saveLocation = (e) => window.tracker.saveLocation(e);
window.filterLocations = () => window.tracker.filterLocations();
window.filterProgress = () => window.tracker.filterProgress();
window.filterProgressByDivision = () => window.tracker.filterProgressByDivision();
window.downloadTemplate = () => window.tracker.downloadTemplate();
window.exportCurrentData = () => window.tracker.exportCurrentData();
window.exportToExcel = () => window.tracker.exportToExcel();
window.showImportModal = () => window.tracker.showImportModal();
window.closeImportModal = () => window.tracker.closeImportModal();
window.handleExcelImport = (e) => window.tracker.handleExcelImport(e);
window.confirmImport = () => window.tracker.confirmImport();
window.cancelImport = () => window.tracker.cancelImport();
window.createBackup = () => window.tracker.createBackup();
window.restoreBackup = () => window.tracker.restoreBackup();
window.handleBackupRestore = (e) => window.tracker.handleBackupRestore(e);
window.clearAllData = () => window.tracker.clearAllData();

// ---- Session actions
window.logout = () => window.auth.logout();

// ---- Superadmin: User Management UI handlers
window.exportUsers = () => window.auth.exportUsersJSON();
window.importUsers = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json";
  inp.onchange = () => { if (inp.files?.[0]) window.auth.importUsersJSON(inp.files[0]); };
  inp.click();
};
window.saveUser = () => {
  const username = document.getElementById("um_username").value.trim();
  const role = document.getElementById("um_role").value;
  const password = document.getElementById("um_password").value;
  window.auth.saveUser({ username, role, password });
  document.getElementById("um_password").value = "";
};
window.deleteUser = () => {
  const username = document.getElementById("um_username").value.trim();
  window.auth.deleteUserByName(username);
};
