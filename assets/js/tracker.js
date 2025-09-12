// Advanced POS Deployment Tracker (static, PWA, localStorage "DB")

class AdvancedPOSTracker {
  constructor() {
    this.locations = [];
    this.currentUser = null;
    this.currentLocationId = null;
    this.nextLocationId = 1;
    this.importData = [];

    // FYI: login is now "open" — any non-empty username is accepted & persisted.
    // Keep this list only for future role gating if you need it.
    this.users = ["KARNA", "NKR", "SKR", "BGR", "SBI_DOP", "admin", "admin1"];

    this.storageKey = "advancedPOSTrackerData";
    this.sessionKey = "advancedPOSCurrentUser";

    // --- Office wise details state (scoped) ---
    this.officeFilters = {};                         // per-column (inline) text filters
    this.topFilters = { division:"", install:"", func:"", blanks:"all" }; // toolbar dropdowns
    this.docStorageKey = "advancedPOSTrackerDocs";   // localStorage key for PDF blobs
    this.uploadAllowedUsers = null;                  // null => everyone; or restrict e.g. ["NKR","SBI_DOP"]
    this.progressSelection = new Set();              // selected row ids (on Progress tab)
    this._progressLastIds = [];                      // last rendered ids for "select all in view"
    this._progressBarWired = false;                  // event wiring guard
  }

  async init() {
    this.loadFromStorage();
    if (this.locations.length === 0) {
      try {
        const resp = await fetch("data/sample-data.json", { cache: "no-store" });
        if (resp.ok) {
          const seed = await resp.json();
          if (Array.isArray(seed) && seed.length) {
            this.locations = seed.map((loc, i) => ({ ...loc, id: i + 1, slNo: i + 1 }));
            this.nextLocationId = this.locations.length + 1;
            this.saveToStorage();
          }
        }
      } catch (e) {
        console.warn("Seed load skipped:", e);
      }
    }
    this.checkLoginStatus();
  }

  // ---- session / UI ----
  checkLoginStatus() {
    // FIX: accept ANY saved username (non-empty) so hard refresh doesn't log you out.
    const savedUser = (localStorage.getItem(this.sessionKey) || "").trim();
    if (savedUser) {
      this.currentUser = savedUser;
      this.showMainApp();
    } else {
      this.showLoginScreen();
    }
  }
  login(username) {
    const u = (username || "").trim();
    if (!u) { alert("Enter a username to continue."); return; }
    this.currentUser = u;
    localStorage.setItem(this.sessionKey, u);
    this.showMainApp();
  }
  logout() {
    this.currentUser = null;
    localStorage.removeItem(this.sessionKey);
    this.showLoginScreen();
  }
  showLoginScreen() {
    document.getElementById("loginScreen")?.classList.remove("hidden");
    document.getElementById("mainApp")?.classList.add("hidden");
  }
  showMainApp() {
    // Unhide main app + any nav/tabs containers
    document.getElementById("loginScreen")?.classList.add("hidden");
    const app = document.getElementById("mainApp");
    if (app) app.classList.remove("hidden");

    // Be defensive: if your header/nav has its own id/class, unhide it too.
    document.querySelectorAll("#mainApp .tabs, #mainApp .nav, #mainApp .top-nav, .nav-tabs, .tabbar")
      .forEach(el => el.classList.remove("hidden"));

    const cu = document.getElementById("currentUser");
    if (cu) cu.textContent = this.currentUser || "User";

    // Make sure at least one nav tab is active visually
    const firstTabBtn = document.querySelector(".nav-tab");
    if (firstTabBtn && !document.querySelector(".nav-tab.active")) {
      firstTabBtn.classList.add("active");
    }

    this.setupEventListeners();
    this.showTab(null, "dashboard");
    this.updateDashboard();
  }
  setupEventListeners() {
    window.addEventListener("click", (evt) => {
      document.querySelectorAll(".modal").forEach(m => { if (evt.target === m) m.style.display = "none"; });
    });
  }

  // ---- tabs ----
  showTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    const pane = document.getElementById(tabName);
    if (pane) pane.classList.add("active");
    if (evt && evt.target) evt.target.classList.add("active");
    else {
      document.querySelectorAll(".nav-tab").forEach(btn => {
        if (btn.getAttribute("onclick")?.includes(`'${tabName}'`)) btn.classList.add("active");
      });
    }
    switch (tabName) {
      case "dashboard": this.updateDashboard(); break;
      case "locations": this.renderOfficeDetails(); break;
      case "progress":
        this.displayProgress();
        this.updateProgressFilters();
        this._ensureProgressBulkUI();
        this.filterProgress();
        break;
      case "reports":
        this.generateReports();
        this._wireExportReportsPdfForm();
        break;
      case "data-management":
        this.updateDataStatistics && this.updateDataStatistics();
        break;
    }
  }

  // ---- storage ----
  saveToStorage() {
    const data = { locations: this.locations, nextLocationId: this.nextLocationId, lastSaved: new Date().toISOString() };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }
  loadFromStorage() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.locations = data.locations || [];
      this.nextLocationId = data.nextLocationId || 1;
    } catch { /* ignore */ }
  }

  // ---- dashboard ----
  updateDashboard() { this.updateOverallStats(); this.updateDivisionStats(); this.updateRecentActivity(); }
  updateOverallStats() {
    const totalLocations = this.locations.length;
    const totalDevicesDeployed = this.locations.reduce((sum, l) => sum + (parseInt(l.noOfDevicesReceived) || 0), 0);
    const pending = this.locations.filter(l => l.installationStatus === "Pending").length;
    const withIssues = this.locations.filter(l => l.issuesIfAny && l.issuesIfAny.trim() && l.issuesIfAny !== "None").length;
    const box = document.getElementById("overallStats");
    if (!box) return;
    box.innerHTML = `
      <div class="stat-card"><div class="stat-number">${totalLocations}</div><div class="stat-label">Total Offices</div></div>
      <div class="stat-card"><div class="stat-number">${totalDevicesDeployed}</div><div class="stat-label">Deployed Devices</div></div>
      <div class="stat-card"><div class="stat-number">${pending}</div><div class="stat-label">Installations Pending</div></div>
      <div class="stat-card"><div class="stat-number">${withIssues}</div><div class="stat-label">Issues Reported</div></div>
    `;
  }
  updateDivisionStats() {
    const agg = {};
    this.locations.forEach(l => {
      agg[l.division] ||= { total:0, deployed:0, pending:0, issues:0 };
      agg[l.division].total++;
      if (l.installationStatus === "Completed") agg[l.division].deployed++; else agg[l.division].pending++;
      if (l.issuesIfAny && l.issuesIfAny.trim() && l.issuesIfAny !== "None") agg[l.division].issues++;
    });
    let html = "";
    for (const [name, s] of Object.entries(agg)) {
      html += `
        <div class="division-card">
          <div class="division-header">
            <div class="division-name">${name}</div>
            <button class="btn btn-sm btn-info" onclick="tracker.filterByDivision('${name.replace(/'/g,"\\'")}')">View Details</button>
          </div>
          <div class="division-stats-grid">
            <div class="division-stat"><div class="division-stat-number">${s.total}</div><div class="division-stat-label">Total Locations</div></div>
            <div class="division-stat"><div class="division-stat-number">${s.deployed}</div><div class="division-stat-label">Deployed</div></div>
            <div class="division-stat"><div class="division-stat-number">${s.pending}</div><div class="division-stat-label">Pending</div></div>
            <div class="division-stat"><div class="division-stat-number">${s.issues}</div><div class="division-stat-label">Issues</div></div>
          </div>
        </div>`;
    }
    const box = document.getElementById("divisionStats");
    if (box) box.innerHTML = html;
  }
  getStatusClass(status) { return status==="Completed"?"status-completed":(status==="In Progress"||status==="Device Received")?"status-in-progress":"status-pending"; }
  calculateProgress(l) { if (!l.numberOfPosToBeDeployed) return 0; return Math.round(((l.noOfDevicesReceived||0)/l.numberOfPosToBeDeployed)*100); }
  updateRecentActivity() {
    const rec = this.locations.slice(-5).reverse();
    const wrap = document.getElementById("recentActivity");
    if (!wrap) return;
    if (!rec.length) {
      wrap.innerHTML = `
        <div class="alert alert-info"><h4>🚀 Welcome to Advanced POS Tracker!</h4>
        <p>Start by importing Excel data or adding locations.</p>
        <div style="margin-top:15px;">
          <button class="btn btn-primary" onclick="tracker.showTab(null,'data-management')">📊 Manage Data</button>
          <button class="btn btn-success" onclick="tracker.showLocationForm()">➕ Add Location</button>
        </div></div>`;
      return;
    }
    let html = "";
    rec.forEach(l => {
      const status = this.getStatusClass(l.installationStatus);
      const pct = this.calculateProgress(l);
      html += `
      <div class="location-card">
        <div class="location-header"><div class="location-title">${l.postOfficeName}</div>
          <span class="status-badge ${status}">${l.installationStatus}</span></div>
        <div class="location-details">
          <div class="detail-item"><div class="detail-label">Division</div><div class="detail-value">${l.division}</div></div>
          <div class="detail-item"><div class="detail-label">City</div><div class="detail-value">${l.city}</div></div>
          <div class="detail-item"><div class="detail-label">Progress</div><div class="detail-value">${pct}%</div></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    });
    wrap.innerHTML = html;
  }

  // ---- lists / progress ----
  filterByDivision(name){ this.showTab(null,"progress"); const sel=document.getElementById("progressDivisionFilter"); if (sel){ sel.value=name; this.filterProgressByDivision(); } }
  displayLocations(){ this.renderLocationsList(this.locations, "locationsList"); }

  renderLocationsList(list, targetId="locationsList"){
    const target = document.getElementById(targetId);
    if (!target) return;

    if (!target._bulkBound){
      target._bulkBound = true;
      target.addEventListener("change", (e)=>{
        const cb = e.target.closest('input[type="checkbox"][data-sel-id]');
        if (!cb) return;
        const id = parseInt(cb.getAttribute("data-sel-id"), 10);
        if (Number.isFinite(id)){
          if (cb.checked) this.progressSelection.add(id);
          else this.progressSelection.delete(id);
          this._updateProgressSelectionBar();
        }
      });
    }

    if (!list.length) {
      target.innerHTML = `<div class="alert alert-info"><h4>No Post Office found</h4><p>Add Post Offices to get started.</p>
        <button class="btn btn-primary" onclick="tracker.showLocationForm()">Add Post Office(s)</button></div>`;
      return;
    }

    const isProgress = (targetId === "progressList");
    let html = "";
    list.forEach(l=>{
      const statusClass = this.getStatusClass(l.installationStatus);
      const pct = this.calculateProgress(l);
      const selBox = isProgress
        ? `<label style="display:flex;align-items:center;gap:6px;">
             <input type="checkbox" data-sel-id="${l.id}" ${this.progressSelection.has(l.id) ? "checked":""}>
             <span style="font-size:12px;opacity:.75;">Select</span>
           </label>`
        : "";
      const actions = `
        <button class="btn btn-sm btn-primary" onclick="tracker.editLocation(${l.id})" type="button">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="tracker.deleteLocation(${l.id})" type="button">🗑️ Delete</button>
      `;

      html += `
      <div class="location-card">
        <div class="location-header">
          <div class="location-title">${l.postOfficeName} ${l.postOfficeId ? `(${l.postOfficeId})` : ""}</div>
          <div class="flex" style="gap:10px;align-items:center;">
            ${selBox}
            <span class="status-badge ${statusClass}">${l.installationStatus}</span>
            ${actions}
          </div>
        </div>
        <div class="location-details">
          <div class="detail-item"><div class="detail-label">Division</div><div class="detail-value">${l.division}</div></div>
          <div class="detail-item"><div class="detail-label">Contact</div><div class="detail-value">${l.contactPersonName}</div></div>
          <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${l.contactPersonNo}</div></div>
          <div class="detail-item"><div class="detail-label">City, State</div><div class="detail-value">${l.city||""}${l.state?`, ${l.state}`:""}</div></div>
          <div class="detail-item"><div class="detail-label">POS Required</div><div class="detail-value">${l.numberOfPosToBeDeployed}</div></div>
          <div class="detail-item"><div class="detail-label">Devices Received</div><div class="detail-value">${l.noOfDevicesReceived || 0}</div></div>
        </div>
        <div style="margin-top:20px;">
          <div class="flex-between mb-10"><span style="font-weight:600;">Deployment Progress</span>
            <span style="font-weight:700;color:var(--accent-color);">${pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    });
    target.innerHTML = html;
  }

  updateFilters(){
    const divisions=[...new Set(this.locations.map(l=>l.division))];
    const sel=document.getElementById("divisionFilter");
    if (sel){ sel.innerHTML=`<option value="">All Divisions</option>`; divisions.forEach(d=> sel.innerHTML+=`<option value="${d}">${d}</option>`); }
  }
  filterLocations(){
    const term=(document.getElementById("searchInput").value||"").toLowerCase();
    const div=document.getElementById("divisionFilter").value;
    const status=document.getElementById("statusFilter").value;
    const filtered=this.locations.filter(l=>{
      const matchesSearch = [l.postOfficeName,l.division,l.city].some(v=> (v||"").toLowerCase().includes(term));
      const matchesDivision = !div || l.division===div;
      const matchesStatus = !status || l.installationStatus===status;
      return matchesSearch && matchesDivision && matchesStatus;
    });
    this.renderLocationsList(filtered,"locationsList");
  }
  displayProgress(){ this.renderLocationsList(this.locations,"progressList"); }
  updateProgressFilters(){
    const divisions=[...new Set(this.locations.map(l=>l.division))];
    const sel=document.getElementById("progressDivisionFilter");
    if (sel){ sel.innerHTML=`<option value="">All Divisions</option>`; divisions.forEach(d=> sel.innerHTML+=`<option value="${d}">${d}</option>`); }
  }

  // ===== Progress bulk actions =====
  _ensureProgressBulkUI(){
    const host = document.querySelector('#progress');
    if (!host) return;

    let bar = document.getElementById('progress-bulk-bar');
    if (!bar){
      bar = document.createElement('div');
      bar.id = 'progress-bulk-bar';
      bar.style.display = 'flex';
      bar.style.flexWrap = 'wrap';
      bar.style.gap = '8px';
      bar.style.alignItems = 'center';
      bar.style.margin = '10px 0 14px';
      bar.innerHTML = `
        <span id="progress-selected-pill" class="badge" style="background:#eef3ff;color:#234; padding:6px 10px;border-radius:999px;font-size:12px;">
          Selected: <strong id="progress-selected-count">0</strong>
        </span>
        <button id="progress-select-all"   class="btn btn-sm btn-secondary">Select all in view</button>
        <button id="progress-clear-sel"    class="btn btn-sm btn-light">Clear selection</button>
        <button id="progress-bulk-update"  class="btn btn-sm btn-primary">Bulk update</button>
      `;
      const filtersRow = host.querySelector('.filters') || host;
      if (filtersRow?.parentElement) {
        filtersRow.parentElement.insertBefore(bar, filtersRow.nextSibling);
      } else {
        host.prepend(bar);
      }
    }

    if (!this._progressBarWired){
      this._progressBarWired = true;
      document.getElementById('progress-select-all')?.addEventListener('click', ()=> this._toggleProgressSelectAllCurrent(true));
      document.getElementById('progress-clear-sel')?.addEventListener('click', ()=> this._toggleProgressSelectAllCurrent(false));
      document.getElementById('progress-bulk-update')?.addEventListener('click', ()=> this._openBulkUpdateModal());
    }

    this._updateProgressSelectionBar();
  }

  _updateProgressSelectionBar(){
    const n = this.progressSelection.size;
    const pill = document.getElementById('progress-selected-count');
    if (pill) pill.textContent = String(n);
  }
  _toggleProgressSelectAllCurrent(select=true){
    (this._progressLastIds || []).forEach(id => {
      if (select) this.progressSelection.add(id); else this.progressSelection.delete(id);
    });
    this.filterProgress();
  }
  _clearProgressSelection(){
    this.progressSelection.clear();
    this.filterProgress();
  }

  _openBulkUpdateModal(){
    if (this.progressSelection.size === 0){
      alert('Select at least one Post Office in the list to bulk update.');
      return;
    }
    const id = 'bulk-update-overlay';
    if (document.getElementById(id)) return;

    const today = new Date().toISOString().slice(0,10);
    const modal = document.createElement('div');
    modal.id = id;
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2500;display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:18px 20px;width:520px;max-width:90vw;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          <h3 style="margin:0 0 6px;font-size:16px;color:#2c3e50;">Bulk update (${this.progressSelection.size} selected)</h3>
          <p style="margin:0 0 12px;font-size:12.5px;opacity:.8;">Leave a field blank to keep its current value.</p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
              <span>Installation status</span>
              <select id="bulk-install" class="filter-select" style="padding:7px 8px;">
                <option value="">(keep)</option>
                <option>Pending</option>
                <option>Device Received</option>
                <option>In Progress</option>
                <option>Completed</option>
              </select>
            </label>

            <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
              <span>Functionality status</span>
              <select id="bulk-func" class="filter-select" style="padding:7px 8px;">
                <option value="">(keep)</option>
                <option>Not Tested</option>
                <option>Working</option>
                <option>Not Working</option>
              </select>
            </label>

            <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
              <span>Date of receipt of device</span>
              <div style="display:flex;gap:8px;align-items:center;">
                <input id="bulk-date" type="date" style="flex:1;padding:7px 8px;border:1px solid #dfe4ea;border-radius:6px;">
                <button id="bulk-set-today" class="btn btn-sm btn-light" type="button">Today</button>
              </div>
            </label>

            <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
              <span>No. of devices received</span>
              <input id="bulk-devices" type="number" min="0" step="1" placeholder="(keep)" style="padding:7px 8px;border:1px solid #dfe4ea;border-radius:6px;">
            </label>

            <label style="grid-column:1 / -1; display:flex;flex-direction:column;gap:6px;font-size:13px;">
              <span>Issues (if any)</span>
              <input id="bulk-issues" type="text" placeholder="(keep)" style="padding:7px 8px;border:1px solid #dfe4ea;border-radius:6px;">
              <div style="display:flex;gap:10px;align-items:center;margin-top:4px;">
                <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;">
                  <input id="bulk-clear-issues" type="checkbox"> <span>Set to “None”</span>
                </label>
              </div>
            </label>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
            <button id="bulk-cancel" class="btn btn-sm btn-secondary">Cancel</button>
            <button id="bulk-apply"  class="btn btn-sm btn-primary">Apply</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#bulk-set-today')?.addEventListener('click', ()=>{
      const el = modal.querySelector('#bulk-date'); if (el) el.value = today;
    });
    modal.querySelector('#bulk-cancel')?.addEventListener('click', ()=> modal.remove());
    modal.querySelector('#bulk-apply')?.addEventListener('click', ()=>{
      const payload = {
        installationStatus: modal.querySelector('#bulk-install')?.value || "",
        functionalityStatus: modal.querySelector('#bulk-func')?.value || "",
        dateOfReceiptOfDevice: modal.querySelector('#bulk-date')?.value || "",
        noOfDevicesReceived: modal.querySelector('#bulk-devices')?.value || "",
        issuesIfAny: modal.querySelector('#bulk-clear-issues')?.checked ? "None" : (modal.querySelector('#bulk-issues')?.value || "")
      };
      modal.remove();
      this._applyBulkUpdate(payload);
    });
  }

  _applyBulkUpdate(payload){
    const has = (v)=> v !== null && v !== undefined && String(v).trim() !== "";
    let changed = 0;

    const toInt = (v)=> {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };

    const updates = {
      installationStatus: has(payload.installationStatus) ? String(payload.installationStatus) : null,
      functionalityStatus: has(payload.functionalityStatus) ? String(payload.functionalityStatus) : null,
      dateOfReceiptOfDevice: has(payload.dateOfReceiptOfDevice) ? String(payload.dateOfReceiptOfDevice) : null,
      noOfDevicesReceived: has(payload.noOfDevicesReceived) ? toInt(payload.noOfDevicesReceived) : null,
      issuesIfAny: (payload.issuesIfAny === "None") ? "None" : (has(payload.issuesIfAny) ? String(payload.issuesIfAny) : null)
    };

    const selected = new Set(this.progressSelection);
    if (!selected.size) { alert("Selection cleared. Nothing to update."); return; }

    this.locations = this.locations.map(l=>{
      if (!selected.has(l.id)) return l;
      const next = { ...l };
      if (updates.installationStatus !== null) next.installationStatus = updates.installationStatus;
      if (updates.functionalityStatus !== null) next.functionalityStatus = updates.functionalityStatus;
      if (updates.dateOfReceiptOfDevice !== null) next.dateOfReceiptOfDevice = updates.dateOfReceiptOfDevice;
      if (updates.noOfDevicesReceived !== null) next.noOfDevicesReceived = updates.noOfDevicesReceived;
      if (updates.issuesIfAny !== null) next.issuesIfAny = updates.issuesIfAny;
      changed++;
      return next;
    });

    this.saveToStorage();
    this.updateDashboard();
    this.filterProgress();
    alert(`Updated ${changed} record(s) successfully.`);
  }

  filterProgressByDivision(){
    const d=document.getElementById("progressDivisionFilter").value;
    const list = d ? this.locations.filter(l=>l.division===d) : this.locations;
    this.renderLocationsList(list,"progressList");
  }
  filterProgress(){
    const term=(document.getElementById("progressSearchInput").value||"").toLowerCase();
    const status=document.getElementById("progressStatusFilter").value;
    const div=document.getElementById("progressDivisionFilter").value;
    const filtered=this.locations.filter(l=>{
      const matchesSearch = [l.postOfficeName,l.division].some(v=> (v||"").toLowerCase().includes(term));
      const matchesStatus = !status || l.installationStatus===status;
      const matchesDivision = !div || l.division===div;
      return matchesSearch && matchesStatus && matchesDivision;
    });

    this._progressLastIds = filtered.map(l => l.id);
    this.renderLocationsList(filtered,"progressList");
    this._updateProgressSelectionBar();
  }

  // ---- reports (kept from previous build) ----
  generateReports(){
    const host = document.getElementById("reportsContent");
    if (!host) return;
    const rows = this.locations || [];
    if (!rows.length){
      host.innerHTML = `<div class="alert alert-info">No data available.</div>`;
      return;
    }
    const totalOffices = rows.length;
    const totalDevicesRequired = rows.reduce((s,l)=> s + (parseInt(l.numberOfPosToBeDeployed)||0), 0);
    const totalDevicesReceived = rows.reduce((s,l)=> s + (parseInt(l.noOfDevicesReceived)||0), 0);
    const devicesInstalledRegion = rows.filter(r => (r.installationStatus||"").trim() === "Completed").length;
    const overallCompletionPct = totalDevicesRequired ? Math.round((devicesInstalledRegion / totalDevicesRequired) * 100) : 0;

    const summaryHTML = `
      <div class="section-header"><h3 class="section-title">Region Summary</h3></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-number">${totalOffices}</div><div class="stat-label">Total Offices</div></div>
        <div class="stat-card"><div class="stat-number">${totalDevicesRequired}</div><div class="stat-label">Total Devices required</div></div>
        <div class="stat-card"><div class="stat-number">${totalDevicesReceived}</div><div class="stat-label">Total Devices received</div></div>
        <div class="stat-card"><div class="stat-number">${overallCompletionPct}%</div><div class="stat-label">Overall completion %</div></div>
      </div>
    `;

    const byDiv = {};
    rows.forEach(r => { const d = r.division || "—"; (byDiv[d] ||= []).push(r); });

    const hasIssue = (v)=>{
      const s = (v ?? "").toString().trim();
      return s && s.toLowerCase() !== "none";
    };

    const entries = Object.entries(byDiv).sort(([a],[b])=>{
      if (a === "RMS HB Division" && b !== "RMS HB Division") return 1;
      if (b === "RMS HB Division" && a !== "RMS HB Division") return -1;
      return a.localeCompare(b);
    });

    const tdC = ' style="text-align:center"';
    const thL = ' style="text-align:left"';
    const thC = ' style="text-align:center"';
    const tableRows = entries.map(([division, arr]) => {
      const offices = arr.length;
      const devicesRequired = arr.reduce((s,l)=> s + (parseInt(l.numberOfPosToBeDeployed)||0), 0);
      const devicesReceived = arr.reduce((s,l)=> s + (parseInt(l.noOfDevicesReceived)||0), 0);
      const pending = Math.max(0, devicesRequired - devicesReceived);
      const devicesInstalled = arr.filter(x => (x.installationStatus||"").trim() === "Completed").length;
      const pendingInstall = Math.max(0, devicesReceived - devicesInstalled);
      const issues = arr.filter(x => hasIssue(x.issuesIfAny)).length;
      const completed = devicesInstalled;
      const completionPct = devicesRequired ? Math.round((devicesInstalled / devicesRequired) * 100) : 0;
      return `
        <tr>
          <td>${division}</td>
          <td${tdC}>${offices}</td>
          <td${tdC}>${devicesRequired}</td>
          <td${tdC}>${devicesReceived}</td>
          <td${tdC}>${pending}</td>
          <td${tdC}>${devicesInstalled}</td>
          <td${tdC}>${pendingInstall}</td>
          <td${tdC}>${issues}</td>
          <td${tdC}>${completed}</td>
          <td${tdC}>${completionPct}%</td>
        </tr>
      `;
    }).join("");

    const totalPending = Math.max(0, totalDevicesRequired - totalDevicesReceived);
    const totalPendingInstall = Math.max(0, totalDevicesReceived - devicesInstalledRegion);
    const totalIssues = rows.filter(x => hasIssue(x.issuesIfAny)).length;
    const totalCompleted = devicesInstalledRegion;
    const totalCompletionPct = totalDevicesRequired ? Math.round((devicesInstalledRegion / totalDevicesRequired) * 100) : 0;

    const totalRow = `
      <tr class="total-row">
        <td><strong>Total</strong></td>
        <td${tdC}><strong>${totalOffices}</strong></td>
        <td${tdC}><strong>${totalDevicesRequired}</strong></td>
        <td${tdC}><strong>${totalDevicesReceived}</strong></td>
        <td${tdC}><strong>${totalPending}</strong></td>
        <td${tdC}><strong>${devicesInstalledRegion}</strong></td>
        <td${tdC}><strong>${totalPendingInstall}</strong></td>
        <td${tdC}><strong>${totalIssues}</strong></td>
        <td${tdC}><strong>${totalCompleted}</strong></td>
        <td${tdC}><strong>${totalCompletionPct}%</strong></td>
      </tr>
    `;

    const divisionsHTML = `
      <div class="section-header" style="margin-top:20px;">
        <h3 class="section-title">Division-wise Detailed Report</h3>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th${thL}>Division</th>
            <th${thC}>Offices</th>
            <th${thC}>Devices Required</th>
            <th${thC}>Devices Received</th>
            <th${thC}>Pending</th>
            <th${thC}>Devices installed</th>
            <th${thC}>Installations Pending</th>
            <th${thC}>Issues</th>
            <th${thC}>Completed</th>
            <th${thC}>Completion %</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || `<tr><td colspan="10" style="text-align:center;padding:12px;">No data</td></tr>`}
          ${totalRow}
        </tbody>
      </table>
    `;

    const issuesList = rows.filter(r => hasIssue(r.issuesIfAny));
    let issuesHTML = "";
    if (issuesList.length){
      const items = issuesList
        .sort((a,b)=> (a.division||"").localeCompare(b.division||"") || (a.postOfficeName||"").localeCompare(b.postOfficeName||""))
        .map(l => `
          <tr>
            <td>${l.postOfficeName || ""}</td>
            <td>${l.division || ""}</td>
            <td style="text-align:center">${l.installationStatus || ""}</td>
            <td>${(l.issuesIfAny||"").toString().trim()}</td>
            <td style="text-align:center">${l.contactPersonNo || ""}</td>
          </tr>
        `).join("");

      issuesHTML = `
        <div class="card mb-30" style="margin-top:20px;">
          <h3 style="margin-bottom:20px;color:var(--danger-color);">⚠️ Locations with Issues (${issuesList.length})</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Post Office</th>
                  <th>Division</th>
                  <th>Status</th>
                  <th>Issues</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>${items}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    host.innerHTML = summaryHTML + divisionsHTML + issuesHTML;
  }

  // ---- Office wise details (table) ----
  renderOfficeDetails(){
    this._ensureOWDStyles();

    const hostHead = document.getElementById("owd-thead");
    const hostBody = document.getElementById("owd-tbody");
    const meta     = document.getElementById("owd-meta");
    const global   = document.getElementById("owd-global-search");
    const table    = document.getElementById("owd-table");
    if (!hostHead || !hostBody || !table) return;

    this._ensureTopFiltersUI();

    const cols = this._owdColumns();
    const centerKeys = new Set([
      "slNo","postOfficeId","contactPersonNo","altContactNo","state","pincode",
      "numberOfPosToBeDeployed","dateOfReceiptOfDevice","noOfDevicesReceived",
      "serialNo","mid","tid","installationStatus","functionalityStatus"
    ]);

    const headRow = `<tr class="header">${
      cols.map(c => {
        const filter = (c.type === 'docs')
          ? ''
          : `<div class="owd-filter-wrap"><input class="owd-filter" data-col="${c.key}" aria-label="Filter ${c.label}"></div>`;
        return `<th style="text-align:center"><div>${c.label}</div>${filter}</th>`;
      }).join("")
    }</tr>`;
    hostHead.innerHTML = headRow;

    this._bindOfficeFilters(cols);

    let { rows } = this._applyOfficeFilters(cols);
    if (!rows.length && (this.locations || []).length) rows = this.locations;

    hostBody.innerHTML = rows.map(loc => {
      return `<tr>${cols.map(c=>{
        if (c.type === 'docs') return `<td style="text-align:center">${this._docCellHTML(loc)}</td>`;
        let val = (loc[c.key] ?? "");
        if (c.key === 'dateOfReceiptOfDevice' && val) {
          const d = new Date(val); if (!isNaN(d)) {
            const dd = String(d.getDate()).padStart(2,'0');
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const yy = d.getFullYear();
            val = `${dd}/${mm}/${yy}`;
          }
        }
        const isBlank = (val === "" || val === null || typeof val === "undefined" || String(val).trim()==="");
        const emptyClass = isBlank ? " cell-empty" : "";
        const dupClass = (c.key === "serialNo" && !isBlank &&
                          this._collectSerialDuplicates().has(String(val).trim().toLowerCase())) ? " cell-dup" : "";
        const align = centerKeys.has(c.key) ? ' style="text-align:center"' : ' style="text-align:left"';
        return `<td class="${emptyClass}${dupClass}"${align}>${this._escape(val)}</td>`;
      }).join("")}</tr>`;
    }).join("");

    const stats = this._blankStats(this.locations, cols);
    const total = (this.locations || []).length;
    if (meta) {
      const dupeCount = this._collectSerialDuplicates().size;
      meta.innerHTML = `
        <div><strong>Rows:</strong> ${rows.length} of ${total} &nbsp;•&nbsp; <strong>Duplicate Serial Nos:</strong> ${dupeCount}</div>
        <div><strong>Blank fields:</strong> ${stats.blankCells} in ${stats.rowsWithBlank} rows</div>
      `;
    }

    if (global && !global._owdBound){
      global._owdBound = true;
      global.addEventListener("input", () => this.renderOfficeDetails());
    }

    const wrap = table.closest(".table-scroll") || table.parentElement;
    if (wrap && !wrap._owdBound){
      wrap._owdBound = true;
      wrap.addEventListener("change", (e)=>{
        const inp = e.target;
        if (inp?.matches('input[type="file"][data-doc-for]')){
          const id = parseInt(inp.getAttribute("data-doc-for"),10);
          const file = inp.files?.[0];
          if (file) this._handleDocUpload(id, file);
        }
      });
    }

    this._setupHorizontalSync(table);
  }

  _owdColumns(){
    return [
      { key:'slNo',                      label:'Sl.No.' },
      { key:'division',                  label:'Division' },
      { key:'postOfficeName',            label:'POST OFFICE NAME' },
      { key:'postOfficeId',              label:'Post Office ID' },
      { key:'officeType',                label:'Office Type' },
      { key:'contactPersonName',         label:'NAME OF CONTACT PERSON AT THE LOCATION' },
      { key:'contactPersonNo',           label:'CONTACT PERSON NO.' },
      { key:'altContactNo',              label:'ALT CONTACT PERSON NO.' },
      { key:'contactEmail',              label:'CONTACT EMAIL ID' },
      { key:'locationAddress',           label:'LOCATION ADDRESS' },
      { key:'location',                  label:'LOCATION' },
      { key:'city',                      label:'CITY' },
      { key:'state',                     label:'STATE' },
      { key:'pincode',                   label:'PINCODE' },
      { key:'numberOfPosToBeDeployed',   label:'NUMBER OF POS TO BE DEPLOYED' },
      { key:'typeOfPosTerminal',         label:'TYPE OF POS TERMINAL' },
      { key:'dateOfReceiptOfDevice',     label:'Date of receipt of device' },
      { key:'noOfDevicesReceived',       label:'No of devices received' },
      { key:'serialNo',                  label:'Serial No' },
      { key:'mid',                       label:'MID' },
      { key:'tid',                       label:'TID' },
      { key:'installationStatus',        label:'Installation status' },
      { key:'functionalityStatus',       label:'Functionality / Working status of POS machines' },
      { key:'issuesIfAny',               label:'Issues if any' },
      { key:'docs',                      label:'Documents', type:'docs' }
    ];
  }

  _bindOfficeFilters(){
    this.officeFilters = {};
    document.querySelectorAll('#owd-thead .owd-filter').forEach(inp=>{
      const k = inp.getAttribute('data-col');
      this.officeFilters[k] = inp.value || "";
      if (!inp._owdOnce){
        inp._owdOnce = true;
        inp.addEventListener("input", () => this.renderOfficeDetails());
      }
    });
  }

  _applyOfficeFilters(cols){
    const global = (document.getElementById("owd-global-search")?.value || "").trim().toLowerCase();
    const perCol = this.officeFilters || {};
    const keysForBlanks = cols.filter(c=>c.type!=='docs').map(c=>c.key);

    const rows = (this.locations || []).filter(loc=>{
      if (global){
        const hay = keysForBlanks.map(k => (loc[k] ?? "")).join(" | ").toLowerCase();
        if (!hay.includes(global)) return false;
      }
      for (const [k, v] of Object.entries(perCol)){
        if (!v) continue;
        const cell = (loc[k] ?? "").toString().toLowerCase();
        if (!cell.includes(v.toLowerCase())) return false;
      }

      if (this.topFilters.division && (loc.division||"") !== this.topFilters.division) return false;
      if (this.topFilters.install && (loc.installationStatus||"") !== this.topFilters.install) return false;
      if (this.topFilters.func && (loc.functionalityStatus||"") !== this.topFilters.func) return false;

      if (this.topFilters.blanks !== "all"){
        const hasBlank = keysForBlanks.some(k => {
          const v = loc[k];
          return v===null || v===undefined || String(v).trim()==="";
        });
        if (this.topFilters.blanks === "has" && !hasBlank) return false;
        if (this.topFilters.blanks === "none" && hasBlank) return false;
      }

      return true;
    });

    return { rows, dupSerials: this._collectSerialDuplicates() };
  }

  _collectSerialDuplicates(){
    const count = new Map();
    (this.locations || []).forEach(l=>{
      const s = String(l.serialNo ?? "").trim().toLowerCase();
      if (!s) return;
      count.set(s, (count.get(s) || 0) + 1);
    });
    const dups = new Set(); count.forEach((n,k)=>{ if (n>1) dups.add(k); });
    return dups;
  }

  _blankStats(rows, cols){
    const keys = cols.filter(c=>c.type!=='docs').map(c=>c.key);
    let rowsWithBlank = 0, blankCells = 0;
    (rows||[]).forEach(r=>{
      let anyBlank = false;
      keys.forEach(k=>{
        const v = r[k];
        if (v===null || v===undefined || String(v).trim()===""){ blankCells++; anyBlank = true; }
      });
      if (anyBlank) rowsWithBlank++;
    });
    return { rowsWithBlank, blankCells };
  }

  _ensureTopFiltersUI(){
    const search = document.getElementById("owd-global-search");
    if (!search) return;

    let box = document.getElementById("owd-top-filters");
    if (!box){
      box = document.createElement("div");
      box.id = "owd-top-filters";
      box.style.display = "flex";
      box.style.flexWrap = "wrap";
      box.style.gap = "8px";
      const parent = search.parentElement || search.closest(".filters") || document.querySelector("#locations .filters") || document.body;
      parent.appendChild(box);
    }

    const makeSelect = (id, label) => {
      let sel = document.getElementById(id);
      if (!sel){
        sel = document.createElement("select");
        sel.id = id;
        sel.className = "filter-select";
        sel.style.minWidth = "170px";
        sel.setAttribute("aria-label", label);
        sel.addEventListener("change", ()=>{
          if (id==="owd-dd-division") this.topFilters.division = sel.value;
          if (id==="owd-dd-install")  this.topFilters.install  = sel.value;
          if (id==="owd-dd-func")     this.topFilters.func     = sel.value;
          if (id==="owd-dd-blanks")   this.topFilters.blanks   = sel.value;
          this.renderOfficeDetails();
        });
        box.appendChild(sel);
      }
      return sel;
    };

    const divisions = Array.from(new Set((this.locations||[]).map(l=>l.division).filter(Boolean))).sort();
    const sDiv = makeSelect("owd-dd-division","Division");
    sDiv.innerHTML = `<option value="">All Divisions</option>${divisions.map(d=>`<option value="${this._escape(d)}">${this._escape(d)}</option>`).join("")}`;
    sDiv.value = this.topFilters.division;

    const insts = Array.from(new Set((this.locations||[]).map(l=>l.installationStatus).filter(Boolean))).sort();
    const sIns = makeSelect("owd-dd-install","Installation status");
    sIns.innerHTML = `<option value="">All Installation status</option>${insts.map(s=>`<option value="${this._escape(s)}">${this._escape(s)}</option>`).join("")}`;
    sIns.value = this.topFilters.install;

    const funcs = Array.from(new Set((this.locations||[]).map(l=>l.functionalityStatus).filter(Boolean))).sort();
    const sFun = makeSelect("owd-dd-func","Functionality status");
    sFun.innerHTML = `<option value="">All Functionality status</option>${funcs.map(s=>`<option value="${this._escape(s)}">${this._escape(s)}</option>`).join("")}`;
    sFun.value = this.topFilters.func;

    const sBlank = makeSelect("owd-dd-blanks","Blank fields");
    sBlank.innerHTML = `
      <option value="all">All rows</option>
      <option value="has">Rows with blanks</option>
      <option value="none">Rows without blanks</option>
    `;
    sBlank.value = this.topFilters.blanks;
  }

  _setupHorizontalSync(table){
    const wrap = table.closest(".table-scroll") || table.parentElement;
    if (!wrap) return;

    let top = document.getElementById("owd-hscroll-top");
    if (!top){
      top = document.createElement("div");
      top.id = "owd-hscroll-top";
      top.className = "owd-hscroll";
      top.innerHTML = `<div class="owd-hscroll-inner"></div>`;
      wrap.parentElement.insertBefore(top, wrap);
    }

    const inner = top.querySelector(".owd-hscroll-inner");
    const syncWidth = () => { inner.style.width = table.scrollWidth + "px"; };
    syncWidth();
    if (!this._owdResizeObs){
      this._owdResizeObs = new ResizeObserver(syncWidth);
      this._owdResizeObs.observe(table);
    }

    const sync = (src, dst) => {
      let ticking = false;
      src.addEventListener("scroll", ()=>{
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(()=>{
          dst.scrollLeft = src.scrollLeft;
          ticking = false;
        });
      });
    };
    sync(top, wrap);
    sync(wrap, top);
  }

  _ensureOWDStyles(){
    if (document.getElementById("owd-enhanced-style")) return;
    const css = `
#owd-hscroll-top.owd-hscroll{
  position: sticky; top: 0; z-index: 3;
  height: 14px; overflow-x: auto; overflow-y: hidden;
  background: #fff; border-bottom: 1px solid #e6ebf2;
}
#owd-hscroll-top .owd-hscroll-inner{ height: 1px; }

.owd-table{ table-layout: auto; width: max-content; border-collapse: separate; border-spacing: 0; }
.owd-table th, .owd-table td{ border-right: 1px solid #e6ebf2; border-bottom: 1px solid #e6ebf2; }
.owd-table th:first-child, .owd-table td:first-child{ border-left: 1px solid #e6ebf2; }
.owd-table thead th{ border-top: 1px solid #e6ebf2; background:#f8fafc; text-align:center; }
.owd-table thead tr.header th{ position: sticky; top: 0; z-index: 2; }
#owd-thead .owd-filter-wrap{ margin-top: 6px; }
#owd-thead .owd-filter{
  width: 100%; padding: 6px 8px; font-size: 13px;
  border: 1px solid #dfe4ea; border-radius: 6px; background:#fff;
}
.cell-empty{ background:#fdecec; }
.cell-dup{ background:#fff3cd; }
.doc-actions{ display:flex; gap:8px; justify-content:center; }
    `.trim();
    const style = document.createElement("style");
    style.id = "owd-enhanced-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  _docCellHTML(loc){
    const id = loc.id;
    const list = this._loadDocs()[id] || [];
    const links = list.map((d, i) => `<a href="${d.dataUrl}" target="_blank" rel="noopener">View ${i+1}</a>`).join(" &nbsp; ");
    const canUpload = Array.isArray(this.uploadAllowedUsers)
        ? this.uploadAllowedUsers.includes(this.currentUser)
        : true;
    const uploadBtn = canUpload
      ? `<label class="btn btn-sm btn-secondary" style="margin:0;cursor:pointer;">
           Upload<input type="file" accept="application/pdf" data-doc-for="${id}" style="display:none;">
         </label>`
      : "";
    return `<div class="doc-actions">${links || '<span style="opacity:.6">—</span>'}${uploadBtn ? '&nbsp;'+uploadBtn : ''}</div>`;
  }
  _handleDocUpload(id, file){
    if (!file || file.type !== "application/pdf"){ alert("Please select a PDF file."); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const db = this._loadDocs();
      (db[id] ||= []).push({ name:file.name, dataUrl: fr.result, ts: Date.now() });
      localStorage.setItem(this.docStorageKey, JSON.stringify(db));
      this.renderOfficeDetails();
    };
    fr.readAsDataURL(file);
  }
  _loadDocs(){
    try{ return JSON.parse(localStorage.getItem(this.docStorageKey) || "{}"); }catch{ return {}; }
  }
  _escape(v){
    return String(v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  // ---- simple PDFs + Excel/backup CRUD (unchanged) ----
  exportDashboardPDF(){ this._pdfSimple("POS Deployment Dashboard Summary"); }
  exportProgressPDF(){ this._pdfSimple("POS Deployment Progress Report"); }
  _wireExportReportsPdfForm(){ /* no-op here; keep your dialog if present */ }
  exportReportsPDF(){ this._pdfSimple("NKR POS Deployment Report"); }
  _pdfSimple(title){
    if (!window.jspdf?.jsPDF) { alert("PDF library not loaded. Please refresh."); return; }
    const { jsPDF } = window.jspdf; const doc=new jsPDF();
    doc.setFontSize(20); doc.text(title,20,30);
    doc.setFontSize(12);
    const d = new Date();
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    doc.text(`Generated on: ${dd}/${mm}/${yy}`, 20, 45);
    doc.text(`Generated by: ${this.currentUser||"User"}`,20,55);
    doc.save(`${title.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.pdf`);
  }

  // ---- CRUD ----
  showLocationForm(){ this.currentLocationId=null; document.getElementById("modalTitle").textContent="Add New Location"; document.getElementById("locationForm").reset(); document.getElementById("locationModal").style.display="block"; }
  closeLocationModal(){ document.getElementById("locationModal").style.display="none"; }
  saveLocation(event){
    event.preventDefault();
    const d=id=>document.getElementById(id).value;
    const locationData = {
      division: d("division"), postOfficeName: d("postOfficeName"), postOfficeId: d("postOfficeId"),
      officeType: d("officeType"), contactPersonName: d("contactPersonName"),
      contactPersonNo: d("contactPersonNo"), city: d("city"), state: d("state"),
      pincode: d("pincode"), numberOfPosToBeDeployed: parseInt(d("numberOfPosToBeDeployed"))||0,
      dateOfReceiptOfDevice: d("dateOfReceiptOfDevice"), noOfDevicesReceived: parseInt(d("noOfDevicesReceived"))||0,
      installationStatus: d("installationStatus"), functionalityStatus: d("functionalityStatus"),
      issuesIfAny: document.getElementById("issuesIfAny").value || "None",
      altContactNo:"", contactEmail:"", locationAddress:"", location:"", typeOfPosTerminal:"EZETAP ANDROID X990", serialNo:""
    };
    if (this.currentLocationId){
      const i=this.locations.findIndex(l=>l.id===this.currentLocationId);
      if (i>-1) this.locations[i] = { ...this.locations[i], ...locationData };
    } else {
      locationData.id=this.nextLocationId++;
      locationData.slNo=this.locations.length+1;
      this.locations.push(locationData);
    }
    this.saveToStorage(); this.closeLocationModal(); this.updateDashboard(); alert("Location saved successfully!");
  }
  editLocation(id){
    this.currentLocationId=id; const l=this.locations.find(x=>x.id===id);
    if (!l) return;
    document.getElementById("modalTitle").textContent="Edit Location";
    ["division","postOfficeName","postOfficeId","officeType","contactPersonName","contactPersonNo","city","state","pincode","numberOfPosToBeDeployed","dateOfReceiptOfDevice","noOfDevicesReceived","installationStatus","functionalityStatus","issuesIfAny"].forEach(k=>{
      const el=document.getElementById(k); if (el) el.value = l[k] ?? "";
    });
    document.getElementById("locationModal").style.display="block";
  }
  deleteLocation(id){
    if (!confirm("Delete this Post Office?")) return;
    this.locations=this.locations.filter(l=>l.id!==id);
    this.locations.forEach((l,i)=> l.slNo=i+1);
    this.saveToStorage(); this.displayLocations(); this.updateDashboard(); alert("Post Office deleted successfully!");
  }

  // ---- Excel import/export ----
  downloadTemplate(){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const header=['Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type','NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.','CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE','NUMBER OF POS TO BE DEPORTED','TYPE OF POS TERMINAL','Date of receipt of device','No of devices received','Serial No','Installation status','Functionality / Working status of POS machines','Issues if any'];
    const sample=[1,'Sample Division','Sample Post Office','SAMPLE001','Head Post Office','Contact Person','9876543210','9876543211','contact@postoffice.gov.in','Sample Address','Sample Location','Sample City','Sample State','123456',5,'EZETAP ANDROID X990','',0,'','Pending','Not Tested','None'];
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,sample]); XLSX.utils.book_append_sheet(wb,ws,"POS Template"); XLSX.writeFile(wb,"POS_Deployment_Template.xlsx");
  }
  exportCurrentData(){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const header=['Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type','NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.','CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE','NUMBER OF POS TO BE DEPLOYED','TYPE OF POS TERMINAL','Date of receipt of device','No of devices received','Serial No','Installation status','Functionality / Working status of POS machines','Issues if any'];
    const rows=(this.locations||[]).map(l=>[
      l.slNo||'',l.division||'',l.postOfficeName||'',l.postOfficeId||'',l.officeType||'',
      l.contactPersonName||'',l.contactPersonNo||'',l.altContactNo||'',l.contactEmail||'',
      l.locationAddress||'',l.location||'',l.city||'',l.state||'',l.pincode||'',
      l.numberOfPosToBeDeployed||'',l.typeOfPosTerminal||'',l.dateOfReceiptOfDevice||'',
      l.noOfDevicesReceived||'',l.serialNo||'',l.installationStatus||'',l.functionalityStatus||'',l.issuesIfAny||''
    ]);
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,...rows]); XLSX.utils.book_append_sheet(wb,ws,"POS Data");
    XLSX.writeFile(wb,`POS_Data_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  }
  exportToExcel(){ this.exportCurrentData(); }

  showImportModal(){ document.getElementById("importModal").style.display="block"; }
  closeImportModal(){ document.getElementById("importModal").style.display="none"; document.getElementById("importPreview").classList.add("hidden"); document.getElementById("excelFileInput").value=""; }
  handleExcelImport(event){
    const file=event.target.files?.[0]; if (!file) return;
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=e.target.result;
        const wb=XLSX.read(data,{type:"binary"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(ws,{header:1});
        this.processImportData(json);
      }catch(err){ alert("Error reading Excel: "+err.message); }
    };
    reader.readAsBinaryString(file);
  }
  processImportData(data){
    if (!data || data.length<2){ alert("Excel must have header + one row"); return; }
    const out=[];
    for (let i=1;i<data.length;i++){
      const r=data[i]; if (!r || !r.length) continue;
      if (!r[1] || !r[2]) continue; // needs Division & PO Name
      out.push({
        id: this.nextLocationId++,
        slNo: out.length+1,
        division:r[1]||'', postOfficeName:r[2]||'', postOfficeId:r[3]||`AUTO-${Date.now()}-${i}`,
        officeType:r[4]||'Sub Post Office', contactPersonName:r[5]||'Not Provided',
        contactPersonNo:r[6]||'', altContactNo:r[7]||'', contactEmail:r[8]||'',
        locationAddress:r[9]||'', location:r[10]||'', city:r[11]||'', state:r[12]||'',
        pincode:r[13]||'', numberOfPosToBeDeployed:parseInt(r[14])||1, typeOfPosTerminal:r[15]||'EZETAP ANDROID X990',
        dateOfReceiptOfDevice:r[16]||'', noOfDevicesReceived:parseInt(r[17])||0, serialNo:r[18]||'',
        installationStatus:r[19]||'Pending', functionalityStatus:r[20]||'Not Tested', issuesIfAny:r[21]||'None'
      });
    }
    this.importData=out;
    this.showImportPreview();
  }
  showImportPreview(){
    const el=document.getElementById("importPreviewContent");
    if (!el) return;
    let html=`<div class="alert alert-success"><strong>✅ Ready to import ${this.importData.length} locations</strong></div>
      <div style="max-height:300px;overflow-y:auto;">
      <table class="data-table"><thead><tr><th>Post Office</th><th>Division</th><th>City</th><th>Status</th></tr></thead><tbody>`;
    this.importData.slice(0,10).forEach(l=>{ html+=`<tr><td>${l.postOfficeName}</td><td>${l.division}</td><td>${l.city}</td><td>${l.installationStatus}</td></tr>`; });
    html+=`</tbody></table></div>`; if (this.importData.length>10) html+=`<p><em>Showing first 10 of ${this.importData.length} locations</em></p>`;
    el.innerHTML=html; document.getElementById("importPreview")?.classList.remove("hidden");
  }
  confirmImport(){
    if (!confirm(`This will replace all existing data with ${this.importData.length} uploaded rows. Continue?`)) return;
    this.locations=[...this.importData];
    const maxId=this.locations.reduce((m,l)=>Math.max(m,l.id||0),0); this.nextLocationId=maxId+1;
    this.saveToStorage(); this.closeImportModal(); this.updateDashboard(); alert(`Imported ${this.importData.length} locations!`); this.importData=[];
  }
  cancelImport(){ this.importData=[]; document.getElementById("importPreview")?.classList.add("hidden"); }

  createBackup(){
    const payload={ locations:this.locations, nextLocationId:this.nextLocationId, backupDate:new Date().toISOString(), version:"1.0" };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`POS_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  restoreBackup(){ document.getElementById("backupFileInput")?.click(); }
  handleBackupRestore(event){
    const file=event.target.files?.[0]; if (!file) return;
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=JSON.parse(e.target.result);
        if (!confirm("Replace current data with backup?")) return;
        this.locations=data.locations||[]; this.nextLocationId=data.nextLocationId||1;
        this.saveToStorage(); this.updateDashboard(); alert("Backup restored successfully!");
      }catch(err){ alert("Error restoring backup: "+err.message); }
    };
    reader.readAsText(file);
  }
  clearAllData(){
    if (!confirm("This will permanently delete all data. Continue?")) return;
    if (!confirm("This action cannot be undone. Confirm again to proceed.")) return;
    this.locations=[]; this.nextLocationId=1; this.saveToStorage(); this.updateDashboard(); this.displayLocations();
    alert("All data cleared.");
  }
}

// ---- Boot + tiny global shims for old inline onclicks ----
window.tracker = new AdvancedPOSTracker();
window.addEventListener('DOMContentLoaded', () => tracker.init());

window.showLocationForm   = () => tracker.showLocationForm();
window.closeLocationModal = () => tracker.closeLocationModal();
window.showImportModal    = () => tracker.showImportModal();
window.closeImportModal   = () => tracker.closeImportModal();
window.exportToExcel      = () => tracker.exportToExcel();
window.downloadTemplate   = () => tracker.downloadTemplate();
window.exportDashboardPDF = () => tracker.exportDashboardPDF();
window.exportProgressPDF  = () => tracker.exportProgressPDF();
window.exportReportsPDF   = (opts) => tracker.exportReportsPDF(opts);
window.createBackup       = () => tracker.createBackup();
window.restoreBackup      = () => tracker.restoreBackup();
window.handleBackupRestore= (e) => tracker.handleBackupRestore(e);
window.confirmImport      = () => tracker.confirmImport();
window.cancelImport       = () => tracker.cancelImport();
