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

    // Admins who can upload documents in Office-wise "Documents" column
    this.adminUsers = ["KARNA", "NKR", "SBI_DOP"];
  }

  async init() {
    this.loadFromStorage();
    if (this.locations.length === 0) {
      // seed from JSON on first run
      try {
        const resp = await fetch("data/sample-data.json", { cache: "no-store" });
        if (resp.ok) {
          const seed = await resp.json();
          if (Array.isArray(seed) && seed.length) {
            this.locations = seed.map((loc, i) => ({
              ...loc,
              id: i + 1,
              slNo: i + 1,
              attachments: loc.attachments || []
            }));
            this.nextLocationId = this.locations.length + 1;
            this.saveToStorage();
          }
        }
      } catch (e) {
        console.warn("Seed load skipped:", e);
      }
    }
    this.checkLoginStatus();
    this._inited = true;
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
    document.getElementById("loginScreen")?.classList.remove("hidden");
    document.getElementById("mainApp")?.classList.add("hidden");
  }
  showMainApp() {
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("mainApp")?.classList.remove("hidden");
    const cu = document.getElementById("currentUser");
    if (cu) cu.textContent = this.currentUser || "User";
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
      // sync active tab button without relying on global 'event'
      document.querySelectorAll(".nav-tab").forEach(btn => {
        if (btn.getAttribute("onclick")?.includes(`'${tabName}'`)) btn.classList.add("active");
      });
    }
    switch (tabName) {
      case "dashboard": this.updateDashboard(); break;
      case "locations": this.displayLocations(); this.updateFilters(); break;
      case "progress": this.displayProgress(); this.updateProgressFilters(); break;
      case "reports": this.generateReports(); break;
      case "office-details": this.renderOfficeDetails(); break;
      case "data-management": this.updateDataStatistics && this.updateDataStatistics(); break;
    }
  }

  // ---- storage ----
  saveToStorage() {
    const data = {
      locations: this.locations,
      nextLocationId: this.nextLocationId,
      lastSaved: new Date().toISOString()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }
  loadFromStorage() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this.locations = (data.locations || []).map(l => ({ attachments: [], ...l }));
      this.nextLocationId = data.nextLocationId || 1;
    } catch { /* ignore */ }
  }

  // ---- dashboard ----
  updateDashboard() { this.updateOverallStats(); this.updateDivisionStats(); this.updateRecentActivity(); }
  updateOverallStats() {
    const totalLocations = this.locations.length;
    const totalDevicesDeployed = this.locations.reduce((sum, l) => sum + (parseInt(l.noOfDevicesReceived) || 0), 0);
    const pending = this.locations.filter(l => l.installationStatus === "Pending").length;
    const withIssues = this.locations.filter(l => {
      const t = (l.issuesIfAny || "").toString().trim().toLowerCase();
      return t && t !== "none";
    }).length;
    document.getElementById("overallStats").innerHTML = `
      <div class="stat-card"><div class="stat-number">${totalLocations}</div><div class="stat-label">Total Locations</div></div>
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
      const t = (l.issuesIfAny || "").toString().trim().toLowerCase();
      if (t && t !== "none") agg[l.division].issues++;
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

  // ---- Office list cards (legacy "locations") ----
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
    const divisions=[...new Set(this.locations.map(l=>l.division))].filter(Boolean).sort();
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

  // ---- Progress ----
  displayProgress(){ this.renderLocationsList(this.locations,"progressList"); }
  updateProgressFilters(){
    const divisions=[...new Set(this.locations.map(l=>l.division))].filter(Boolean).sort();
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

  // ---- Office-wise details (table with inline filters & attachments) ----
  buildOfficeColumns(){
    return [
      { key:'slNo', label:'Sl.No.', align:'center' },
      { key:'division', label:'Division', align:'left' },
      { key:'postOfficeName', label:'POST OFFICE NAME', align:'left' },
      { key:'postOfficeId', label:'Post Office ID', align:'center' },
      { key:'officeType', label:'Office Type', align:'center' },
      { key:'contactPersonName', label:'Contact Person', align:'left' },
      { key:'contactPersonNo', label:'Contact No', align:'center' },
      { key:'altContactNo', label:'Alt Contact No', align:'center' },
      { key:'contactEmail', label:'Contact Email', align:'left' },
      { key:'locationAddress', label:'Location Address', align:'left' },
      { key:'location', label:'Location', align:'left' },
      { key:'city', label:'CITY', align:'left' },
      { key:'state', label:'STATE', align:'left' },
      { key:'pincode', label:'PINCODE', align:'center' },
      { key:'numberOfPosToBeDeployed', label:'POS Required', align:'center' },
      { key:'typeOfPosTerminal', label:'Type of POS', align:'center' },
      { key:'dateOfReceiptOfDevice', label:'Date of Receipt', align:'center' },
      { key:'noOfDevicesReceived', label:'Devices Received', align:'center' },
      { key:'serialNo', label:'Serial No', align:'center' },
      { key:'mid', label:'MID', align:'center' },
      { key:'tid', label:'TID', align:'center' },
      { key:'installationStatus', label:'Installation Status', align:'center', filter:'select' },
      { key:'functionalityStatus', label:'Functionality Status', align:'center', filter:'select' },
      { key:'issuesIfAny', label:'Issues (if any)', align:'left' },
      { key:'attachments', label:'Documents', align:'center', isAttachment:true },
    ];
  }
  renderOfficeDetails(){
    const head = document.getElementById("officeDetailsHead");
    const filterRow = document.getElementById("officeDetailsFilterRow");
    const body = document.getElementById("officeDetailsBody");
    if (!head || !filterRow || !body) return;

    const cols = this.buildOfficeColumns();

    // Header
    head.innerHTML = cols.map(c => `<th class="${c.align==='left'?'left':''}">${c.label}</th>`).join("");

    // Inline filters
    const uniq = a => Array.from(new Set(a.filter(Boolean)));
    const statuses = uniq(this.locations.map(x=>x.installationStatus)).sort();
    const funcs = uniq(this.locations.map(x=>x.functionalityStatus)).sort();

    filterRow.innerHTML = cols.map(c=>{
      if (c.key==='slNo' || c.isAttachment) return `<th></th>`;
      if (c.filter==='select'){
        const opts = (c.key==='installationStatus'?statuses:funcs)
          .map(v=>`<option value="${v}">${v}</option>`).join("");
        return `<th><select data-key="${c.key}"><option value="">All</option>${opts}</select></th>`;
      }
      return `<th><input type="text" placeholder="Filter…" data-key="${c.key}"></th>`;
    }).join("");

    filterRow.querySelectorAll("input,select").forEach(el=>{
      el.addEventListener("input", ()=> this.filterOfficeDetails());
      el.addEventListener("change", ()=> this.filterOfficeDetails());
    });

    this._paintOfficeRows(cols);
    this._autoFitOfficeColumns();
    window.addEventListener("resize", this._autoFitOfficeColumns.bind(this));
  }
  filterOfficeDetails(){
    const cols = this.buildOfficeColumns();
    this._paintOfficeRows(cols);
    this._autoFitOfficeColumns();
  }
  _paintOfficeRows(cols){
    const body = document.getElementById("officeDetailsBody");
    if (!body) return;

    // Active filters
    const filters = {};
    document.querySelectorAll("#officeDetailsFilterRow [data-key]").forEach(el=>{
      const k = el.getAttribute("data-key");
      const v = (el.value || "").trim().toLowerCase();
      if (v) filters[k] = v;
    });

    // Filter + keep "RMS HB Division" last
    const rows = (this.locations||[]).filter(l=>{
      for (const [k,v] of Object.entries(filters)){
        const raw = (l[k] ?? "").toString().toLowerCase();
        if (!raw.includes(v)) return false;
      }
      return true;
    }).sort((a,b)=>{
      const ad=a.division||"", bd=b.division||"";
      if (ad==="RMS HB Division" && bd!=="RMS HB Division") return 1;
      if (bd==="RMS HB Division" && ad!=="RMS HB Division") return -1;
      const d = ad.localeCompare(bd);
      return d!==0 ? d : (a.postOfficeName||"").localeCompare(b.postOfficeName||"");
    });

    if (!rows.length){
      body.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:14px;">No matching records</td></tr>`;
      return;
    }

    const isAdmin = this.isAdmin();

    body.innerHTML = rows.map((l, i)=>{
      const tds = cols.map(c=>{
        if (c.isAttachment){
          const cnt = (l.attachments?.length || 0);
          const viewBtn = `<button class="btn btn-sm btn-info" onclick="tracker.showDocs(${l.id})">View ${cnt?`(${cnt})`:''}</button>`;
          const upBtn = isAdmin ? `<button class="btn btn-sm btn-secondary" onclick="tracker.triggerDocsUpload(${l.id})">Upload</button>` : "";
          return `<td>${viewBtn}${isAdmin?` ${upBtn}`:""}</td>`;
        }
        const raw = (c.key==='slNo') ? (i+1) : (l[c.key] ?? "");
        const val = (raw===null || raw===undefined) ? "" : raw;
        const blank = (String(val).trim()==="");
        const cls = `${c.align==='left'?'left':''} ${blank?'cell-blank':''}`;
        return `<td class="${cls}">${val}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
  }
  // Auto-fit widths by measuring header & cell text
  _autoFitOfficeColumns(){
    const table = document.getElementById("officeDetailsTable");
    if (!table) return;
    const ths = Array.from(table.querySelectorAll("thead tr:first-child th"));
    const rows = Array.from(table.tBodies[0]?.rows || []);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "14px 'Segoe UI', Tahoma, sans-serif";

    ths.forEach((th, idx) => {
      let max = ctx.measureText((th.textContent || "").trim()).width;
      rows.forEach(tr => {
        const cell = tr.cells[idx];
        if (!cell) return;
        const text = (cell.textContent || "").trim();
        max = Math.max(max, ctx.measureText(text).width);
      });
      const padding = 28; // left + right
      const px = Math.ceil(max) + padding;
      [th, ...rows.map(r=>r.cells[idx])].forEach(el=>{
        if (el){ el.style.minWidth = px + "px"; el.style.width = px + "px"; }
      });
    });
  }
  isAdmin(){ return this.adminUsers.includes(this.currentUser); }
  triggerDocsUpload(id){
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/pdf"; inp.multiple = true;
    inp.onchange = (e)=> this.handleDocsUpload(id, e.target.files);
    inp.click();
  }
  handleDocsUpload(id, files){
    const loc = this.locations.find(x=>x.id===id); if (!loc) return;
    loc.attachments ||= [];
    const readers = Array.from(files || []).slice(0,10).map(f => new Promise(res=>{
      const r = new FileReader();
      r.onload = ()=> res({ name:f.name, dataUrl:r.result, uploadedAt:new Date().toISOString() });
      r.readAsDataURL(f);
    }));
    Promise.all(readers).then(list=>{
      loc.attachments.push(...list);
      this.saveToStorage();
      this.renderOfficeDetails(); // refresh
    });
  }
  showDocs(id){
    const loc = this.locations.find(x=>x.id===id); if (!loc) return;
    const items = (loc.attachments||[]);
    let html = `<div class="modal" id="docsModal" style="display:block"><div class="modal-content">
      <span class="close" onclick="document.getElementById('docsModal').remove()">×</span>
      <h3 style="margin-bottom:10px">Documents for: ${loc.postOfficeName || ''}</h3>`;
    if (!items.length){
      html += `<p>No documents uploaded yet.</p>`;
    } else {
      html += `<ul style="list-style:none;padding-left:0;display:grid;gap:10px">`;
      items.forEach((a,i)=>{
        html += `<li style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <span>📄 ${a.name}</span>
          <span>
            <a class="btn btn-sm btn-info" href="${a.dataUrl}" target="_blank" rel="noopener">View</a>
            ${ this.isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="tracker.removeDoc(${id},${i})">Remove</button>` : "" }
          </span>
        </li>`;
      });
      html += `</ul>`;
    }
    html += `</div></div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  }
  removeDoc(id, idx){
    const loc = this.locations.find(x=>x.id===id); if (!loc) return;
    if (!confirm("Remove this document?")) return;
    (loc.attachments||[]).splice(idx,1);
    this.saveToStorage();
    document.getElementById('docsModal')?.remove();
    this.renderOfficeDetails();
  }

  // ---- reports (onscreen) ----
  generateReports(){
    const host = document.getElementById("reportsContent");
    if (!host) return;

    const rows = this.locations || [];
    if (!rows.length){
      host.innerHTML = `<div class="alert alert-info">No data available.</div>`;
      return;
    }

    // Region Summary
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

    // Division-wise Detailed Report
    const byDiv = {};
    rows.forEach(r => {
      const d = r.division || "—";
      (byDiv[d] ||= []).push(r);
    });
    const hasIssue = (v)=>{
      const s = (v ?? "").toString().trim().toLowerCase();
      return s && s !== "none";
    };

    // Sort alpha; "RMS HB Division" last
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

    // Totals row
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
            <th>Issues</th>
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

    // ⚠️ Locations with Issues
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

  // ---- PDF ----
  exportDashboardPDF(){ this._pdfSimple("POS Deployment Dashboard Summary"); }
  exportProgressPDF(){ this._pdfSimple("POS Deployment Progress Report"); }

  // Professional Reports PDF (orientation chooser, DD/MM/YYYY, centered cells, uniform header fill, auto-fit widths)
  exportReportsPDF(opts){
    if (!window.jspdf?.jsPDF) { alert("PDF library not loaded. Please refresh."); return; }
    const { jsPDF } = window.jspdf;

    // Orientation chooser
    if (!opts || !opts.orientation){
      const id = "pdf-orient-overlay";
      if (document.getElementById(id)) return; // already open
      const overlay = document.createElement("div");
      overlay.id = id;
      overlay.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2000;display:flex;align-items:center;justify-content:center;">
          <div style="background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:20px 22px;width:340px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#2c3e50;">Export Reports PDF</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#34495e;">Choose orientation:</p>
            <div style="display:flex;gap:12px;margin:0 0 16px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="radio" name="pdf-orient" value="portrait"> Portrait
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="radio" name="pdf-orient" value="landscape" checked> Landscape
              </label>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
              <button id="pdf-orient-cancel" class="btn btn-sm btn-secondary" style="padding:8px 14px;">Cancel</button>
              <button id="pdf-orient-generate" class="btn btn-sm btn-primary" style="padding:8px 14px;">Generate</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#pdf-orient-cancel").onclick = ()=> overlay.remove();
      overlay.querySelector("#pdf-orient-generate").onclick = ()=>{
        const sel = overlay.querySelector('input[name="pdf-orient"]:checked')?.value || "landscape";
        overlay.remove();
        this.exportReportsPDF({ orientation: sel });
      };
      return;
    }

    // Helpers
    const orientation = opts.orientation === "portrait" ? "portrait" : "landscape";
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

    const rows = this.locations || [];
    const today = new Date();
    const reportDateStr = formatDMY(today);

    // Aggregates
    const totalOffices = rows.length;
    const totalDevicesRequired = rows.reduce((s,l)=> s + toInt(l.numberOfPosToBeDeployed), 0);
    const totalDevicesReceived = rows.reduce((s,l)=> s + toInt(l.noOfDevicesReceived), 0);
    const devicesInstalledRegion = rows.filter(r => (r.installationStatus||"").trim() === "Completed").length;
    const devicesReceivedToday = rows.reduce((s,l)=> {
      return s + (normalizeToDMY(l.dateOfReceiptOfDevice) === reportDateStr ? toInt(l.noOfDevicesReceived) : 0);
    }, 0);

    // Group by division (RMS HB Division last)
    const byDiv = {};
    rows.forEach(r=>{
      const d = r.division || "—";
      (byDiv[d] ||= []).push(r);
    });
    const entries = Object.entries(byDiv).sort(([a],[b])=>{
      if (a === "RMS HB Division" && b !== "RMS HB Division") return 1;
      if (b === "RMS HB Division" && a !== "RMS HB Division") return -1;
      return a.localeCompare(b);
    });

    // Division table rows
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

    // PDF doc setup
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 32;
    let y = margin;

    // Styles
    const headerFill = { r: 246, g: 248, b: 252 };  // light header
    const stripeFill = { r: 252, g: 253, b: 255 };  // zebra
    const borderGray = 180;
    const brandBlue = { r: 52, g: 152, b: 219 };

    const fontTitle = 15;
    const fontSub   = 11;
    const fontHead  = 9.5;
    const fontBody  = 9;
    const lineH     = 11;
    const padX      = 6;

    // Columns (labels + alignment)
    const tableCols = [
      { key:'division', label:'Division', align:'left'  },
      { key:'offices',  label:'Offices', align:'center'},
      { key:'req',      label:'Devices Required', align:'center'},
      { key:'rec',      label:'Devices Received', align:'center'},
      { key:'pend',     label:'Pending', align:'center'},
      { key:'inst',     label:'Devices Installed', align:'center'},
      { key:'pinst',    label:'Pending Installation', align:'center'},
      { key:'iss',      label:'Issues', align:'center'},
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

    function setBorder(){ doc.setDrawColor(borderGray); doc.setLineWidth(0.4); }
    function ensureSpace(h){ if (y + h > pageH - margin) { newPage(); } }
    function newPage(){ doc.addPage(); y = margin; drawHeader(); }
    function centerBlockY(rowTop, rowH, lines){
      const contentH = Math.max(lineH, lines.length * lineH);
      return rowTop + (rowH - contentH)/2 + lineH*0.85;
    }

    function drawHeader(){
      doc.setFont('helvetica','bold'); doc.setFontSize(fontTitle);
      doc.setTextColor(brandBlue.r, brandBlue.g, brandBlue.b);
      doc.text('North Karnataka Region', margin, y); y += 18;

      doc.setTextColor(0,0,0);
      doc.setFont('helvetica','normal'); doc.setFontSize(fontSub);
      doc.text('SBI-DOP POS Machines Deployment status', margin, y); y += 14;
      doc.text(`Report for the date: ${reportDateStr}`, margin, y); y += 8;

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
      ['Devices received today', String(devicesReceivedToday)]
    ];
    const colGap = 260;
    const valOffset = 190;

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

    // Auto-fit widths and draw table
    computeAutoWidths();

    function drawTableHeader(){
      ensureSpace(24);
      setBorder();
      doc.setFont('helvetica','bold'); doc.setFontSize(fontHead);

      // header height from wrapped labels
      const headerHeights = tableCols.map(c => {
        const lines = doc.splitTextToSize(c.label, c.w - padX*2);
        return Math.max(18, lines.length * lineH + 6);
      });
      const headerH = Math.max(...headerHeights);

      // full-width light background
      doc.setFillColor(headerFill.r, headerFill.g, headerFill.b);
      const totalW = tableCols.reduce((s,c)=>s+c.w,0);
      doc.rect(tableX, y, totalW, headerH, 'F');

      // per-cell borders + text
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

    function drawRow(obj, stripe=false, bold=false){
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(fontBody);
      const cells = tableCols.map(col=>{
        const raw = col.key === 'pct' ? `${obj[col.key]}%` : String(obj[col.key] ?? '');
        const lines = doc.splitTextToSize(raw, col.w - padX*2);
        const h = Math.max(16, lines.length * lineH + 6);
        return { col, lines, h };
      });
      const rowH = Math.max(...cells.map(c => c.h));
      ensureSpace(rowH);

      if (stripe){
        doc.setFillColor(stripeFill.r, stripeFill.g, stripeFill.b);
        const totalW = tableCols.reduce((s,c)=>s+c.w,0);
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

    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Division-wise Detailed Report', margin, y); y += 8;
    drawTableHeader();

    divisions.forEach((r, idx) => {
      if (y > pageH - margin - 30){ newPage(); drawTableHeader(); }
      drawRow(r, idx % 2 === 1);
    });
    if (y > pageH - margin - 30){ newPage(); drawTableHeader(); }
    drawRow(totalsRow, false, true);

    // Footer: page numbers + date
    const pages = doc.getNumberOfPages();
    for (let i=1; i<=pages; i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(`Generated on ${reportDateStr}`, pageW - margin, pageH - 12, { align:'right' });
      doc.text(`Page ${i} / ${pages}`, margin, pageH - 12, { align:'left' });
    }

    const stamp = new Date().toISOString().slice(0,10);
    doc.save(`NKR_POS_Deployment_Report_${stamp}.pdf`);
  }

  _pdfSimple(title){
    if (!window.jspdf?.jsPDF) { alert("PDF library not loaded. Please refresh."); return; }
    const { jsPDF } = window.jspdf; const doc=new jsPDF();
    doc.setFontSize(20); doc.text(title,20,30);
    doc.setFontSize(12); doc.text(`Generated on: ${new Date().toLocaleDateString("en-GB")}`,20,45);
    doc.text(`Generated by: ${this.currentUser||"User"}`,20,55);
    doc.save(`${title.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.pdf`);
  }

  printReports(){ window.print(); }

  // ---- CRUD ----
  showLocationForm(){
    this.currentLocationId=null;
    document.getElementById("modalTitle").textContent="Add New Location";
    document.getElementById("locationForm").reset();
    document.getElementById("locationModal").style.display="block";
  }
  closeLocationModal(){ document.getElementById("locationModal").style.display="none"; }

  saveLocation(event){
    event.preventDefault();
    const d=id=>document.getElementById(id)?.value || "";

    // Duplicate Serial No check
    const enteredSerial = (d("serialNo") || "").trim();
    if (enteredSerial){
      const dup = this.locations.some(l =>
        (l.serialNo || "").trim().toLowerCase() === enteredSerial.toLowerCase() &&
        (!this.currentLocationId || l.id !== this.currentLocationId)
      );
      if (dup){
        alert("Duplicate Serial No detected. Please enter a unique Serial No.");
        const el = document.getElementById("serialNo");
        if (el) { el.focus(); el.style.borderColor = "#e74c3c"; setTimeout(()=> el.style.borderColor="", 2000); }
        return;
      }
    }

    const locationData = {
      division: d("division"),
      postOfficeName: d("postOfficeName"),
      postOfficeId: d("postOfficeId"),
      officeType: d("officeType"),
      contactPersonName: d("contactPersonName"),
      contactPersonNo: d("contactPersonNo"),
      city: d("city"),
      state: d("state"),
      pincode: d("pincode"),
      numberOfPosToBeDeployed: parseInt(d("numberOfPosToBeDeployed"))||0,
      dateOfReceiptOfDevice: d("dateOfReceiptOfDevice"),
      noOfDevicesReceived: parseInt(d("noOfDevicesReceived"))||0,
      installationStatus: d("installationStatus"),
      functionalityStatus: d("functionalityStatus"),
      issuesIfAny: (document.getElementById("issuesIfAny")?.value || "None"),
      // NEW fields
      typeOfPosTerminal: d("typeOfPosTerminal") || "EZETAP ANDROID X990",
      serialNo: enteredSerial,
      mid: d("mid"),
      tid: d("tid"),
      // preserve existing attachments on edit
      attachments: this.currentLocationId ? (this.locations.find(x=>x.id===this.currentLocationId)?.attachments || []) : []
    };

    if (this.currentLocationId){
      const i=this.locations.findIndex(l=>l.id===this.currentLocationId);
      if (i>-1) this.locations[i] = { ...this.locations[i], ...locationData };
    } else {
      locationData.id=this.nextLocationId++;
      locationData.slNo=this.locations.length+1;
      this.locations.push(locationData);
    }
    this.saveToStorage();
    this.closeLocationModal();
    this.updateDashboard();
    alert("Location saved successfully!");
  }

  editLocation(id){
    this.currentLocationId=id; const l=this.locations.find(x=>x.id===id);
    if (!l) return;
    document.getElementById("modalTitle").textContent="Edit Location";
    [
      "division","postOfficeName","postOfficeId","officeType","contactPersonName",
      "contactPersonNo","city","state","pincode","numberOfPosToBeDeployed",
      "dateOfReceiptOfDevice","noOfDevicesReceived","installationStatus","functionalityStatus",
      "issuesIfAny","typeOfPosTerminal","serialNo","mid","tid"
    ].forEach(k=>{
      const el=document.getElementById(k); if (el) el.value = l[k] ?? "";
    });
    document.getElementById("locationModal").style.display="block";
  }
  deleteLocation(id){
    if (!confirm("Delete this Post Office?")) return;
    this.locations=this.locations.filter(l=>l.id!==id);
    this.locations.forEach((l,i)=> l.slNo=i+1);
    this.saveToStorage(); this.displayLocations(); this.updateDashboard();
    alert("Post Office deleted successfully!");
  }

  // ---- Excel import/export ---- (updated to include MID/TID)
  downloadTemplate(){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const header=[
      'Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type',
      'NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.',
      'CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE',
      'NUMBER OF POS TO BE DEPLOYED','TYPE OF POS TERMINAL','Date of receipt of device',
      'No of devices received','Serial No','MID','TID','Installation status',
      'Functionality / Working status of POS machines','Issues if any'
    ];
    const sample=[1,'Sample Division','Sample Post Office','SAMPLE001','Head Post Office',
      'Contact Person','9876543210','9876543211','contact@postoffice.gov.in','Sample Address',
      'Sample Location','Sample City','Sample State','123456',5,'EZETAP ANDROID X990',
      '',0,'SER123','MID123','TID123','Pending','Not Tested','None'];
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,sample]);
    XLSX.utils.book_append_sheet(wb,ws,"POS Template"); XLSX.writeFile(wb,"POS_Deployment_Template.xlsx");
  }
  exportCurrentData(){
    if (typeof XLSX==='undefined'){ alert("Excel library not loaded."); return; }
    const header=[
      'Sl.No.','Division','POST OFFICE NAME','Post Office ID','Office Type',
      'NAME OF CONTACT PERSON AT THE LOCATION','CONTACT PERSON NO.','ALT CONTACT PERSON NO.',
      'CONTACT EMAIL ID','LOCATION ADDRESS','LOCATION','CITY','STATE','PINCODE',
      'NUMBER OF POS TO BE DEPLOYED','TYPE OF POS TERMINAL','Date of receipt of device',
      'No of devices received','Serial No','MID','TID','Installation status',
      'Functionality / Working status of POS machines','Issues if any'
    ];
    const rows=this.locations.map(l=>[
      l.slNo||'',l.division||'',l.postOfficeName||'',l.postOfficeId||'',l.officeType||'',
      l.contactPersonName||'',l.contactPersonNo||'',l.altContactNo||'',l.contactEmail||'',
      l.locationAddress||'',l.location||'',l.city||'',l.state||'',l.pincode||'',
      l.numberOfPosToBeDeployed||'',l.typeOfPosTerminal||'',l.dateOfReceiptOfDevice||'',
      l.noOfDevicesReceived||'',l.serialNo||'',l.mid||'',l.tid||'',
      l.installationStatus||'',l.functionalityStatus||'',l.issuesIfAny||''
    ]);
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
    XLSX.utils.book_append_sheet(wb,ws,"POS Data");
    XLSX.writeFile(wb,`POS_Data_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  }
  exportToExcel(){ this.exportCurrentData(); }

  showImportModal(){ document.getElementById("importModal").style.display="block"; }
  closeImportModal(){
    document.getElementById("importModal").style.display="none";
    document.getElementById("importPreview").classList.add("hidden");
    document.getElementById("excelFileInput").value="";
  }
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
        mid:r[19]||'', tid:r[20]||'',
        installationStatus:r[21]||'Pending', functionalityStatus:r[22]||'Not Tested', issuesIfAny:r[23]||'None',
        attachments:[]
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
    this.importData.slice(0,10).forEach(l=>{ html+=`<tr><td>${l.postOfficeName}</td><td>${l.division}</td><td>${l.city||''}</td><td>${l.installationStatus}</td></tr>`; });
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

  // ---- backup ----
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

  // ---- optional: simple stats filler to avoid null calls ----
  updateDataStatistics(){
    const el = document.getElementById("dataStatistics");
    if (!el) return;
    const total = this.locations.length;
    const completed = this.locations.filter(l=> (l.installationStatus||"").trim()==="Completed").length;
    el.innerHTML = `<p>Total offices: <strong>${total}</strong> &middot; Completed installations: <strong>${completed}</strong></p>`;
  }
}

window.tracker = new AdvancedPOSTracker();

// Init if not already handled elsewhere
window.addEventListener('DOMContentLoaded', () => {
  if (window.tracker && !window.tracker._inited) {
    window.tracker.init().catch(()=>{});
  }
});

/* Graceful wrappers (only if bridge.js didn't define them) */
(function(){
  const m = (name, fn) => { if (!window[name]) window[name] = fn; };
  m('showTab', (e, id)=> tracker.showTab(e, id));
  m('showLocationForm', ()=> tracker.showLocationForm());
  m('closeLocationModal', ()=> tracker.closeLocationModal());
  m('saveLocation', (ev)=> tracker.saveLocation(ev));
  m('editLocation', (id)=> tracker.editLocation(id));
  m('deleteLocation', (id)=> tracker.deleteLocation(id));
  m('filterLocations', ()=> tracker.filterLocations());
  m('filterProgress', ()=> tracker.filterProgress());
  m('filterProgressByDivision', ()=> tracker.filterProgressByDivision());
  m('downloadTemplate', ()=> tracker.downloadTemplate());
  m('exportCurrentData', ()=> tracker.exportCurrentData());
  m('exportToExcel', ()=> tracker.exportToExcel());
  m('showImportModal', ()=> tracker.showImportModal());
  m('closeImportModal', ()=> tracker.closeImportModal());
  m('handleExcelImport', (e)=> tracker.handleExcelImport(e));
  m('confirmImport', ()=> tracker.confirmImport());
  m('cancelImport', ()=> tracker.cancelImport());
  m('createBackup', ()=> tracker.createBackup());
  m('restoreBackup', ()=> tracker.restoreBackup());
  m('handleBackupRestore', (e)=> tracker.handleBackupRestore(e));
  m('clearAllData', ()=> tracker.clearAllData());
  m('printReports', ()=> tracker.printReports());
  m('exportDashboardPDF', ()=> tracker.exportDashboardPDF());
  m('exportProgressPDF', ()=> tracker.exportProgressPDF());
  m('exportReportsPDF', ()=> tracker.exportReportsPDF());
})();
