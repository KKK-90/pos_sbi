// assets/js/auth.js
// Client-side auth for static hosting (GitHub Pages). Uses salted SHA-256.
// Sessions & RBAC are enforced in-browser. For production, use a backend.

class AuthManager {
  constructor() {
    this.users = []; // {username, role, salt, hash}
    this.current = null; // {username, role}
    this.storeKeyUsers = "pos_users";
    this.storeKeySession = "pos_session";
  }

  async init() {
    // Load users from localStorage or fetch from data/users.json
    const existing = localStorage.getItem(this.storeKeyUsers);
    if (existing) {
      this.users = JSON.parse(existing);
    } else {
      try {
        const resp = await fetch("data/users.json", { cache: "no-store" });
        if (resp.ok) {
          this.users = await resp.json();
          localStorage.setItem(this.storeKeyUsers, JSON.stringify(this.users));
        }
      } catch (e) {
        console.warn("Could not load users.json", e);
      }
    }

    // Load session
    const session = localStorage.getItem(this.storeKeySession);
    if (session) {
      try {
        this.current = JSON.parse(session);
      } catch { this.current = null; }
    }

    // Show UI based on session
    if (this.current) {
      this.showMain();
    } else {
      this.showLogin();
    }

    // Render user table if superadmin page is open later
    this.renderUsersTable();
  }

  // ---- UI toggles ----
  showLogin() {
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("mainApp").classList.add("hidden");
  }

  showMain() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");
    document.getElementById("currentUser").textContent = this.current?.username || "User";
    document.getElementById("currentRole").textContent = this.current?.role || "user";
    // Apply RBAC visibility
    this.applyRBAC();
    // Let the tracker render its data views
    if (window.tracker && typeof window.tracker.updateDashboard === "function") {
      window.tracker.updateDashboard();
      window.showTab(null, "dashboard");
    }
  }

  // ---- RBAC ----
  roleRank(role) {
    return role === "superadmin" ? 3 : role === "admin" ? 2 : 1; // user=1
  }

  applyRBAC() {
    const role = this.current?.role || "user";
    const myRank = this.roleRank(role);
    document.querySelectorAll(".rbac").forEach(el => {
      const min = el.getAttribute("data-minrole") || "user";
      const minRank = this.roleRank(min);
      el.style.display = (myRank >= minRank) ? "" : "none";
    });
  }

  // ---- crypto helpers ----
  async sha256(txt) {
    const enc = new TextEncoder().encode(txt);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async verifyPassword(user, password) {
    const candidate = await this.sha256(`${user.salt}:${password}`);
    return candidate === user.hash;
  }

  findUser(username) {
    return this.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  // ---- auth actions ----
  async login(username, password) {
    const elErr = document.getElementById("loginError");
    elErr.style.display = "none";
    const user = this.findUser(username);
    if (!user) {
      elErr.textContent = "Invalid username or password.";
      elErr.style.display = "block";
      elErr.className = "alert";
      return false;
    }
    const ok = await this.verifyPassword(user, password);
    if (!ok) {
      elErr.textContent = "Invalid username or password.";
      elErr.style.display = "block";
      elErr.className = "alert";
      return false;
    }
    this.current = { username: user.username, role: user.role };
    localStorage.setItem(this.storeKeySession, JSON.stringify(this.current));
    // reuse tracker login flow to show app
    if (window.tracker && typeof window.tracker.login === "function") {
      window.tracker.login(user.username);
    } else {
      this.showMain();
    }
    return true;
  }

  logout() {
    localStorage.removeItem(this.storeKeySession);
    this.current = null;
    // If tracker has a logout, use it so it resets its UI; else just show login
    if (window.tracker && typeof window.tracker.logout === "function") {
      window.tracker.logout();
    } else {
      this.showLogin();
    }
  }

  // ---- superadmin user management (local, export/import) ----
  async saveUser({ username, role, password }) {
    if (!this.current || this.current.role !== "superadmin") {
      alert("Only Superadmin can manage users.");
      return;
    }
    if (!username || !role) { alert("Username and role are required."); return; }
    let u = this.findUser(username);
    if (!u) {
      // create
      const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");
      let hash = "";
      if (!password) { alert("Password is required for new users."); return; }
      hash = await this.sha256(`${salt}:${password}`);
      this.users.push({ username, role, salt, hash });
    } else {
      // update role / (optional) password
      u.role = role;
      if (password && password.trim().length > 0) {
        u.salt = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");
        u.hash = await this.sha256(`${u.salt}:${password}`);
      }
    }
    localStorage.setItem(this.storeKeyUsers, JSON.stringify(this.users));
    alert("User saved.");
    this.renderUsersTable();
  }

  deleteUserByName(username) {
    if (!this.current || this.current.role !== "superadmin") {
      alert("Only Superadmin can manage users.");
      return;
    }
    if (!username) { alert("Enter username to delete."); return; }
    if (username === this.current.username) { alert("You cannot delete yourself while logged in."); return; }
    const before = this.users.length;
    this.users = this.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
    if (this.users.length === before) {
      alert("User not found."); return;
    }
    localStorage.setItem(this.storeKeyUsers, JSON.stringify(this.users));
    alert("User deleted.");
    this.renderUsersTable();
  }

  exportUsersJSON() {
    const blob = new Blob([JSON.stringify(this.users, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `users_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importUsersJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error("Invalid users file.");
        this.users = arr;
        localStorage.setItem(this.storeKeyUsers, JSON.stringify(this.users));
        alert("Users imported.");
        this.renderUsersTable();
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  renderUsersTable() {
    const mount = document.getElementById("usersTable");
    if (!mount) return;
    if (!this.users.length) { mount.innerHTML = "<div class='alert alert-info'>No users found.</div>"; return; }
    let html = `<table class="data-table"><thead><tr><th>Username</th><th>Role</th><th>Salt</th><th>Hash</th></tr></thead><tbody>`;
    this.users.forEach(u => {
      html += `<tr><td>${u.username}</td><td>${u.role}</td><td>${u.salt}</td><td style="font-size:12px">${u.hash}</td></tr>`;
    });
    html += `</tbody></table>`;
    mount.innerHTML = html;
  }
}

window.auth = new AuthManager();
