// Advanced POS Deployment Tracker (static, PWA, localStorage "DB")

class AdvancedPOSTracker {
  constructor() {
    this.locations = [];
    this.currentUser = null;
    this.currentLocationId = null;
    this.nextLocationId = 1;
    this.importData = [];
    this.users = ["KARNA", "NKR", "SKR", "BGR", "SBI_DOP"];
    this.storageKey = "advancedPOSTrackerData";

    // --- Office wise details state (scoped) ---
    this.officeFilters = {};                         // per-column (inline) text filters
    this.topFilters = { division:"", install:"", func:"", blanks:"all" }; // toolbar dropdowns
    this.docStorageKey = "advancedPOSTrackerDocs";   // localStorage key for PDF blobs
    this.uploadAllowedUsers = null;                  // null => everyone; or restrict e.g. ["NKR","SBI_DOP"]
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
    const savedUser = localStorage.getItem("advancedPOSCurrentUser");
    if (savedUser && this.users.includes(savedUser)) {
      this.currentUser = savedUser;
      this.showMainApp();
    } else {
      this.showLoginScreen();
    }
  }
  login(username) {
    this.currentUser = username;
    localStorage.setItem("advancedPOSCurrentUser", username);
    this.showMainApp();
  }
  logout() {
    this.currentUser = null;
    localStorage.removeItem("advancedPOSCurrentUser");
    this.showLoginScreen();
  }
  showLoginScreen() {
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("mainApp").classList.add("hidden");
  }
  showMainApp() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
    document.getElementById("currentUser").textContent = this.currentUser || "User";
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
      case "locations": this.renderOfficeDetails(); break;   // OWD table
      case "progress": this.displayProgress(); this.updateProgressFilters(); break;
      case "reports": this.generateReports(); break;
      case "data-management": this.updateDataStatistics && this.updateDataStatistics(); break;
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

  // ---- dashboard (frozen) ----
  updateDashboard() { this.updateOverallStats(); this.updateDivisionStats(); this.updateRecentActivity(); }
  updateOverallStats() {
    const totalLocations = this.locations.length;
    const totalDevicesDeployed = this.locations.reduce((sum, l) => sum + (parseInt(l.noOfDevicesReceived) || 0), 0);
    const pending = this.locations.filter(l => l.installationStatus === "Pending").length;
    const withIssues = this.locations.filter(l => l.issuesIfAny && l.issuesIfAny.trim() && l.issuesIfAny !== "None").length;
    document.getElementById("overallStats").innerHTML = `
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
    document.getElementById("divisionStats").innerHTML = html;
  }
  getStatusClass(status) { return status==="Completed"?"status-completed":(status==="In Progress"||status==="Device Received")?"status-in-progress":"status-pending"; }
  calculateProgress(l) { if (!l.numberOfPosToBeDeployed) return 0; return Math.round(((l.noOfDevicesReceived||0)/l.numberOfPosToBeDeployed)*100); }
  updateRecentActivity() {
    const rec = this.locations.slice(-5).reverse();
    if (!rec.length) {
      document.getElementById("recentActivity").innerHTML = `
        <div class="alert alert-info"><h4>🚀 Welcome to Advanced POS Tracker!</h4>
        <p>Start by importing Excel data or adding locations.</p>
        <div style="margin-top:15px;">
          <button class="btn btn-primary" onclick="tracker.showTab(null,'data-management')">📊 Manage Data</button>
          <button class="btn btn-success" onclick="showLocationForm()">➕ Add Location</button>
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
    document.getElementById("recentActivity").innerHTML = html;
  }

  // ---- legacy lists / progress (frozen) ----
  filterByDivision(name){ this.showTab(null,"progress"); const sel=document.getElementById("progressDivisionFilter"); if (sel){ sel.value=name; this.filterProgressByDivision(); } }
  displayLocations(){ this.renderLocationsList(this.locations, "locationsList"); }
  renderLocationsList(list, targetId="locationsList"){
    const target = document.getElementById(targetId);
    if (!list.length) {
      target.innerHTML = `<div class="alert alert-info"><h4>No Post Office found</h4><p>Add Post Offices to get started.</p>
        <button class="btn btn-primary" onclick="showLocationForm()">Add Post Office(s)</button></div>`;
      return;
    }
    let html = "";
    list.forEach(l=>{
      const statusClass = this.getStatusClass(l.installationStatus);
      const pct = this.calculateProgress(l);
      html += `
      <div class="location-card">
        <div class="location-header">
          <div class="location-title">${l.postOfficeName} (${l.postOfficeId})</div>
          <div class="flex gap-10">
            <span class="status-badge ${statusClass}">${l.installationStatus}</span>
            <button class="btn btn-sm btn-primary" onclick="tracker.editLocation(${l.id})">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" onclick="tracker.deleteLocation(${l.id})">🗑️ Delete</button>
          </div>
        </div>
        <div class="location-details">
          <div class="detail-item"><div class="detail-label">Division</div><div class="detail-value">${l.division}</div></div>
          <div class="detail-item"><div class="detail-label">Contact</div><div class="detail-value">${l.contactPersonName}</div></div>
          <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value">${l.contactPersonNo}</div></div>
          <div class="detail-item"><div class="detail-label">City, State</div><div class="detail-value">${l.city}, ${l.state}</div></div>
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
    this.renderLocationsList(filtered,"progressList");
  }

  // ---- reports (frozen UI; PDF enhanced below) ----
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
            <th>Division</th>
            <th>Offices</th>
            <th>Devices Required</th>
            <th>Devices Received</th>
            <th>Pending</th>
            <th>Devices installed</th>
            <th>Pending for installation</th>
            <th>Offices with Issues</th>
            <th>Completed</th>
            <th>Completion %</th>
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

  // ===== Office wise details (table view) =====
  renderOfficeDetails(){
    this._ensureOWDStyles();  // add scoped CSS once

    const hostHead = document.getElementById("owd-thead");
    const hostBody = document.getElementById("owd-tbody");
    const meta     = document.getElementById("owd-meta");
    const global   = document.getElementById("owd-global-search");
    const table    = document.getElementById("owd-table");
    if (!hostHead || !hostBody || !table) return;

    // Ensure top toolbar dropdowns beside global search (created once)
    this._ensureTopFiltersUI();

    const cols = this._owdColumns();
    const centerKeys = new Set([
      "slNo","postOfficeId","contactPersonNo","altContactNo","state","pincode",
      "numberOfPosToBeDeployed","dateOfReceiptOfDevice","noOfDevicesReceived",
      "serialNo","mid","tid","installationStatus","functionalityStatus"
    ]);

    // Header row: center-align all labels; inline filter inputs without placeholder text
    const headRow = `<tr class="header">${
      cols.map(c => {
        const filter = (c.type === 'docs')
          ? ''
          : `<div class="owd-filter-wrap"><input class="owd-filter" data-col="${c.key}" aria-label="Filter ${c.label}"></div>`;
        return `<th style="text-align:center"><div>${c.label}</div>${filter}</th>`;
      }).join("")
    }</tr>`;
    hostHead.innerHTML = headRow;

    // Bind inline filters BEFORE applying (prevents empty first paint)
    this._bindOfficeFilters(cols);

    // Apply all filters (inline, global, toolbar dropdowns)
    let { rows } = this._applyOfficeFilters(cols);

    // Safety: if everything filtered out unintentionally, show all
    if (!rows.length && (this.locations || []).length) rows = this.locations;

    // Render body
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

    // Statistics: rows count + blank field stats
    const stats = this._blankStats(this.locations, cols);
    if (meta) {
      const total = (this.locations || []).length;
      const dupeCount = this._collectSerialDuplicates().size;
      meta.innerHTML = `
        <div><strong>Rows:</strong> ${rows.length} of ${total} &nbsp;•&nbsp; <strong>Duplicate Serial Nos:</strong> ${dupeCount}</div>
        <div><strong>Blank fields:</strong> ${stats.blankCells} in ${stats.rowsWithBlank} rows</div>
      `;
    }

    // Global search input (bind once)
    if (global && !global._owdBound){
      global._owdBound = true;
      global.addEventListener("input", () => this.renderOfficeDetails());
    }

    // Delegate upload change events (bind once)
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

    // Synchronized top horizontal scrollbar (sticky)
    this._setupHorizontalSync(table);
  }

  _owdColumns(){
    // Order and names remain as existing Excel/template + extra columns; header wording unchanged
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

      // Toolbar dropdowns
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

    // create container once, right after the search input
    let box = document.getElementById("owd-top-filters");
    if (!box){
      box = document.createElement("div");
      box.id = "owd-top-filters";
      box.style.display = "flex";
      box.style.flexWrap = "wrap";
      box.style.gap = "8px";
      // place next to the search field
      const parent = search.parentElement || search.closest(".filters") || document.querySelector("#locations .filters") || document.body;
      parent.appendChild(box);
    }

    // helper to create select
    const makeSelect = (id, label) => {
      let sel = document.getElementById(id);
      if (!sel){
        sel = document.createElement("select");
        sel.id = id;
        sel.className = "filter-select";
        sel.style.minWidth = "170px";
        sel.setAttribute("aria-label", label);
        sel.addEventListener("change", ()=>{
          // update state
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

    // Division
    const divisions = Array.from(new Set((this.locations||[]).map(l=>l.division).filter(Boolean))).sort();
    const sDiv = makeSelect("owd-dd-division","Division");
    sDiv.innerHTML = `<option value="">All Divisions</option>${divisions.map(d=>`<option value="${this._escape(d)}">${this._escape(d)}</option>`).join("")}`;
    sDiv.value = this.topFilters.division;

    // Installation status
    const insts = Array.from(new Set((this.locations||[]).map(l=>l.installationStatus).filter(Boolean))).sort();
    const sIns = makeSelect("owd-dd-install","Installation status");
    sIns.innerHTML = `<option value="">All Installation status</option>${insts.map(s=>`<option value="${this._escape(s)}">${this._escape(s)}</option>`).join("")}`;
    sIns.value = this.topFilters.install;

    // Functionality status
    const funcs = Array.from(new Set((this.locations||[]).map(l=>l.functionalityStatus).filter(Boolean))).sort();
    const sFun = makeSelect("owd-dd-func","Functionality status");
    sFun.innerHTML = `<option value="">All Functionality status</option>${funcs.map(s=>`<option value="${this._escape(s)}">${this._escape(s)}</option>`).join("")}`;
    sFun.value = this.topFilters.func;

    // Blank fields dropdown
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

    // Make top scroller once
    let top = document.getElementById("owd-hscroll-top");
    if (!top){
      top = document.createElement("div");
      top.id = "owd-hscroll-top";
      top.className = "owd-hscroll";
      top.innerHTML = `<div class="owd-hscroll-inner"></div>`;
      // insert above the table wrapper
      wrap.parentElement.insertBefore(top, wrap);
    }

    // Size the fake inner to table width
    const inner = top.querySelector(".owd-hscroll-inner");
    const syncWidth = () => { inner.style.width = table.scrollWidth + "px"; };
    syncWidth();
    if (!this._owdResizeObs){
      this._owdResizeObs = new ResizeObserver(syncWidth);
      this._owdResizeObs.observe(table);
    }

    // Sync scroll positions (both ways)
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
/* ===== Office wise details (scoped) ===== */
#owd-hscroll-top.owd-hscroll{
  position: sticky; top: 0; z-index: 3;
  height: 14px; overflow-x: auto; overflow-y: hidden;
  background: #fff; border-bottom: 1px solid #e6ebf2;
}
#owd-hscroll-top .owd-hscroll-inner{ height: 1px; }

.owd-table{
  table-layout: auto; width: max-content; border-collapse: separate; border-spacing: 0;
}
.owd-table th, .owd-table td{
  border-right: 1px solid #e6ebf2; border-bottom: 1px solid #e6ebf2;
}
.owd-table th:first-child, .owd-table td:first-child{ border-left: 1px solid #e6ebf2; }
.owd-table thead th{ border-top: 1px solid #e6ebf2; background:#f8fafc; text-align:center; }
.owd-table thead tr.header th{
  position: sticky; top: 0; z-index: 2; /* stick header with filters inside */
}
#owd-thead .owd-filter-wrap{ margin-top: 6px; }
#owd-thead .owd-filter{
  width: 100%; padding: 6px 8px; font-size: 13px;
  border: 1px solid #dfe4ea; border-radius: 6px; background:#fff;
}
.cell-empty{ background:#fdecec; }   /* blanks light red */
.cell-dup{ background:#fff3cd; }     /* dup serials light amber */
.doc-actions{ display:flex; gap:8px; justify-content:center; }
    `.trim();
    const style = document.createElement("style");
    style.id = "owd-enhanced-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Documents (PDF) storage & cell UI (unchanged) ----
  _docCellHTML(loc){
    const id = loc.id;
    const list = this._loadDocs()[id] || [];
    const links = list.map((d, i) => `<a href="${d.dataUrl}" target="_blank" rel="noopener">View ${i+1}</a>`).join(" &nbsp; ");
    const canUpload = Array.isArray(this.uploadAllowedUsers)
        ? this.uploadAllowedUsers.includes(this.currentUser)
        : true; // null => allow all
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

  // ---- PDF + CRUD + Import/Export + Backup (all frozen below) ----
  exportDashboardPDF(){ this._pdfSimple("POS Deployment Dashboard Summary"); }
  exportProgressPDF(){ this._pdfSimple("POS Deployment Progress Report"); }

  // ===== Enhanced Reports PDF — now supports date / date-range selection =====
  exportReportsPDF(opts){
    if (!window.jspdf?.jsPDF) { alert("PDF library not loaded. Please refresh."); return; }
    const { jsPDF } = window.jspdf;

    // --- Selection overlay (orientation + period) ---
    if (!opts || !opts.orientation){
      const id = "pdf-orient-overlay";
      if (document.getElementById(id)) return;
      const todayYMD = new Date().toISOString().slice(0,10);
      const overlay = document.createElement("div");
      overlay.id = id;
      overlay.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2000;display:flex;align-items:center;justify-content:center;">
          <div style="background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:18px 20px;width:420px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
            <h3 style="margin:0 0 10px;font-size:16px;color:#2c3e50;">Export Reports PDF</h3>

            <div style="margin:4px 0 8px;font-size:13px;color:#34495e;"><strong>Orientation</strong></div>
            <div style="display:flex;gap:12px;margin:0 0 10px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="radio" name="pdf-orient" value="portrait"> Portrait
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="radio" name="pdf-orient" value="landscape" checked> Landscape
              </label>
            </div>

            <div style="margin:6px 0 6px;font-size:13px;color:#34495e;"><strong>Report period</strong></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
                <input type="radio" name="pdf-period" value="all" checked> Today
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
                <input type="radio" name="pdf-period" value="single"> Single date:
                <input id="pdf-date" type="date" value="${todayYMD}" style="flex:1;min-width:160px;padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
                <input type="radio" name="pdf-period" value="range"> Date range:
                <input id="pdf-start" type="date" value="${todayYMD}" style="padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
                <span style="opacity:.7">to</span>
                <input id="pdf-end" type="date" value="${todayYMD}" style="padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
              </label>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
              <button id="pdf-orient-cancel" class="btn btn-sm btn-secondary" style="padding:8px 14px;">Cancel</button>
              <button id="pdf-orient-generate" class="btn btn-sm btn-primary" style="padding:8px 14px;">Generate</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      // Enable/disable inputs based on chosen period
      const syncPeriodInputs = () => {
        const val = overlay.querySelector('input[name="pdf-period"]:checked')?.value;
        overlay.querySelector('#pdf-date').disabled  = (val!=='single');
        overlay.querySelector('#pdf-start').disabled = (val!=='range');
        overlay.querySelector('#pdf-end').disabled   = (val!=='range');
      };
      overlay.querySelectorAll('input[name="pdf-period"]').forEach(r=> r.addEventListener('change', syncPeriodInputs));
      syncPeriodInputs();

      overlay.querySelector("#pdf-orient-cancel").onclick = ()=> overlay.remove();
      overlay.querySelector("#pdf-orient-generate").onclick = ()=>{
        const sel = overlay.querySelector('input[name="pdf-orient"]:checked')?.value || "landscape";
        const period = overlay.querySelector('input[name="pdf-period"]:checked')?.value || "all";
        const date = overlay.querySelector('#pdf-date')?.value || "";
        const start = overlay.querySelector('#pdf-start')?.value || "";
        const end = overlay.querySelector('#pdf-end')?.value || "";
        overlay.remove();

        if (period === 'single'){
          this.exportReportsPDF({ orientation: sel, reportMode: 'single', reportDate: date });
        } else if (period === 'range'){
          this.exportReportsPDF({ orientation: sel, reportMode: 'range', startDate: start, endDate: end });
        } else {
          this.exportReportsPDF({ orientation: sel, reportMode: 'all' });
        }
      };
      return;
    }

    // ==== PDF generation with optional date filters ====
    const orientation = opts.orientation === "portrait" ? "portrait" : "landscape";

    const ymdToDMY = (ymd)=>{
      if (!ymd) return null;
      const [Y,M,D] = ymd.split("-");
      if (!Y || !M || !D) return null;
      return `${D.padStart(2,"0")}/${M.padStart(2,"0")}/${Y}`;
    };
    const parseYMD = (ymd)=>{
      if (!ymd) return null;
      const d = new Date(ymd+"T00:00:00");
      return isNaN(d) ? null : d;
    };
    const sameDMY = (val, dmy)=>{
      const n = normalizeToDMY(val);
      return n && dmy && n === dmy;
    };
    const inRange = (val, startYMD, endYMD)=>{
      const d = parseYMDFromAny(val);
      if (!d) return false;
      const s = startYMD ? parseYMD(startYMD) : null;
      const e = endYMD ? parseYMD(endYMD) : null;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    };
    const formatDMY = (d)=> {
      const dd = String(d.getDate()).padStart(2,"0");
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };
    const toInt = v => parseInt(v) || 0;
    const normalizeToDMY = (val)=>{
      if (!val) return null;
      const t = String(val).trim();
      let dd, mm, yyyy;
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)){ [yyyy,mm,dd] = t.split("-"); }
      else if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)){ [dd,mm,yyyy] = t.split("/"); }
      else if (/^\d{2}-\d{2}-\d{4}$/.test(t)){ [dd,mm,yyyy] = t.split("-"); }
      else { const d=new Date(t); return isNaN(d)? null: formatDMY(d); }
      return `${dd.padStart(2,"0")}/${mm.padStart(2,"0")}/${yyyy}`;
    };
    const parseYMDFromAny = (val)=>{
      // Accept "YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", Date object
      if (!val) return null;
      if (val instanceof Date) return isNaN(val)? null : new Date(val.getFullYear(),val.getMonth(),val.getDate());
      const s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseYMD(s);
      let dd, mm, yyyy;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ [dd,mm,yyyy] = s.split("/"); }
      else if (/^\d{2}-\d{2}-\d{4}$/.test(s)){ [dd,mm,yyyy] = s.split("-"); }
      else {
        const d = new Date(s);
        return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      return parseYMD(`${yyyy}-${mm}-${dd}`);
    };

    // Period selection
    const mode = opts.reportMode || 'all';
    const today = new Date();
    const todayDMY = formatDMY(today);

    const rows = this.locations || [];

    // For labels + filtering
    let devicesPeriodLabel = "today";
    let singleDMY = null, rangeStartDMY = null, rangeEndDMY = null;
    let startYMD = null, endYMD = null;

    if (mode === 'single' && opts.reportDate){
      singleDMY = ymdToDMY(opts.reportDate);
      devicesPeriodLabel = `on ${singleDMY}`;
    } else if (mode === 'range' && opts.startDate && opts.endDate){
      startYMD = opts.startDate; endYMD = opts.endDate;
      rangeStartDMY = ymdToDMY(startYMD); rangeEndDMY = ymdToDMY(endYMD);
      devicesPeriodLabel = `from ${rangeStartDMY} to ${rangeEndDMY}`;
    } else {
      // all
      // keep "today" wording for backward compatibility
    }

    // Aggregates (unfiltered)
    const totalOffices = rows.length;
    const totalDevicesRequired = rows.reduce((s,l)=> s + toInt(l.numberOfPosToBeDeployed), 0);
    const totalDevicesReceived = rows.reduce((s,l)=> s + toInt(l.noOfDevicesReceived), 0);
    const devicesInstalledRegion = rows.filter(r => (r.installationStatus||"").trim() === "Completed").length;

    // Devices received for selected period
    let devicesReceivedInPeriod = 0;
    if (mode === 'single' && singleDMY){
      devicesReceivedInPeriod = rows.reduce((s,l)=> s + (sameDMY(l.dateOfReceiptOfDevice, singleDMY) ? toInt(l.noOfDevicesReceived) : 0), 0);
    } else if (mode === 'range' && startYMD && endYMD){
      devicesReceivedInPeriod = rows.reduce((s,l)=> s + (inRange(l.dateOfReceiptOfDevice, startYMD, endYMD) ? toInt(l.noOfDevicesReceived) : 0), 0);
    } else {
      // all -> show "today" as before
      devicesReceivedInPeriod = rows.reduce((s,l)=> s + (normalizeToDMY(l.dateOfReceiptOfDevice) === todayDMY ? toInt(l.noOfDevicesReceived) : 0), 0);
    }

    // Group by division
    const byDiv = {};
    rows.forEach(r=>{
      const d = r.division || "—";
      (byDiv[d] ||= []).push(r);
    });

    // Division entries (main table): alphabetical except "RMS HB Division" last
    const entries = Object.entries(byDiv).sort(([a],[b])=>{
      if (a === "RMS HB Division" && b !== "RMS HB Division") return 1;
      if (b === "RMS HB Division" && a !== "RMS HB Division") return -1;
      return a.localeCompare(b);
    });

    const divisions = entries.map(([division, arr])=>{
      const offices = arr.length;
      const req = arr.reduce((s,l)=> s + toInt(l.numberOfPosToBeDeployed), 0);
      const rec = arr.reduce((s,l)=> s + toInt(l.noOfDevicesReceived), 0);
      const pend = Math.max(0, req - rec);
      const inst = arr.filter(x => (x.installationStatus||"").trim() === "Completed").length;
      const pinst = Math.max(0, rec - inst);
      const iss = arr.filter(x => {
        const t = (x.issuesIfAny||"").toString().trim().toLowerCase();
        return t && t !== "none";
      }).length;
      const comp = inst;
      const pct = req ? Math.round((inst/req)*100) : 0;
      return { division, offices, req, rec, pend, inst, pinst, iss, comp, pct };
    });

    const totalsRow = {
      division: "Total",
      offices: totalOffices,
      req: totalDevicesRequired,
      rec: totalDevicesReceived,
      pend: Math.max(0, totalDevicesRequired - totalDevicesReceived),
      inst: devicesInstalledRegion,
      pinst: Math.max(0, totalDevicesReceived - devicesInstalledRegion),
      iss: rows.filter(x => {
        const t = (x.issuesIfAny||"").toString().trim().toLowerCase();
        return t && t !== "none";
      }).length,
      comp: devicesInstalledRegion,
      pct: totalDevicesRequired ? Math.round((devicesInstalledRegion / totalDevicesRequired) * 100) : 0
    };

    // Build "Devices received ... — Division-wise" list for selected period
    const periodGroups = entries.map(([division, arr])=>{
      const items = arr
        .filter(r => {
          if (mode === 'single' && singleDMY){
            return sameDMY(r.dateOfReceiptOfDevice, singleDMY) && toInt(r.noOfDevicesReceived) > 0;
          } else if (mode === 'range' && startYMD && endYMD){
            return inRange(r.dateOfReceiptOfDevice, startYMD, endYMD) && toInt(r.noOfDevicesReceived) > 0;
          } else {
            // all -> today (backward compatibility)
            return normalizeToDMY(r.dateOfReceiptOfDevice) === todayDMY && toInt(r.noOfDevicesReceived) > 0;
          }
        })
        .map(r => ({
          division,
          po: `${r.postOfficeName || ""}${r.postOfficeId ? " ("+r.postOfficeId+")" : ""}`,
          n: toInt(r.noOfDevicesReceived)
        }));

      const total = items.reduce((s,x)=> s + x.n, 0);
      return { division, items, total };
    }).filter(g => g.items.length);

    // PDF doc
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 32;
    let y = margin;

    // Colors / fonts (kept professional)
    const headerFill = { r: 232, g: 236, b: 246 };
    const stripeFill = { r: 248, g: 250, b: 255 };
    const borderGray = 180;
    const brandBlue = { r: 52, g: 152, b: 219 };

    const fontTitle = 15;
    const fontSub   = 11;
    const fontHead  = 9.5;
    const fontBody  = 9;
    const lineH     = 11;
    const padX      = 6;

    // Table columns
    const tableCols = [
      { key:'division', label:'Division', align:'left'  },
      { key:'offices',  label:'Offices', align:'center'},
      { key:'req',      label:'Devices Required', align:'center'},
      { key:'rec',      label:'Devices Received', align:'center'},
      { key:'pend',     label:'Pending', align:'center'},
      { key:'inst',     label:'Devices Installed', align:'center'},
      { key:'pinst',    label:'Pending Installation', align:'center'},
      { key:'iss',      label:'Offices with Issues', align:'center'},
      { key:'comp',     label:'Completed', align:'center'},
      { key:'pct',      label:'Completion %', align:'center'},
    ];
    const tableX = margin;
    const tableW = pageW - margin*2;

    // Auto-fit widths
    function computeAutoWidths(){
      const minW = tableCols.map(c => c.key === 'division' ? 110 : 46);
      doc.setFont('helvetica','bold'); doc.setFontSize(fontHead);
      const headerW = tableCols.map(c => Math.ceil(doc.getTextWidth(c.label) + padX*2 + 4));
      doc.setFont('helvetica','normal'); doc.setFontSize(fontBody);
      const contentW = tableCols.map(() => 0);

      const consider = obj => {
        tableCols.forEach((c, i) => {
          const v = c.key === 'pct' ? `${obj[c.key]}%` : String(obj[c.key] ?? '');
          const w = Math.ceil(doc.getTextWidth(v) + padX*2 + 2);
          if (w > contentW[i]) contentW[i] = w;
        });
      };
      divisions.forEach(consider);
      consider(totalsRow);

      let desired = tableCols.map((c,i)=> Math.max(minW[i], headerW[i], contentW[i]));
      let sumDesired = desired.reduce((a,b)=>a+b,0);

      if (sumDesired > tableW){
        const scale = tableW / sumDesired;
        desired = desired.map((w,i)=> Math.max(minW[i], Math.floor(w * scale)));
        let sum = desired.reduce((a,b)=>a+b,0);
        let tries = 0;
        while (sum > tableW && tries < 200){
          let idx = -1, slackMax = -1;
          for (let i=0;i<desired.length;i++){
            const slack = desired[i] - minW[i];
            if (slack > slackMax){ slackMax = slack; idx = i; }
          }
          if (idx < 0) break;
          desired[idx] -= 1;
          sum -= 1;
          tries++;
        }
      } else if (sumDesired < tableW){
        let leftover = tableW - sumDesired;
        const priorityKeys = ['division','pinst','req','rec','inst'];
        while (leftover > 0){
          let advanced = false;
          for (let i=0;i<tableCols.length && leftover>0;i++){
            if (priorityKeys.includes(tableCols[i].key)){
              desired[i] += 1; leftover -= 1; advanced = true;
            }
          }
          if (!advanced){
            for (let i=0;i<tableCols.length && leftover>0;i++){ desired[i]+=1; leftover-=1; }
          }
        }
      }
      tableCols.forEach((c,i)=> c.w = desired[i]);
    }

    // helpers
    function setBorder(){ doc.setDrawColor(borderGray); doc.setLineWidth(0.4); }
    function ensureSpace(h){ if (y + h > pageH - margin) { newPage(); } }
    function newPage(){ doc.addPage(); y = margin; drawHeader(); }
    function centerBlockY(rowTop, rowH, lines){
      const contentH = Math.max(lineH, lines.length * lineH);
      return rowTop + (rowH - contentH)/2 + lineH*0.85;
    }

    // Header
    function drawHeader(){
      doc.setFont('helvetica','bold'); doc.setFontSize(fontTitle);
      doc.setTextColor(brandBlue.r, brandBlue.g, brandBlue.b);
      doc.text('North Karnataka Region', margin, y); y += 18;

      doc.setTextColor(0,0,0);
      doc.setFont('helvetica','normal'); doc.setFontSize(fontSub);
      doc.text('SBI-DOP POS Machines Deployment status', margin, y); y += 14;

      // Period line
      if (mode === 'single' && singleDMY){
        doc.text(`Report for the date: ${singleDMY}`, margin, y); y += 8;
      } else if (mode === 'range' && rangeStartDMY && rangeEndDMY){
        doc.text(`Report period: ${rangeStartDMY} to ${rangeEndDMY}`, margin, y); y += 8;
      } else {
        doc.text(`Report for the date: ${todayDMY}`, margin, y); y += 8;
      }

      setBorder(); doc.line(margin, y, pageW - margin, y); y += 16;
    }
    drawHeader();

    // Region Summary
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Region Summary', margin, y); y += 12;

    doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
    const rsLeft = [
      ['Total Offices', String(totalOffices)],
      ['Total Devices required', String(totalDevicesRequired)]
    ];
    const rsRight = [
      ['Total Devices received', String(totalDevicesReceived)],
      [
        (mode==='range' ? 'Devices received in period' : (mode==='single' ? 'Devices received that day' : 'Devices received today')),
        String(devicesReceivedInPeriod)
      ]
    ];
    const colGap = 260; // right column group start
    const valOffset = 190; // value alignment width

    rsLeft.forEach(([k,v],i)=>{
      ensureSpace(14);
      doc.text(`${k}:`, margin, y);
      doc.text(v, margin + valOffset, y, { align:'right' });
      const pair = rsRight[i];
      if (pair){
        doc.text(`${pair[0]}:`, margin + colGap, y);
        doc.text(pair[1], margin + colGap + valOffset, y, { align:'right' });
      }
      y += 14;
    });
    y += 6;

    // Main table
    computeAutoWidths();

    function drawTableHeader(){
      ensureSpace(24);
      setBorder();
      // compute header height
      doc.setFont('helvetica','bold'); doc.setFontSize(fontHead);
      const headerHeights = tableCols.map(c => {
        const lines = doc.splitTextToSize(c.label, c.w - padX*2);
        return Math.max(18, lines.length * lineH + 6);
      });
      const headerH = Math.max(...headerHeights);

      doc.setFillColor(headerFill.r, headerFill.g, headerFill.b);
      const totalW = tableCols.reduce((s,c)=>s+c.w,0);
      doc.rect(tableX, y, totalW, headerH, 'F');

      // Per-cell borders + text
      let x = tableX;
      tableCols.forEach(c=>{
        doc.rect(x, y, c.w, headerH, 'S');
        const lines = doc.splitTextToSize(c.label, c.w - padX*2);
        const startY = centerBlockY(y, headerH, lines);
        if (c.align === 'left'){
          doc.text(lines, x + padX, startY, { align:'left', lineHeightFactor:1.25 });
        } else {
          lines.forEach((ln,i)=> doc.text(ln, x + c.w/2, startY + i*lineH, { align:'center' }));
        }
        x += c.w;
      });

      y += headerH;
    }

    function drawRow(obj, stripe=false, bold=false, bgFill=null){
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(fontBody);
      const cells = tableCols.map(col=>{
        const raw = col.key === 'pct' ? `${obj[col.key]}%` : String(obj[col.key] ?? '');
        const lines = doc.splitTextToSize(raw, col.w - padX*2);
        const h = Math.max(16, lines.length * lineH + 6);
        return { col, lines, h };
      });
      const rowH = Math.max(...cells.map(c => c.h));
      ensureSpace(rowH);

      const totalW = tableCols.reduce((s,c)=>s+c.w,0);
      if (bgFill){
        doc.setFillColor(bgFill.r, bgFill.g, bgFill.b);
        doc.rect(tableX, y, totalW, rowH, 'F');
      } else if (stripe){
        doc.setFillColor(stripeFill.r, stripeFill.g, stripeFill.b);
        doc.rect(tableX, y, totalW, rowH, 'F');
      }

      setBorder();
      let x = tableX;
      cells.forEach(({col,lines})=>{
        doc.rect(x, y, col.w, rowH, 'S');
        const startY = centerBlockY(y, rowH, lines);
        if (col.align === 'left'){
          doc.text(lines, x + padX, startY, { align:'left', lineHeightFactor:1.25 });
        } else {
          lines.forEach((ln,i)=> doc.text(ln, x + col.w/2, startY + i*lineH, { align:'center' }));
        }
        x += col.w;
      });
      y += rowH;
    }

    // Render main table
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Division-wise Detailed Report', margin, y); y += 8;
    drawTableHeader();

    divisions.forEach((r, idx) => {
      if (y > pageH - margin - 30){ newPage(); drawTableHeader(); }
      drawRow(r, idx % 2 === 1);
    });
    // Totals row with same (darker) background as header
    if (y > pageH - margin - 30){ newPage(); drawTableHeader(); }
    drawRow(totalsRow, false, true, headerFill);

    // ------ Devices received <period> — Division-wise list ------
    if (periodGroups.length){
      // Always move to a fresh page for clean layout (per your previous direction)
      newPage();
      doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.text(`Devices received ${devicesPeriodLabel} — Division-wise`, margin, y); y += 6;

      const cols2 = [
        { key:'division', label:'Division', align:'left'  },
        { key:'po',       label:'Post Office', align:'left' },
        { key:'n',        label:'Devices', align:'center' }
      ];

      // Flatten rows with group headers
      const rows2 = [];
      periodGroups.forEach(g=>{
        rows2.push({ _group:true, division:g.division, total:g.total });
        g.items.forEach(it => rows2.push({ division:g.division, po:it.po, n:it.n }));
      });

      // Auto widths for second table
      const min2 = [110, 220, 80];
      doc.setFont('helvetica','bold'); doc.setFontSize(fontHead);
      const headW2 = cols2.map(c => Math.ceil(doc.getTextWidth(c.label) + padX*2 + 4));
      doc.setFont('helvetica','normal'); doc.setFontSize(fontBody);
      const contentW2 = cols2.map(() => 0);
      rows2.forEach(r=>{
        cols2.forEach((c,i)=>{
          const raw = r._group
            ? (c.key==='division' ? `${r.division}  —  Total: ${r.total}` : '')
            : String(r[c.key] ?? '');
          const w = Math.ceil(doc.getTextWidth(raw) + padX*2 + 2);
          if (w > contentW2[i]) contentW2[i] = w;
        });
      });
      let desired2 = cols2.map((c,i)=> Math.max(min2[i], headW2[i], contentW2[i]));
      const tableW2 = pageW - margin*2;
      let sum2 = desired2.reduce((a,b)=>a+b,0);
      if (sum2 > tableW2){
        const scale = tableW2 / sum2;
        desired2 = desired2.map((w,i)=> Math.max(min2[i], Math.floor(w*scale)));
        sum2 = desired2.reduce((a,b)=>a+b,0);
      } else if (sum2 < tableW2){
        let leftover = tableW2 - sum2;
        while (leftover-- > 0) desired2[1] += 1; // widen PO col
        sum2 = tableW2;
      }
      cols2.forEach((c,i)=> c.w = desired2[i]);

      // Draw header
      const drawHeader2 = ()=>{
        ensureSpace(22);
        setBorder();
        const headerH = 22;
        doc.setFillColor(headerFill.r, headerFill.g, headerFill.b);
        doc.rect(margin, y, tableW2, headerH, 'F');
        let xx = margin;
        cols2.forEach(c=>{
          doc.rect(xx, y, c.w, headerH, 'S');
          doc.text(c.label, c.align==='left' ? xx+padX : xx + c.w/2, y + 14, { align: c.align==='left'?'left':'center' });
          xx += c.w;
        });
        y += headerH;
      };
      drawHeader2();

      // Draw rows
      rows2.forEach((r)=>{
        if (r._group){
          const text = `${r.division} — Total: ${r.total}`;
          const h = 18;
          ensureSpace(h);
          doc.setFillColor(stripeFill.r, stripeFill.g, stripeFill.b);
          doc.rect(margin, y, tableW2, h, 'F');
          setBorder(); doc.rect(margin, y, tableW2, h, 'S');
          doc.setFont('helvetica','bold'); doc.setFontSize(fontBody);
          doc.text(text, margin + padX, y + 12);
          y += h;
        } else {
          doc.setFont('helvetica','normal'); doc.setFontSize(fontBody);
          const h = 18;
          ensureSpace(h);
          let xx = margin;
          setBorder();
          cols2.forEach((c)=>{
            const raw = String(r[c.key] ?? '');
            doc.rect(xx, y, c.w, h, 'S');
            if (c.align === 'left'){
              doc.text(raw, xx + padX, y + 12);
            } else {
              doc.text(raw, xx + c.w/2, y + 12, { align:'center' });
            }
            xx += c.w;
          });
          y += h;
        }
      });
    }

    // Footer: page numbers + date on every page
    const pages = doc.getNumberOfPages();
    for (let i=1; i<=pages; i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      const stamp = (mode==='single' && singleDMY) ? singleDMY :
                    (mode==='range' && rangeStartDMY && rangeEndDMY) ? `${rangeStartDMY}–${rangeEndDMY}` :
                    todayDMY;
      doc.text(`Generated on ${stamp}`, pageW - margin, pageH - 12, { align:'right' });
      doc.text(`Page ${i} / ${pages}`, margin, pageH - 12, { align:'left' });
    }

    const outStamp = new Date().toISOString().slice(0,10);
    const suffix = (mode==='single' && opts.reportDate)
      ? `_Date-${opts.reportDate}`
      : (mode==='range' && opts.startDate && opts.endDate) ? `_Range-${opts.startDate}_to_${opts.endDate}` : '';
    doc.save(`NKR_POS_Deployment_Report_${outStamp}${suffix}.pdf`);
  }

  _pdfSimple(title){
    if (!window.jspdf?.jsPDF) { alert("PDF library not loaded. Please refresh."); return; }
    const { jsPDF } = window.jspdf; const doc=new jsPDF();
    doc.setFontSize(20); doc.text(title,20,30);
    doc.setFontSize(12); doc.text(`Generated on: ${new Date().toLocaleDateString()}`,20,45);
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
    const header=['Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type','NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.','CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE','NUMBER OF POS TO BE DEPLOYED','TYPE OF POS TERMINAL','Date of receipt of device','No of devices received','Serial No','Installation status','Functionality / Working status of POS machines','Issues if any'];
    const sample=[1,'Sample Division','Sample Post Office','SAMPLE001','Head Post Office','Contact Person','9876543210','9876543211','contact@postoffice.gov.in','Sample Address','Sample Location','Sample City','Sample State','123456',5,'EZETAP ANDROID X990','',0,'','Pending','Not Tested','None'];
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,sample]); XLSX.utils.book_append_sheet(wb,ws,"POS Template"); XLSX.writeFile(wb,"POS_Deployment_Template.xlsx");
  }

  // Backward compatible: if called with no opts, exports ALL data (unchanged behavior).
  // If called with { reportMode:'single', reportDate:'YYYY-MM-DD' } or { reportMode:'range', startDate:'YYYY-MM-DD', endDate:'YYYY-MM-DD' }
  // it filters rows by dateOfReceiptOfDevice accordingly.
  exportCurrentData(opts){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const header=['Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type','NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.','CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE','NUMBER OF POS TO BE DEPLOYED','TYPE OF POS TERMINAL','Date of receipt of device','No of devices received','Serial No','Installation status','Functionality / Working status of POS machines','Issues if any'];

    const parseYMD = (ymd)=> { const d=new Date(ymd+"T00:00:00"); return isNaN(d)? null : d; };
    const parseAnyToYMDDate = (v)=>{
      if (!v) return null;
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseYMD(s);
      let dd,mm,yy;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ [dd,mm,yy]=s.split("/"); return parseYMD(`${yy}-${mm}-${dd}`); }
      if (/^\d{2}-\d{2}-\d{4}$/.test(s)){ [dd,mm,yy]=s.split("-"); return parseYMD(`${yy}-${mm}-${dd}`); }
      const d=new Date(s); return isNaN(d)? null: new Date(d.getFullYear(),d.getMonth(),d.getDate());
    };
    const inRange = (val, sYMD, eYMD)=>{
      if (!sYMD && !eYMD) return true;
      const d = parseAnyToYMDDate(val);
      if (!d) return false;
      const s = sYMD ? parseYMD(sYMD) : null;
      const e = eYMD ? parseYMD(eYMD) : null;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    };
    const sameDay = (val, ymd)=>{
      if (!ymd) return true;
      const d = parseAnyToYMDDate(val);
      const s = parseYMD(ymd);
      if (!d || !s) return false;
      return d.getTime() === s.getTime();
    };

    let rowsSrc = this.locations;
    if (opts && opts.reportMode === 'single' && opts.reportDate){
      rowsSrc = rowsSrc.filter(l => sameDay(l.dateOfReceiptOfDevice, opts.reportDate));
    } else if (opts && opts.reportMode === 'range' && opts.startDate && opts.endDate){
      rowsSrc = rowsSrc.filter(l => inRange(l.dateOfReceiptOfDevice, opts.startDate, opts.endDate));
    }

    const rows=rowsSrc.map(l=>[
      l.slNo||'',l.division||'',l.postOfficeName||'',l.postOfficeId||'',l.officeType||'',
      l.contactPersonName||'',l.contactPersonNo||'',l.altContactNo||'',l.contactEmail||'',
      l.locationAddress||'',l.location||'',l.city||'',l.state||'',l.pincode||'',
      l.numberOfPosToBeDeployed||'',l.typeOfPosTerminal||'',l.dateOfReceiptOfDevice||'',
      l.noOfDevicesReceived||'',l.serialNo||'',l.installationStatus||'',l.functionalityStatus||'',l.issuesIfAny||''
    ]);

    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,...rows]); XLSX.utils.book_append_sheet(wb,ws,"POS Data");
    const suffix = (opts && opts.reportMode==='single' && opts.reportDate)
      ? `_Date-${opts.reportDate}`
      : (opts && opts.reportMode==='range' && opts.startDate && opts.endDate)
        ? `_Range-${opts.startDate}_to_${opts.endDate}`
        : '';
    XLSX.writeFile(wb,`POS_Data_Export_${new Date().toISOString().slice(0,10)}${suffix}.xlsx`);
  }

  // Optional helper: shows a small dialog to export Excel by single date / range (no impact if unused)
  exportDataWithDialog(){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const id = "excel-export-overlay";
    if (document.getElementById(id)) return;
    const todayYMD = new Date().toISOString().slice(0,10);
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2000;display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:18px 20px;width:420px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          <h3 style="margin:0 0 10px;font-size:16px;color:#2c3e50;">Export Data (Excel)</h3>

          <div style="margin:6px 0 6px;font-size:13px;color:#34495e;"><strong>Period</strong></div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <input type="radio" name="xl-period" value="all" checked> All data
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <input type="radio" name="xl-period" value="single"> Single date:
              <input id="xl-date" type="date" value="${todayYMD}" style="flex:1;min-width:160px;padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <input type="radio" name="xl-period" value="range"> Date range:
              <input id="xl-start" type="date" value="${todayYMD}" style="padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
              <span style="opacity:.7">to</span>
              <input id="xl-end" type="date" value="${todayYMD}" style="padding:6px 8px;border:1px solid #dfe4ea;border-radius:6px;">
            </label>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
            <button id="xl-cancel" class="btn btn-sm btn-secondary" style="padding:8px 14px;">Cancel</button>
            <button id="xl-generate" class="btn btn-sm btn-primary" style="padding:8px 14px;">Export</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const sync = () => {
      const v = overlay.querySelector('input[name="xl-period"]:checked')?.value;
      overlay.querySelector('#xl-date').disabled  = (v!=='single');
      overlay.querySelector('#xl-start').disabled = (v!=='range');
      overlay.querySelector('#xl-end').disabled   = (v!=='range');
    };
    overlay.querySelectorAll('input[name="xl-period"]').forEach(r=> r.addEventListener('change', sync));
    sync();

    overlay.querySelector("#xl-cancel").onclick = ()=> overlay.remove();
    overlay.querySelector("#xl-generate").onclick = ()=>{
      const v = overlay.querySelector('input[name="xl-period"]:checked')?.value || 'all';
      const date  = overlay.querySelector('#xl-date')?.value || "";
      const start = overlay.querySelector('#xl-start')?.value || "";
      const end   = overlay.querySelector('#xl-end')?.value || "";
      overlay.remove();
      if (v==='single') this.exportCurrentData({ reportMode:'single', reportDate:date });
      else if (v==='range') this.exportCurrentData({ reportMode:'range', startDate:start, endDate:end });
      else this.exportCurrentData();
    };
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
    let html=`<div class="alert alert-success"><strong>✅ Ready to import ${this.importData.length} locations</strong></div>
      <div style="max-height:300px;overflow-y:auto;">
      <table class="data-table"><thead><tr><th>Post Office</th><th>Division</th><th>City</th><th>Status</th></tr></thead><tbody>`;
    this.importData.slice(0,10).forEach(l=>{ html+=`<tr><td>${l.postOfficeName}</td><td>${l.division}</td><td>${l.city}</td><td>${l.installationStatus}</td></tr>`; });
    html+=`</tbody></table></div>`; if (this.importData.length>10) html+=`<p><em>Showing first 10 of ${this.importData.length} locations</em></p>`;
    el.innerHTML=html; document.getElementById("importPreview").classList.remove("hidden");
  }
  confirmImport(){
    if (!confirm(`This will replace all existing data with ${this.importData.length} uploaded rows. Continue?`)) return;
    this.locations=[...this.importData];
    const maxId=this.locations.reduce((m,l)=>Math.max(m,l.id||0),0); this.nextLocationId=maxId+1;
    this.saveToStorage(); this.closeImportModal(); this.updateDashboard(); alert(`Imported ${this.importData.length} locations!`); this.importData=[];
  }
  cancelImport(){ this.importData=[]; document.getElementById("importPreview").classList.add("hidden"); }

  createBackup(){
    const payload={ locations:this.locations, nextLocationId:this.nextLocationId, backupDate:new Date().toISOString(), version:"1.0" };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`POS_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  restoreBackup(){ document.getElementById("backupFileInput").click(); }
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

window.tracker = new AdvancedPOSTracker();
