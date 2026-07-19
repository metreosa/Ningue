import os, glob

sidebar_html = """  <!-- SIDEBAR -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <a href="index.html" class="nav-brand">
        <img src="assets/logo_ningue_transparent.png" alt="Ningue Logo" style="height:44px;" />
        <span>Nin<span class="accent">gue</span></span>
      </a>
      <button class="mobile-menu-close" id="menuCloseBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
      </button>
    </div>
    <div class="sidebar-content">
      
      <!-- PORTFOLIO WIDGET -->
      <div class="sidebar-widget">
        <div class="sw-label">Portfolio <span class="sw-sub">(Last 24h)</span></div>
        <div class="sw-val">$0.0</div>
        <div class="sw-change">$0.0 (0.0%)</div>
      </div>

      <!-- LIVE MATCHES PILL -->
      <a href="livescores.html" class="sidebar-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Live Matches
      </a>

      <!-- FOOTBALL SECTION -->
      <div class="sidebar-section">
        <div class="ss-header">Football</div>
        <div class="ss-links">
          <a href="markets.html" class="ss-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Live & Upcoming
          </a>
          <a href="#" class="ss-link">
            <svg class="ss-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 808 1233" fill="none">
              <path d="M0 201.879C0 89.8993 93.8438 0 198.725 0H610.371C697.904 0 807.518 71.7613 807.518 199.513C807.518 328.877 703.005 401.097 613.65 404.426C647.396 403.968 754.557 404.303 807.517 404.547V604.849H0.788591V391.929C0.788591 332.785 58.3557 201.879 197.936 201.879H0Z" fill="currentColor"/>
              <path d="M608.795 627.335C713.676 627.335 807.52 717.234 807.52 829.214H609.583C734.968 829.214 807.52 939.617 807.52 1029.52C807.52 1131.24 726.293 1232.18 614.313 1232.18H205.035C55.2026 1232.18 0.00238037 1098.91 0.00238037 1046.08L0.0020752 1025.79C0.00170898 999.669 0.00134277 972.247 0.00134277 826.848C0.00134277 699.096 109.615 627.335 197.149 627.335H608.795Z" fill="currentColor"/>
            </svg> World Cup'26
          </a>
          <a href="#" class="ss-link"><img src="assets/spl_logo_processed.png" class="ss-icon" /> SPL</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/MLS%20Inactive%201_128x128.png" class="ss-icon" /> MLS</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/League_Logos_3X/EPL_Inactive_48x48.png" class="ss-icon" /> EPL</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/League_Logos_3X/LaLiga_Inactive_128x128.png" class="ss-icon" /> La Liga</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/Series%20A%20Inactive_128x128.png" class="ss-icon" /> Serie A</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/League_Logos_3X/UCL_Inactive_128x128.png" class="ss-icon" /> UCL</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/Bundesliga%20inactive_128x128.png" class="ss-icon" /> Bundesliga</a>
          <a href="#" class="ss-link"><img src="https://public-assets.pred.app/market-assets/League_Logos/Ligue1%20inactive_128x128.png" class="ss-icon" /> Ligue 1</a>
        </div>
      </div>

      <!-- GAMES SECTION -->
      <div class="sidebar-section ss-disabled">
        <div class="ss-header">Games <span class="badge-coming-soon">Soon</span></div>
      </div>
    </div>
  </aside>

  <!-- NAV -->
  <nav class="nav">
    <div class="nav-left">
      <button class="mobile-menu-open" id="menuOpenBtn">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      <a href="index.html" class="nav-brand mobile-only">
        <img src="assets/logo_ningue_transparent.png" alt="Ningue Logo" style="height:36px;" />
        <span>Nin<span class="accent">gue</span></span>
      </a>
    </div>"""

target_str = """  <!-- NAV -->
  <nav class="nav">
    <a href="index.html" class="nav-brand">
      <img src="assets/logo_ningue_transparent.png" alt="Ningue Logo" style="height:44px;" />
      <span>Nin<span class="accent">gue</span></span>
    </a>"""

for filepath in glob.glob("*.html"):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if target_str in content:
        new_content = content.replace(target_str, sidebar_html)
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Injected sidebar into {filepath}")
    else:
        print(f"Target string not found in {filepath}")
