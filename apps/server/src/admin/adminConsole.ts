import type { FastifyInstance } from "fastify"

const CONSOLE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

export async function registerAdminConsoleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin", async (_request, reply) => {
    return reply
      .header("Content-Security-Policy", CONSOLE_CSP)
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer")
      .type("text/html; charset=utf-8")
      .send(ADMIN_CONSOLE_HTML)
  })
  app.get("/admin/console.css", async (_request, reply) => {
    return reply
      .header("Content-Security-Policy", CONSOLE_CSP)
      .header("Cache-Control", "no-store")
      .type("text/css; charset=utf-8")
      .send(ADMIN_CONSOLE_CSS)
  })
  app.get("/admin/console.js", async (_request, reply) => {
    return reply
      .header("Content-Security-Policy", CONSOLE_CSP)
      .header("Cache-Control", "no-store")
      .type("application/javascript; charset=utf-8")
      .send(ADMIN_CONSOLE_JS)
  })
}

const ADMIN_CONSOLE_HTML = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Blumi · Kullanıcı yönetimi</title>
  <link rel="stylesheet" href="/admin/console.css">
  <script src="/admin/console.js" defer></script>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/admin" aria-label="Blumi yönetim merkezi">
        <span class="brand-mark" aria-hidden="true">b</span>
        <span>blumi <small>OPERASYON</small></span>
      </a>
      <div id="session" class="session" hidden>
        <span id="operator"></span>
        <button id="logout" class="button button-quiet" type="button">Çıkış</button>
      </div>
    </header>

    <section id="login" class="login card" aria-labelledby="login-title">
      <div class="eyebrow">YETKİLİ ERİŞİM</div>
      <h1 id="login-title">Kullanıcı yönetimi</h1>
      <p class="muted">Devam etmek için kısa ömürlü yönetici token’ını gir. Token yalnızca bu sekmenin belleğinde tutulur; tarayıcıya kaydedilmez.</p>
      <form id="login-form" class="login-form">
        <label for="token">Yönetici token’ı</label>
        <input id="token" name="token" type="password" autocomplete="off" spellcheck="false" required>
        <button class="button button-primary" type="submit">Güvenli bağlan</button>
      </form>
      <details>
        <summary>Token’ı nasıl alacağım?</summary>
        <p>Sunucuda admin imzalama anahtarı tanımlı olmalı. Terminalden en fazla 10 dakikalık, yalnızca gerekli izinlere sahip token üret:</p>
        <code>npm run admin:mint-token --workspace @blumi/server -- --subject=eren-aksu --scopes=users:read,users:manage --ttl=600</code>
        <p class="warning">Token’ı kimseyle paylaşma. Canlı ortamda paneli yalnızca HTTPS ve güvenli bir admin erişim katmanı arkasından kullan.</p>
      </details>
    </section>

    <section id="workspace" hidden>
      <div class="page-heading">
        <div><div class="eyebrow">DESTEK ARAÇLARI</div><h1>Kullanıcılar</h1></div>
        <span class="badge">Hassas işlemler kayıt altına alınır</span>
      </div>
      <div class="grid">
        <section class="card search-card" aria-labelledby="search-title">
          <h2 id="search-title">Kullanıcı bul</h2>
          <p class="muted">Kullanıcı kimliği, telefon veya görünen ad ile ara.</p>
          <form id="search-form" class="search-form">
            <label class="visually-hidden" for="query">Kullanıcı ara</label>
            <input id="query" name="query" type="search" minlength="2" maxlength="128" placeholder="Örn. Eren Aksu" required>
            <button class="button button-primary" type="submit">Ara</button>
          </form>
          <p id="search-message" class="status" role="status" aria-live="polite"></p>
          <ul id="results" class="results" aria-label="Arama sonuçları"></ul>
        </section>

        <section id="detail" class="card detail-card" aria-labelledby="detail-title">
          <div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h2 id="detail-title">Bir kullanıcı seç</h2><p class="muted">Hesap özeti ve günlük keşfet hakkı burada görünür.</p></div>
        </section>
      </div>
      <footer>Telefon numaraları maskelenir. Sohbet içerikleri, fotoğraflar ve özel profil alanları bu panelde gösterilmez.</footer>
    </section>
    <p id="global-message" class="global-message" role="alert" aria-live="assertive"></p>
  </main>
</body>
</html>`

const ADMIN_CONSOLE_CSS = `:root{color-scheme:light;--ink:#262438;--muted:#777588;--line:#ebe9f0;--purple:#7561d8;--soft:#f7f5fc;--green:#167957;--red:#b94758;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:#faf9fc;color:var(--ink)}button,input{font:inherit}.shell{max-width:1180px;margin:0 auto;padding:0 28px 48px}.topbar{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);margin-bottom:36px}.brand{display:flex;align-items:center;gap:11px;color:var(--ink);font-size:18px;font-weight:750;text-decoration:none;letter-spacing:-.04em}.brand small{display:block;margin-top:3px;color:var(--muted);font-size:9px;letter-spacing:.14em}.brand-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#eeeaff;color:var(--purple);font-size:25px}.session{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px}.card{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 8px 30px #30275208}.login{max-width:600px;margin:62px auto;padding:36px}.eyebrow{color:var(--purple);font-size:10px;font-weight:800;letter-spacing:.15em}h1{margin:10px 0 8px;font-size:30px;letter-spacing:-.045em}h2{margin:0 0 8px;font-size:18px;letter-spacing:-.025em}.muted{color:var(--muted);font-size:14px;line-height:1.6}.login-form{display:grid;gap:10px;margin:26px 0 22px}.login-form label,.action-form label{font-size:12px;font-weight:700}.login-form input,.search-form input,.action-form input,.action-form textarea{width:100%;padding:12px 14px;border:1px solid #dfdce8;border-radius:11px;background:#fff;color:var(--ink);outline:none}.login-form input:focus,.search-form input:focus,.action-form input:focus,.action-form textarea:focus{border-color:var(--purple);box-shadow:0 0 0 3px #7561d81c}.button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}.button:focus-visible{outline:3px solid #9c8ef0;outline-offset:2px}.button-primary{background:var(--purple);color:#fff}.button-primary:hover{background:#6350c8}.button-quiet{background:var(--soft);color:var(--ink)}details{border-top:1px solid var(--line);padding-top:17px;color:var(--muted);font-size:13px;line-height:1.6}summary{color:var(--ink);font-weight:650;cursor:pointer}code{display:block;overflow-wrap:anywhere;padding:12px;border-radius:9px;background:#f6f4fa;color:#4c426e;font-size:11px}.warning{color:#8b5360}.page-heading{display:flex;align-items:end;justify-content:space-between;margin:0 0 22px}.page-heading h1{margin-bottom:0}.badge{padding:8px 11px;border-radius:99px;background:#f0edfb;color:#6655bf;font-size:11px;font-weight:700}.grid{display:grid;grid-template-columns:minmax(280px,.78fr) minmax(440px,1.4fr);gap:18px;align-items:start}.search-card,.detail-card{min-height:410px;padding:24px}.search-form{display:flex;gap:9px;margin-top:18px}.search-form input{min-width:0}.status{min-height:20px;margin:12px 0 5px;color:var(--muted);font-size:12px}.results{list-style:none;padding:0;margin:0}.results li+li{border-top:1px solid var(--line)}.user-result{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:14px 4px;border:0;background:transparent;cursor:pointer;color:var(--ink)}.user-result:hover,.user-result[aria-current=true]{color:var(--purple)}.user-result strong,.user-result small{display:block}.user-result small{margin-top:4px;color:var(--muted);font-size:11px}.user-result .phone{align-self:center;color:var(--muted);font-size:11px}.user-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.user-head p{margin:4px 0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.quota{margin:22px 0;padding:18px;border-radius:15px;background:var(--soft)}.quota-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.quota-number{font-size:23px;font-weight:800;letter-spacing:-.04em}.quota-number span{font-size:12px;color:var(--muted);font-weight:600}.progress{appearance:none;display:block;width:100%;height:7px;margin:13px 0 10px;border:0;border-radius:9px;background:#e8e5ef;overflow:hidden;accent-color:var(--purple)}.progress::-webkit-progress-bar{border-radius:9px;background:#e8e5ef}.progress::-webkit-progress-value{border-radius:9px;background:var(--purple)}.quota-meta{display:flex;justify-content:space-between;color:var(--muted);font-size:11px}.action-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0;padding-top:17px;border-top:1px solid var(--line)}.action-form .reason{grid-column:1/-1}.action-form input{padding:10px 12px}.action-form .button{width:100%}.button-danger{background:#fff0f1;color:var(--red);border:1px solid #f3d6da}.audit{border-top:1px solid var(--line);padding-top:16px}.audit h3{margin:0 0 9px;font-size:13px}.audit-list{list-style:none;padding:0;margin:0}.audit-list li{display:grid;grid-template-columns:1fr auto;gap:5px 12px;padding:10px 0;border-top:1px solid #f1eff4;font-size:11px}.audit-list .audit-reason{grid-column:1/-1;color:var(--muted)}.empty-state{text-align:center;padding:90px 20px}.empty-icon{display:block;margin-bottom:12px;color:var(--purple);font-size:38px}footer{padding:18px 3px;color:var(--muted);font-size:11px}.global-message{position:fixed;right:22px;bottom:14px;max-width:420px;color:var(--red);font-size:13px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}@media(max-width:820px){.shell{padding:0 16px 32px}.topbar{margin-bottom:24px}.grid{grid-template-columns:1fr}.search-card,.detail-card{min-height:unset}.page-heading{align-items:start;gap:10px;flex-direction:column}.login{margin:30px auto;padding:24px}}@media(max-width:420px){h1{font-size:26px}.search-form{align-items:stretch;flex-direction:column}.action-form{grid-template-columns:1fr}.action-form .reason{grid-column:auto}.user-head{display:block}.quota-meta{gap:12px}}`

const ADMIN_CONSOLE_JS = `(() => {
  const $ = (selector) => document.querySelector(selector);
  const login = $("#login"), workspace = $("#workspace"), tokenField = $("#token");
  const globalMessage = $("#global-message"), results = $("#results"), detail = $("#detail");
  let token = "", scopes = new Set(), selectedUserId = "";

  async function request(path, options = {}, authToken = token) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (authToken) headers.set("Authorization", "Bearer " + authToken);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...options, headers, cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && authToken && authToken === token && !workspace.hidden) {
        token = ""; scopes = new Set(); selectedUserId = "";
        workspace.hidden = true; $("#session").hidden = true; login.hidden = false;
        results.replaceChildren(); detail.replaceChildren(); tokenField.focus();
      }
      throw new Error(body.error || "İstek tamamlanamadı.");
    }
    return body;
  }

  function message(text) { globalMessage.textContent = text || ""; }
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); message("");
    const candidate = tokenField.value.trim();
    try {
      const session = await request("/v1/admin/session", {}, candidate);
      token = candidate; scopes = new Set(session.scopes);
      tokenField.value = "";
      $("#operator").textContent = session.operatorId + " · " + new Date(session.expiresAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      $("#session").hidden = false; login.hidden = true; workspace.hidden = false;
      $("#query").focus();
    } catch (error) { tokenField.value = ""; message(error.message); }
  });

  $("#logout").addEventListener("click", () => {
    token = ""; scopes = new Set(); selectedUserId = "";
    workspace.hidden = true; $("#session").hidden = true; login.hidden = false;
    results.replaceChildren(); detail.replaceChildren(); tokenField.focus(); message("");
  });

  $("#search-form").addEventListener("submit", async (event) => {
    event.preventDefault(); message(""); results.replaceChildren();
    const status = $("#search-message"); status.textContent = "Aranıyor…";
    try {
      const data = await request("/v1/admin/users?query=" + encodeURIComponent($("#query").value.trim()));
      status.textContent = data.users.length ? data.users.length + " kullanıcı bulundu" : "Eşleşen kullanıcı bulunamadı.";
      for (const user of data.users) {
        const item = element("li"), button = element("button", "user-result");
        button.type = "button"; button.setAttribute("aria-current", String(user.userId === selectedUserId));
        const info = element("span"), name = element("strong", "", user.displayName || "İsimsiz kullanıcı");
        const identity = element("small", "", user.userId); info.append(name, identity);
        button.append(info, element("span", "phone", user.maskedPhone));
        button.addEventListener("click", () => loadUser(user.userId));
        item.append(button); results.append(item);
      }
    } catch (error) { status.textContent = ""; message(error.message); }
  });

  async function loadUser(userId) {
    message(""); selectedUserId = userId;
    try {
      const [data, audit] = await Promise.all([
        request("/v1/admin/users/" + encodeURIComponent(userId)),
        request("/v1/admin/users/" + encodeURIComponent(userId) + "/quota-audit")
      ]);
      renderUser(data.user, audit.events);
      return true;
    } catch (error) { message(error.message); return false; }
  }

  function renderUser(user, events) {
    detail.replaceChildren();
    const head = element("div", "user-head"), identity = element("div");
    identity.append(element("div", "eyebrow", "HESAP"), element("h2", "", user.displayName || "İsimsiz kullanıcı"));
    identity.append(element("p", "", user.userId), element("p", "", user.maskedPhone + " · Katıldı " + new Date(user.createdAt).toLocaleDateString("tr-TR")));
    head.append(identity, element("span", "badge", "Kullanıcı")); detail.append(head);
    const quota = user.discoveryQuota, box = element("section", "quota");
    const quotaHead = element("div", "quota-head");
    quotaHead.append(element("span", "", "Günlük keşfet hakkı"), element("strong", "quota-number", quota.remaining + " "));
    const remaining = quotaHead.querySelector(".quota-number"); remaining.append(element("span", "", "/ " + quota.limit + " kaldı"));
    const bar = element("progress", "progress"); bar.max = 100; bar.value = Math.min(100, quota.limit ? quota.used / quota.limit * 100 : 0);
    const meta = element("div", "quota-meta"); meta.append(element("span", "", quota.used + " kullanıldı · " + quota.extensionDecisions + " ek hak"));
    meta.append(element("span", "", "Sıfırlanma " + new Date(quota.resetsAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })));
    box.append(quotaHead, bar, meta); detail.append(box);

    if (scopes.has("users:manage")) {
      const form = element("form", "action-form");
      const reasonWrap = element("div", "reason"), reasonLabel = element("label", "", "İşlem gerekçesi (zorunlu)");
      const reason = element("input"); reason.name = "reason"; reason.required = true; reason.minLength = 12; reason.maxLength = 500; reason.placeholder = "Örn. Kullanıcı desteği talebi #123";
      reasonLabel.htmlFor = "action-reason"; reason.id = "action-reason"; reasonWrap.append(reasonLabel, reason);
      const grantWrap = element("div"), grantLabel = element("label", "", "Ek hak (işlem başına 50, günlük toplam 100)");
      const amount = element("input"); amount.type = "number"; amount.min = "1"; amount.max = "50"; amount.step = "1"; amount.value = "5"; amount.required = true; amount.id = "grant-amount"; grantLabel.htmlFor = amount.id; grantWrap.append(grantLabel, amount);
      const grant = element("button", "button button-primary", "Ek hak tanımla"); grant.type = "button";
      const reset = element("button", "button button-danger", "Bugünkü hakkı sıfırla"); reset.type = "button";
      grant.addEventListener("click", () => performAction("grant", { reason: reason.value, amount: Number(amount.value) }));
      reset.addEventListener("click", () => { if (window.confirm("Bu kullanıcının bugünkü keşfet kullanımı sıfırlansın mı? İşlem denetim kaydına yazılır.")) performAction("reset", { reason: reason.value }); });
      form.append(reasonWrap, grantWrap, grant, reset); detail.append(form);
    }

    const auditBox = element("section", "audit"); auditBox.append(element("h3", "", "Son kota işlemleri"));
    const list = element("ul", "audit-list");
    if (!events.length) list.append(element("li", "", "Henüz yönetici kota işlemi yok."));
    for (const item of events) {
      const row = element("li"), title = item.action === "quota_reset" ? "Kullanım sıfırlandı" : "Ek hak tanımlandı (" + item.amount + ")";
      row.append(element("strong", "", title), element("span", "", new Date(item.createdAt).toLocaleString("tr-TR")));
      row.append(element("span", "audit-reason", item.reason + " · " + item.operatorId)); list.append(row);
    }
    auditBox.append(list); detail.append(auditBox);
  }

  let actionPending = false;
  async function performAction(action, payload) {
    if (actionPending) return;
    if (!payload.reason || payload.reason.trim().length < 12) { message("Lütfen en az 12 karakterlik bir işlem gerekçesi yaz."); return; }
    const suffix = action === "reset" ? "reset" : "grant";
    actionPending = true;
    try {
      await request("/v1/admin/users/" + encodeURIComponent(selectedUserId) + "/discovery-quota/" + suffix, { method: "POST", body: JSON.stringify(payload) });
      if (await loadUser(selectedUserId)) message("İşlem tamamlandı ve denetim kaydına eklendi.");
    } catch (error) { message(error.message); }
    finally { actionPending = false; }
  }
})();`
