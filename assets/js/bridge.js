// Expose safe functions for HTML onclick handlers
(async () => {
  await window.tracker.init();
})();

window.login = (u) => window.tracker.login(u);
window.logout = () => window.tracker.logout();

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
