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
  app.get("/admin/reports.css", async (_request, reply) => {
    return reply
      .header("Content-Security-Policy", CONSOLE_CSP)
      .header("Cache-Control", "no-store")
      .type("text/css; charset=utf-8")
      .send(ADMIN_REPORTS_CSS)
  })
  app.get("/admin/analytics.css", async (_request, reply) => reply
    .header("Content-Security-Policy", CONSOLE_CSP)
    .header("Cache-Control", "no-store")
    .type("text/css; charset=utf-8")
    .send(ADMIN_ANALYTICS_CSS))
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
  <title>Blumi · Yönetim merkezi</title>
  <link rel="stylesheet" href="/admin/console.css">
  <link rel="stylesheet" href="/admin/reports.css">
  <link rel="stylesheet" href="/admin/analytics.css">
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
      <h1 id="login-title">Yönetim merkezi</h1>
      <p class="muted">Devam etmek için kısa ömürlü yönetici token’ını gir. Token yalnızca bu sekmenin belleğinde tutulur; tarayıcıya kaydedilmez.</p>
      <form id="login-form" class="login-form">
        <label for="token">Yönetici token’ı</label>
        <input id="token" name="token" type="password" autocomplete="off" spellcheck="false" required>
        <button class="button button-primary" type="submit">Güvenli bağlan</button>
      </form>
      <details>
        <summary>Token’ı nasıl alacağım?</summary>
        <p>Sunucuda admin imzalama anahtarı tanımlı olmalı. Yalnız ihtiyaç duyduğun yetkileri içeren, en fazla 10 dakikalık token üret. İzleme için salt okunur token:</p>
        <code>npm run admin:mint-token --workspace @blumi/server -- --subject=eren-aksu --scopes=metrics:read --ttl=600</code>
        <p>Kullanıcı veya rapor işlemi gerektiğinde ilgili yetkilerle ayrı, kısa ömürlü token üret; izleme token’ına işlem yetkisi ekleme.</p>
        <p class="warning">Token’ı kimseyle paylaşma. Canlı ortamda paneli yalnızca HTTPS ve güvenli bir admin erişim katmanı arkasından kullan.</p>
      </details>
    </section>

    <section id="workspace" hidden>
      <div class="page-heading">
        <div><div class="eyebrow">BLUMI · CANLI OPERASYON</div><h1 id="workspace-title">Genel bakış</h1></div>
        <span class="badge">Hassas işlemler kayıt altına alınır</span>
      </div>
      <nav class="console-tabs" aria-label="Operasyon bölümleri">
        <button id="overview-tab" class="button button-quiet" type="button" aria-pressed="false" hidden>Genel bakış</button>
        <button id="analysis-tab" class="button button-quiet" type="button" aria-pressed="false" hidden>İş analizi</button>
        <button id="users-tab" class="button button-quiet" type="button" aria-pressed="false">Kullanıcılar</button>
        <button id="reports-tab" class="button button-quiet" type="button" aria-pressed="false" hidden>Güvenlik bildirimleri</button>
      </nav>
      <div id="analytics-toolbar" class="analytics-toolbar" hidden>
        <span id="analytics-status" role="status" aria-live="polite">Veriler yükleniyor…</span>
        <label for="analytics-period">Dönem</label>
        <select id="analytics-period"><option value="24h">Son 24 saat</option><option value="7d" selected>Son 7 gün</option><option value="30d">Son 30 gün</option></select>
        <button id="refresh-analytics" class="button button-quiet" type="button">Yenile</button>
      </div>
      <section id="overview-workspace" hidden aria-label="Genel bakış">
        <div id="overview-kpis" class="analytics-kpis"></div>
        <div class="analytics-columns">
          <section class="card analytics-panel"><h2>Hızlı aksiyon</h2><div id="overview-actions"></div></section>
          <section class="card analytics-panel"><h2>Sistem ve ödeme durumu</h2><div id="overview-systems"></div></section>
        </div>
      </section>
      <section id="analysis-workspace" hidden aria-label="İş analizi">
        <div class="analytics-columns">
          <section class="card analytics-panel"><h2>Yeni kullanıcı kohortu</h2><p class="muted">Seçilen dönemde kaydolan kullanıcıların davranışı. Adımlar bağımsız sayılır; sıralı dönüşüm oranı olarak yorumlama.</p><div id="analysis-funnel"></div></section>
          <section class="card analytics-panel"><h2>Zaman dilimi eğilimi</h2><p class="muted">Son 24 saatte saatlik, 7/30 günde 24 saatlik dilimler. Kayıt ve eşleşme sayıları seçilen kayan dönemle sınırlıdır.</p><div id="analysis-trend"></div></section>
        </div>
        <section class="card analytics-panel analyst-workspace"><h2>Analist çalışma alanı</h2><p class="muted">Gözlemini ve sonraki kontrolünü not al. Bu not yalnızca açık sekmede kalır; sunucuya gönderilmez.</p><label for="analyst-note">Hipotez / takip notu</label><textarea id="analyst-note" rows="4" placeholder="Örn. eşleşmeden ilk mesaja geçişi incele…"></textarea><button id="copy-analyst-note" class="button button-quiet" type="button">Notu kopyala</button></section>
      </section>
      <div id="user-workspace" class="grid">
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
      <section id="reports-workspace" class="report-grid" hidden aria-label="Güvenlik bildirimi kuyruğu">
        <section class="card report-queue-card" aria-labelledby="report-queue-title">
          <div class="report-queue-heading">
            <div><h2 id="report-queue-title">İnceleme kuyruğu</h2><p class="muted">Öncelik ve iç yanıt hedeflerine göre sıralanır.</p></div>
            <button id="refresh-reports" class="button button-quiet" type="button">Yenile</button>
          </div>
          <label class="report-filter-label" for="report-status">Durum</label>
          <select id="report-status" class="report-status-filter">
            <option value="pending">Bekleyen</option>
            <option value="resolved">İncelendi</option>
            <option value="dismissed">Kapatıldı</option>
          </select>
          <p id="report-summary" class="status" role="status" aria-live="polite"></p>
          <ul id="report-results" class="results" aria-label="Güvenlik bildirimleri"></ul>
        </section>
        <section id="report-detail" class="card report-detail-card" aria-labelledby="report-detail-title">
          <div class="empty-state"><span class="empty-icon" aria-hidden="true">♡</span><h2 id="report-detail-title">Bir bildirim seç</h2><p class="muted">Raporu incele, gerekli işlemi yap ve yalnızca genel durumu kullanıcıya yansıt.</p></div>
        </section>
      </section>
      <footer>Telefon numaraları maskelenir. Sohbet içerikleri, fotoğraflar ve özel profil alanları bu panelde gösterilmez.</footer>
    </section>
    <p id="global-message" class="global-message" role="alert" aria-live="assertive"></p>
  </main>
</body>
</html>`

const ADMIN_REPORTS_CSS = `.console-tabs{display:flex;gap:8px;margin:-6px 0 18px}.report-grid{display:grid;grid-template-columns:minmax(280px,.78fr) minmax(440px,1.4fr);gap:18px;align-items:start}.report-queue-card,.report-detail-card{min-height:410px;padding:24px}.report-queue-heading{display:flex;justify-content:space-between;gap:14px;align-items:start}.report-queue-heading .muted{margin:5px 0}.report-filter-label{display:block;margin-top:16px;font-size:12px;font-weight:700}.report-status-filter{width:100%;margin-top:7px;padding:11px;border:1px solid #dfdce8;border-radius:11px;background:#fff;color:var(--ink);font:inherit}.report-list-item{padding:13px 4px;border-top:1px solid var(--line)}.report-list-button{display:grid;width:100%;gap:5px;text-align:left;border:0;background:transparent;color:var(--ink);cursor:pointer}.report-list-button:hover,.report-list-button[aria-current=true]{color:var(--purple)}.report-list-meta{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:11px}.priority-urgent{color:var(--red);font-weight:800}.priority-high{color:#a6651c;font-weight:800}.priority-standard{color:var(--muted);font-weight:700}.report-detail-card{overflow-wrap:anywhere}.report-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.report-detail-meta{display:grid;gap:6px;margin:18px 0;padding:15px;border-radius:13px;background:var(--soft);font-size:12px}.report-note{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:13px;line-height:1.6}.report-resolution{display:grid;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.report-resolution label{font-size:12px;font-weight:700}.report-resolution select,.report-resolution textarea{width:100%;padding:11px;border:1px solid #dfdce8;border-radius:11px;background:#fff;color:var(--ink);font:inherit}.report-resolution textarea{min-height:88px;resize:vertical}.report-resolution .muted{font-size:12px;margin:0}.report-queue-empty{padding:18px 4px;color:var(--muted);font-size:13px}@media(max-width:820px){.console-tabs{overflow:auto}.report-grid{grid-template-columns:1fr}.report-queue-card,.report-detail-card{min-height:unset;padding:20px}.report-queue-heading{align-items:start}}@media(max-width:420px){.console-tabs .button{flex:1;padding:10px 8px;font-size:12px}.report-queue-heading{flex-direction:column}}`

const ADMIN_ANALYTICS_CSS = `.analytics-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin:-4px 0 18px;color:var(--muted);font-size:12px}.analytics-toolbar #analytics-status{margin-right:auto}.analytics-toolbar select{border:1px solid var(--line);border-radius:10px;padding:10px;color:var(--ink);background:white}.analytics-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.analytics-kpi{padding:20px 22px;min-height:138px}.analytics-kpi-label{font-size:12px;color:var(--muted);font-weight:650}.analytics-kpi-value{display:block;margin:13px 0 4px;font-size:31px;font-weight:780;letter-spacing:-.05em;font-variant-numeric:tabular-nums}.analytics-kpi-detail{font-size:11px;color:var(--muted);line-height:1.5}.analytics-kpi.urgent{border-color:#f0d3d8;background:#fffafa}.analytics-kpi.urgent .analytics-kpi-value{color:var(--red)}.analytics-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.analytics-panel{padding:24px;min-width:0}.analytics-panel h2{margin-bottom:12px}.analytics-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line);font-size:13px}.analytics-row:first-child{border-top:0}.analytics-row strong{font-variant-numeric:tabular-nums}.analytics-row small{color:var(--muted)}.analytics-action{width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:transparent;padding:13px 0;color:var(--purple);font:inherit;font-size:13px;font-weight:700;cursor:pointer}.analytics-action:hover{text-decoration:underline}.analytics-meter{height:7px;border-radius:8px;background:#efedf5;overflow:hidden;margin:2px 0 12px}.analytics-meter span{display:block;height:100%;border-radius:8px;background:#a99be7}.analytics-trend-row{display:grid;grid-template-columns:72px 1fr 48px;gap:10px;align-items:center;padding:7px 0;font-size:11px;color:var(--muted)}.analytics-trend-track{height:13px;background:#f3f0fa;border-radius:10px;overflow:hidden}.analytics-trend-track span{display:block;height:100%;background:#aa9ae7;border-radius:10px}.analyst-workspace label{display:block;margin:14px 0 7px;font-size:12px;font-weight:700}.analyst-workspace textarea{display:block;width:100%;padding:12px;border:1px solid var(--line);border-radius:11px;font:inherit;resize:vertical}.analyst-workspace button{margin-top:10px}.analytics-note{color:var(--muted);font-size:12px;line-height:1.6}@media(max-width:900px){.analytics-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-columns{grid-template-columns:1fr}}@media(max-width:560px){.analytics-kpis{grid-template-columns:1fr 1fr;gap:9px}.analytics-kpi{padding:16px;min-height:120px}.analytics-kpi-value{font-size:25px}.analytics-toolbar{flex-wrap:wrap;justify-content:flex-start}.analytics-toolbar #analytics-status{width:100%}}@media(prefers-reduced-motion:reduce){.analytics-meter span,.analytics-trend-track span{transition:none}}`

const ADMIN_CONSOLE_CSS = `:root{color-scheme:light;--ink:#262438;--muted:#777588;--line:#ebe9f0;--purple:#7561d8;--soft:#f7f5fc;--green:#167957;--red:#b94758;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:#faf9fc;color:var(--ink)}button,input{font:inherit}.shell{max-width:1180px;margin:0 auto;padding:0 28px 48px}.topbar{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);margin-bottom:36px}.brand{display:flex;align-items:center;gap:11px;color:var(--ink);font-size:18px;font-weight:750;text-decoration:none;letter-spacing:-.04em}.brand small{display:block;margin-top:3px;color:var(--muted);font-size:9px;letter-spacing:.14em}.brand-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#eeeaff;color:var(--purple);font-size:25px}.session{display:flex;align-items:center;gap:14px;color:var(--muted);font-size:13px}.card{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 8px 30px #30275208}.login{max-width:600px;margin:62px auto;padding:36px}.eyebrow{color:var(--purple);font-size:10px;font-weight:800;letter-spacing:.15em}h1{margin:10px 0 8px;font-size:30px;letter-spacing:-.045em}h2{margin:0 0 8px;font-size:18px;letter-spacing:-.025em}.muted{color:var(--muted);font-size:14px;line-height:1.6}.login-form{display:grid;gap:10px;margin:26px 0 22px}.login-form label,.action-form label{font-size:12px;font-weight:700}.login-form input,.search-form input,.action-form input,.action-form textarea{width:100%;padding:12px 14px;border:1px solid #dfdce8;border-radius:11px;background:#fff;color:var(--ink);outline:none}.login-form input:focus,.search-form input:focus,.action-form input:focus,.action-form textarea:focus{border-color:var(--purple);box-shadow:0 0 0 3px #7561d81c}.button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}.button:focus-visible{outline:3px solid #9c8ef0;outline-offset:2px}.button-primary{background:var(--purple);color:#fff}.button-primary:hover{background:#6350c8}.button-quiet{background:var(--soft);color:var(--ink)}details{border-top:1px solid var(--line);padding-top:17px;color:var(--muted);font-size:13px;line-height:1.6}summary{color:var(--ink);font-weight:650;cursor:pointer}code{display:block;overflow-wrap:anywhere;padding:12px;border-radius:9px;background:#f6f4fa;color:#4c426e;font-size:11px}.warning{color:#8b5360}.page-heading{display:flex;align-items:end;justify-content:space-between;margin:0 0 22px}.page-heading h1{margin-bottom:0}.badge{padding:8px 11px;border-radius:99px;background:#f0edfb;color:#6655bf;font-size:11px;font-weight:700}.grid{display:grid;grid-template-columns:minmax(280px,.78fr) minmax(440px,1.4fr);gap:18px;align-items:start}.search-card,.detail-card{min-height:410px;padding:24px}.search-form{display:flex;gap:9px;margin-top:18px}.search-form input{min-width:0}.status{min-height:20px;margin:12px 0 5px;color:var(--muted);font-size:12px}.results{list-style:none;padding:0;margin:0}.results li+li{border-top:1px solid var(--line)}.user-result{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;padding:14px 4px;border:0;background:transparent;cursor:pointer;color:var(--ink)}.user-result:hover,.user-result[aria-current=true]{color:var(--purple)}.user-result strong,.user-result small{display:block}.user-result small{margin-top:4px;color:var(--muted);font-size:11px}.user-result .phone{align-self:center;color:var(--muted);font-size:11px}.user-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.user-head p{margin:4px 0;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.quota{margin:22px 0;padding:18px;border-radius:15px;background:var(--soft)}.quota-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.quota-number{font-size:23px;font-weight:800;letter-spacing:-.04em}.quota-number span{font-size:12px;color:var(--muted);font-weight:600}.progress{appearance:none;display:block;width:100%;height:7px;margin:13px 0 10px;border:0;border-radius:9px;background:#e8e5ef;overflow:hidden;accent-color:var(--purple)}.progress::-webkit-progress-bar{border-radius:9px;background:#e8e5ef}.progress::-webkit-progress-value{border-radius:9px;background:var(--purple)}.quota-meta{display:flex;justify-content:space-between;color:var(--muted);font-size:11px}.action-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0;padding-top:17px;border-top:1px solid var(--line)}.action-form .reason{grid-column:1/-1}.action-form input{padding:10px 12px}.action-form .button{width:100%}.button-danger{background:#fff0f1;color:var(--red);border:1px solid #f3d6da}.audit{border-top:1px solid var(--line);padding-top:16px}.audit h3{margin:0 0 9px;font-size:13px}.audit-list{list-style:none;padding:0;margin:0}.audit-list li{display:grid;grid-template-columns:1fr auto;gap:5px 12px;padding:10px 0;border-top:1px solid #f1eff4;font-size:11px}.audit-list .audit-reason{grid-column:1/-1;color:var(--muted)}.empty-state{text-align:center;padding:90px 20px}.empty-icon{display:block;margin-bottom:12px;color:var(--purple);font-size:38px}footer{padding:18px 3px;color:var(--muted);font-size:11px}.global-message{position:fixed;right:22px;bottom:14px;max-width:420px;color:var(--red);font-size:13px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[hidden]{display:none!important}@media(max-width:820px){.shell{padding:0 16px 32px}.topbar{margin-bottom:24px}.grid{grid-template-columns:1fr}.search-card,.detail-card{min-height:unset}.page-heading{align-items:start;gap:10px;flex-direction:column}.login{margin:30px auto;padding:24px}}@media(max-width:420px){h1{font-size:26px}.search-form{align-items:stretch;flex-direction:column}.action-form{grid-template-columns:1fr}.action-form .reason{grid-column:auto}.user-head{display:block}.quota-meta{gap:12px}}`

const ADMIN_CONSOLE_JS = `(() => {
  const $ = (selector) => document.querySelector(selector);
  const login = $("#login"), workspace = $("#workspace"), tokenField = $("#token");
  const globalMessage = $("#global-message"), results = $("#results"), detail = $("#detail");
  const userWorkspace = $("#user-workspace"), reportsWorkspace = $("#reports-workspace");
  const overviewWorkspace = $("#overview-workspace"), analysisWorkspace = $("#analysis-workspace");
  const reportResults = $("#report-results"), reportDetail = $("#report-detail");
  const usersTab = $("#users-tab"), reportsTab = $("#reports-tab");
  const overviewTab = $("#overview-tab"), analysisTab = $("#analysis-tab");
  let token = "", scopes = new Set(), selectedUserId = "", selectedReportId = "", currentArea = "";
  let analyticsRequestId = 0;

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
        results.replaceChildren(); detail.replaceChildren(); reportResults.replaceChildren();
        reportDetail.replaceChildren(); tokenField.focus();
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
      usersTab.hidden = !scopes.has("users:read");
      reportsTab.hidden = !scopes.has("reports:read");
      overviewTab.hidden = analysisTab.hidden = !scopes.has("metrics:read");
      if (scopes.has("metrics:read")) showConsoleArea("overview");
      else if (scopes.has("users:read")) {
        showConsoleArea("users");
        $("#query").focus();
      } else if (scopes.has("reports:read")) {
        showConsoleArea("reports");
      }
    } catch (error) { tokenField.value = ""; message(error.message); }
  });

  $("#logout").addEventListener("click", () => {
    token = ""; scopes = new Set(); selectedUserId = ""; analyticsRequestId++;
    workspace.hidden = true; $("#session").hidden = true; login.hidden = false;
    results.replaceChildren(); detail.replaceChildren(); reportResults.replaceChildren();
    reportDetail.replaceChildren(); tokenField.focus(); message("");
  });

  usersTab.addEventListener("click", () => showConsoleArea("users"));
  reportsTab.addEventListener("click", () => showConsoleArea("reports"));
  overviewTab.addEventListener("click", () => showConsoleArea("overview"));
  analysisTab.addEventListener("click", () => showConsoleArea("analysis"));
  $("#refresh-analytics").addEventListener("click", () => loadAnalytics());
  $("#analytics-period").addEventListener("change", () => loadAnalytics());
  $("#copy-analyst-note").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#analyst-note").value); message("Not panoya kopyalandı."); }
    catch { message("Not kopyalanamadı."); }
  });
  setInterval(() => {
    if (!token || document.hidden) return;
    if (currentArea === "overview" || currentArea === "analysis") void loadAnalytics();
    if (currentArea === "reports") void loadReports();
  }, 60000);
  $("#refresh-reports").addEventListener("click", () => loadReports());
  $("#report-status").addEventListener("change", () => {
    selectedReportId = ""; reportDetail.replaceChildren();
    void loadReports();
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

  function showConsoleArea(area) {
    const scope = { overview: "metrics:read", analysis: "metrics:read", users: "users:read", reports: "reports:read" }[area];
    if (!scope || !scopes.has(scope)) return;
    currentArea = area;
    for (const [name, panel, tab] of [["overview", overviewWorkspace, overviewTab], ["analysis", analysisWorkspace, analysisTab], ["users", userWorkspace, usersTab], ["reports", reportsWorkspace, reportsTab]]) {
      panel.hidden = name !== area;
      tab.className = name === area ? "button button-primary" : "button button-quiet";
      tab.setAttribute("aria-pressed", String(name === area));
    }
    $("#analytics-toolbar").hidden = area !== "overview" && area !== "analysis";
    $("#workspace-title").textContent = { overview: "Genel bakış", analysis: "İş analizi", users: "Kullanıcılar", reports: "Güvenlik bildirimleri" }[area];
    if (area === "reports") void loadReports();
    if (area === "overview" || area === "analysis") void loadAnalytics();
  }

  const number = (value) => value === null || value === undefined ? "Ölçülmüyor" : Number(value).toLocaleString("tr-TR");
  function analyticsRow(label, value) {
    const row = element("div", "analytics-row"); row.append(element("span", "", label), element("strong", "", value)); return row;
  }
  function kpi(label, value, detailText, urgent = false) {
    const card = element("div", "card analytics-kpi" + (urgent ? " urgent" : ""));
    card.append(element("span", "analytics-kpi-label", label), element("strong", "analytics-kpi-value", number(value)), element("small", "analytics-kpi-detail", detailText));
    return card;
  }
  async function loadAnalytics() {
    if (!scopes.has("metrics:read") || (currentArea !== "overview" && currentArea !== "analysis")) return;
    const requestId = ++analyticsRequestId;
    $("#analytics-status").textContent = "Güncelleniyor…";
    try {
      const data = await request("/v1/admin/analytics?period=" + encodeURIComponent($("#analytics-period").value));
      if (requestId !== analyticsRequestId || !token) return;
      const snap = data.snapshot;
      if (currentArea === "overview") renderOverview(snap);
      if (currentArea === "analysis") renderAnalysis(snap);
      const seen = (value) => value ? new Date(value).toLocaleTimeString("tr-TR") : "ölçülmüyor";
      $("#analytics-status").textContent = "Online " + seen(snap.generatedAt) +
        " · rapor " + seen(snap.safetyUpdatedAt) +
        " · iş analizi " + seen(snap.activityUpdatedAt) + " (en çok 5 dk) · " + snap.environment +
        " · online yalnız bu sunucu · 60 sn'de yenilenir";
    } catch (error) {
      if (requestId !== analyticsRequestId || !token) return;
      $("#analytics-status").textContent = "Veri alınamadı; önceki sayılar güncel kabul edilmemeli.";
      $("#overview-kpis").replaceChildren(); $("#overview-actions").replaceChildren();
      $("#overview-systems").replaceChildren(); $("#analysis-funnel").replaceChildren();
      $("#analysis-trend").replaceChildren(); message(error.message);
    }
  }
  function renderOverview(snap) {
    const cards = $("#overview-kpis"); cards.replaceChildren();
    cards.append(
      kpi("Şu an çevrimiçi", snap.online.users, "Bu sunucudaki aktif WebSocket kullanıcıları"),
      kpi("WebSocket bağlantısı", snap.online.connections, "Bu sunucu örneği"),
      kpi("Yeni kayıt", snap.activity?.registrations, "Seçili dönem"),
      kpi("Eşleşme", snap.activity?.matches, "Seçili dönem"),
      kpi("Bekleyen bildirim", snap.safety?.pending, "Tüm zamanlar", (snap.safety?.pending ?? 0) > 0),
      kpi("4 saati aşan", snap.safety?.overdue, "Blumi iç yanıt hedefi", (snap.safety?.overdue ?? 0) > 0),
      kpi("Mesaj", snap.activity?.messages, "İçerik gösterilmez"),
      kpi("Odaya katılım", snap.activity?.roomJoins, "Sohbetten açılan odalar")
    );
    const actions = $("#overview-actions"); actions.replaceChildren();
    if (scopes.has("reports:read")) {
      const button = element("button", "analytics-action", "Bildirim kuyruğunu aç →"); button.type = "button"; button.addEventListener("click", () => showConsoleArea("reports")); actions.append(button);
    }
    if (scopes.has("users:read")) {
      const button = element("button", "analytics-action", "Kullanıcıları yönet →"); button.type = "button"; button.addEventListener("click", () => showConsoleArea("users")); actions.append(button);
    }
    actions.append(analyticsRow("En eski bekleyen bildirim", !snap.safety ? "Ölçülmüyor" : snap.safety.oldestPendingAt ? new Date(snap.safety.oldestPendingAt).toLocaleString("tr-TR") : "Yok"));
    const systems = $("#overview-systems"); systems.replaceChildren();
    systems.append(analyticsRow("Veritabanı", snap.activity ? "Veri alınıyor" : "Ölçülmüyor"), analyticsRow("API", "Bu istek başarılı"), analyticsRow("Ödemeler", "İlk sürümde kapalı"), analyticsRow("Satın alma / iade kaydı", snap.activity ? number(snap.activity.purchaseCredits) + " / " + number(snap.activity.purchaseReversals) : "Ölçülmüyor"), analyticsRow("Deploy / Railway kredi", "Bağlı telemetri yok"));
    systems.append(element("p", "analytics-note", "Online yalnız bu sunucuya açık bağlantıları sayar. 5/15/60 dk aktif, API gecikmesi, OTP başarısı ve maliyet henüz güvenilir kaynaktan ölçülmüyor."));
  }
  function renderAnalysis(snap) {
    const funnel = $("#analysis-funnel"), trend = $("#analysis-trend"); funnel.replaceChildren(); trend.replaceChildren();
    if (!snap.funnel) { funnel.append(element("p", "analytics-note", "Kohort verisi henüz alınamıyor.")); return; }
    const steps = [["Kayıt", snap.funnel.registered], ["Profil adımı tamamlandı", snap.funnel.profileComplete], ["Discover kullandı", snap.funnel.discovered], ["Karşılıklı eşleşti", snap.funnel.matched], ["Mesaj gönderdi", snap.funnel.messaged], ["Oda daveti", snap.funnel.invited], ["Odaya katıldı", snap.funnel.joined]];
    for (const [label, value] of steps) {
      funnel.append(analyticsRow(label, number(value)));
      const meter = element("div", "analytics-meter"), fill = element("span"); fill.style.width = (snap.funnel.registered ? Math.min(100, value / snap.funnel.registered * 100) : 0) + "%"; meter.append(fill); funnel.append(meter);
    }
    trend.append(element("p", "analytics-note", "Mor çizgi dilimdeki kayıt sayısıdır. Eşleşme toplamı satır sonunda yer alır."));
    const max = Math.max(1, ...(snap.trend || []).map((day) => day.registrations));
    for (const day of snap.trend || []) {
      const row = element("div", "analytics-trend-row"), track = element("div", "analytics-trend-track"), fill = element("span");
      fill.style.width = (day.registrations / max * 100) + "%"; track.append(fill);
      row.append(element("span", "", new Date(day.day).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })), track, element("strong", "", day.registrations + " / " + day.matches)); trend.append(row);
    }
    trend.append(analyticsRow("İç engelleme", snap.safety ? number(snap.safety.blocks) : "Ölçülmüyor"));
    trend.append(element("p", "analytics-note", "D1/D7 geri dönüş ve sıralı dönüşüm henüz ölçülmüyor. Bu ekran kullanıcı içeriği veya kimlik bilgisi içermez."));
  }

  async function loadReports() {
    if (!scopes.has("reports:read")) return;
    const list = reportResults;
    const status = $("#report-summary");
    list.replaceChildren();
    status.textContent = "Kuyruk yükleniyor…";
    const selectedStatus = $("#report-status").value;
    try {
      const [data, workload] = await Promise.all([
        request("/v1/admin/reports?status=" + encodeURIComponent(selectedStatus) + "&limit=50"),
        request("/v1/admin/reports/summary").catch(() => null)
      ]);
      const reports = Array.isArray(data.reports) ? data.reports : [];
      if (!reports.length) {
        status.textContent = selectedStatus === "pending" ? "Bekleyen bildirim yok." : "Bu durumda bildirim yok.";
        list.append(element("li", "report-queue-empty", status.textContent));
      } else {
        const breachedCount = workload && Number.isInteger(workload.summary?.breachedCount)
          ? workload.summary.breachedCount
          : reports.filter((report) => report.queue?.breached).length;
        status.textContent = reports.length + " bildirim gösteriliyor · " + breachedCount + " iç yanıt hedefi aşılmış. Bu kuyruk en geç 4 saatte bir insan tarafından kontrol edilmelidir; hedefler Blumi iç operasyon hedefidir, Apple SLA’sı değildir.";
        for (const report of reports) {
          const item = element("li", "report-list-item");
          const button = element("button", "report-list-button");
          button.type = "button";
          button.setAttribute("aria-current", String(report.reportId === selectedReportId));
          const label = report.reason === "underage" ? "Yaş güvenliği" :
            report.reason === "harassment" ? "Taciz" :
            report.reason === "inappropriate" ? "Uygunsuz içerik" :
            report.reason === "spam" ? "Spam" :
            report.reason === "fake_profile" || report.reason === "fake_or_bot" ? "Sahte profil" : "Diğer";
          const priority = report.queue?.priority || "standard";
          const priorityLabel = priority === "urgent" ? "Acil" : priority === "high" ? "Yüksek" : "Standart";
          const elapsedHours = Math.max(0, Math.floor((Date.now() - Date.parse(report.createdAt)) / 3600000));
          const ageText = elapsedHours < 1 ? "1 saatten az" : elapsedHours + " saattir bekliyor";
          const firstLine = element("strong", "", label + " · " + priorityLabel);
          if (priority === "urgent") firstLine.className = "priority-urgent";
          else if (priority === "high") firstLine.className = "priority-high";
          else firstLine.className = "priority-standard";
          const meta = element("span", "report-list-meta");
          meta.append(element("span", "", ageText));
          meta.append(element("span", report.queue?.breached ? "priority-urgent" : "", report.queue?.breached ? "Hedef aşıldı" : "Hedef " + new Date(report.queue?.dueAt || report.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })));
          button.append(firstLine, meta);
          button.addEventListener("click", () => void loadReport(report.reportId));
          item.append(button); list.append(item);
        }
      }
    } catch (error) {
      status.textContent = "";
      message(error.message);
    }
  }

  async function loadReport(reportId) {
    selectedReportId = reportId;
    try {
      const data = await request("/v1/admin/reports/" + encodeURIComponent(reportId));
      renderReport(data.report);
      for (const button of reportResults.querySelectorAll(".report-list-button")) {
        button.setAttribute("aria-current", String(button.closest("li")?.querySelector("button") === button && reportId === selectedReportId));
      }
    } catch (error) { message(error.message); }
  }

  function renderReport(report) {
    reportDetail.replaceChildren();
    const heading = element("div", "report-detail-head"), identity = element("div");
    identity.append(element("div", "eyebrow", "GÜVENLİK BİLDİRİMİ"));
    identity.append(element("h2", "", report.reason));
    heading.append(identity, element("span", "badge", report.status === "pending" ? "Bekliyor" : "Kapandı"));
    reportDetail.append(heading);

    const metadata = element("div", "report-detail-meta");
    metadata.append(element("span", "", "Bildirim: " + report.reportId));
    metadata.append(element("span", "", "Gönderen kullanıcı: " + report.actorUserId));
    metadata.append(element("span", "", "Bildirilen kullanıcı: " + report.reportedUserId));
    metadata.append(element("span", "", "Gönderildi: " + new Date(report.createdAt).toLocaleString("tr-TR")));
    if (report.queue) metadata.append(element("span", "", "Öncelik: " + report.queue.priority + " · Yanıt hedefi: " + new Date(report.queue.dueAt).toLocaleString("tr-TR") + (report.queue.breached ? " · AŞILDI" : "")));
    reportDetail.append(metadata);

    reportDetail.append(element("h3", "", "Kullanıcının açıklaması"));
    reportDetail.append(element("p", "report-note", report.note || "Ek açıklama yok."));
    if (report.resolution) {
      reportDetail.append(element("h3", "", "İç çözüm kaydı"));
      reportDetail.append(element("p", "report-note", report.resolution.action + " · " + new Date(report.resolution.resolvedAt).toLocaleString("tr-TR") + (report.resolution.adminNote ? "\\n" + report.resolution.adminNote : "")));
    }
    if (report.status !== "pending") return;
    if (!scopes.has("reports:resolve")) {
      reportDetail.append(element("p", "muted", "Bu token yalnızca okumaya izin veriyor; çözümlemek için reports:resolve yetkisi gerekir."));
      return;
    }

    const form = element("form", "report-resolution");
    const actionLabel = element("label", "", "İşlem");
    const action = element("select"); action.id = "report-action";
    for (const [value, label] of [["warn", "Uyar"], ["suspend", "7 gün askıya al"], ["ban", "Hesabı yasakla"], ["dismiss", "İşlem yapmadan kapat"]]) {
      const option = element("option", "", label); option.value = value; action.append(option);
    }
    actionLabel.htmlFor = action.id;
    const noteLabel = element("label", "", "Yalnızca moderatörlerin göreceği iç not (isteğe bağlı)");
    const note = element("textarea"); note.id = "report-resolution-note"; note.maxLength = 1000;
    noteLabel.htmlFor = note.id;
    const explain = element("p", "muted", "Kullanıcıya yalnızca genel incelendi/kapandı durumu gösterilir; bu not ve uygulanan işlem ona açıklanmaz.");
    const submit = element("button", "button button-primary", "İncelemeyi kaydet"); submit.type = "submit";
    form.append(actionLabel, action, noteLabel, note, explain, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.confirm("Bu moderasyon kararını denetim kaydına ekleyip bildirimi kapatmak istiyor musun?")) return;
      submit.disabled = true;
      try {
        await request("/v1/admin/reports/" + encodeURIComponent(report.reportId) + "/resolve", {
          method: "POST",
          body: JSON.stringify({ action: action.value, note: note.value })
        });
        reportDetail.replaceChildren();
        selectedReportId = "";
        await loadReports();
        message("İnceleme kaydedildi; kullanıcı yalnızca genel durum mesajını görür.");
      } catch (error) { message(error.message); submit.disabled = false; }
    });
    reportDetail.append(form);
  }
})();`
