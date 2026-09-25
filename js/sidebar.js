// My Cabinet Planner — js/sidebar.js
// Sidebar, project header, room tabs, cabinet list.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RENDER: SIDEBAR
// ════════════════════════════
function projectThumbSVG(p) {
  const W = 32, H = 24, pad = 2;
  const r = p.rooms && p.rooms[0];
  if (!r) return `<svg class="project-thumb" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>`;
  const roomW = Math.max(r.walls.north || 0, r.walls.south || 0, 48);
  const roomH = Math.max(r.walls.east  || 0, r.walls.west  || 0, 48);
  const scale = Math.min((W - pad * 2) / roomW, (H - pad * 2) / roomH);
  const w = roomW * scale, h = roomH * scale;
  const x = (W - w) / 2, y = (H - h) / 2;
  let path;
  if (r.shape === 'L') {
    const cutW = Math.min(r.cutW || roomW / 2, roomW * 0.9) * scale;
    const cutD = Math.min(r.cutD || roomH / 2, roomH * 0.9) * scale;
    const corner = r.corner || 'NE';
    if (corner === 'NE')      path = `M${x},${y} h${w-cutW} v${cutD} h${cutW} v${h-cutD} h${-w} Z`;
    else if (corner === 'NW') path = `M${x+cutW},${y} h${w-cutW} v${h} h${-w} v${-(h-cutD)} h${cutW} Z`;
    else if (corner === 'SE') path = `M${x},${y} h${w} v${h-cutD} h${-cutW} v${cutD} h${-(w-cutW)} Z`;
    else                       path = `M${x},${y} h${w} v${h} h${-(w-cutW)} v${-cutD} h${-cutW} Z`;
  } else {
    path = `M${x},${y} h${w} v${h} h${-w} Z`;
  }
  return `<svg class="project-thumb" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${path}" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/></svg>`;
}
function renderSidebar() {
  const list = document.getElementById('project-list');
  if (!state.projects.length) { list.innerHTML = '<div class="empty-msg">No projects yet.<br>Click + New Project above.</div>'; return; }
  list.innerHTML = state.projects.map(p => {
    const st = p.status || 'Lead';
    return `
    <div class="project-item ${p.id === state.activeProjectId ? 'active' : ''}" onclick="openProject('${p.id}')">
      ${projectThumbSVG(p)}
      <div class="project-item-text">
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="project-item-name">${escHtml(p.customer)}</div>
          <span class="proj-status-dot dot-${st.replace(/\s/g,'')}" title="${st}"></span>
        </div>
        <div class="project-item-meta">${p.type} · ${st} · ${new Date(p.createdAt).toLocaleDateString()}</div>
      </div>
      <button class="project-item-menu-btn" onclick="showProjectMenu('${p.id}',event)" title="Options" aria-label="Project options">⋯</button>
    </div>`;
  }).join('');
}

// ════════════════════════════
// RENDER: PROJECT VIEW
// ════════════════════════════
function openProject(projId, roomId) {
  state.activeProjectId = projId;
  const p = getProj(projId);
  state.activeRoomId = roomId || (p.rooms[0] && p.rooms[0].id);
  p.rooms.forEach(r => { if (!r.openings) r.openings = []; if (!r.appliances) r.appliances = []; });
  // Auto-set state tax rate
  if (p.state && STATE_TAX[p.state] != null) {
    const taxEl = document.getElementById('tax-pct');
    if (taxEl) taxEl.value = STATE_TAX[p.state];
  }
  if (!p.jobCosts) p.jobCosts = [
    { label:'Labor',        amount:'' },
    { label:'Demo / Removal', amount:'' },
    { label:'Incidentals',  amount:'' },
  ];
  // Reset zoom/pan so auto-fit fires on the new project's rooms
  vpState.floor = { zoom: 1, panX: 0, panY: 0 };
  vpState.elev  = { zoom: 1, panX: 0, panY: 0 };
  // Reset 3D camera so it re-frames the new room correctly
  if (iso3D) iso3D.initedCamera = false;
  persist(); renderProjectView();
}
function renderProjectView() {
  const p = activeProj();
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('project-view').classList.remove('hidden');
  document.getElementById('project-view').style.display = 'flex';
  document.getElementById('pv-name').textContent = p.customer;
  const si = getStyles().find(s => s.code === (p.style || getStyles()[0]?.code));
  document.getElementById('pv-meta').textContent = `${p.type} · Style: ${si ? si.code + ' – ' + si.name : ''} · Created ${new Date(p.createdAt).toLocaleDateString()}`;
  // Status pill
  const pill = document.getElementById('pv-status-pill');
  const status = p.status || 'Lead';
  pill.textContent = status;
  pill.className = 'status-pill status-' + status.replace(/\s/g,'');
  syncStylePanel(); renderSidebar(); renderRoomTabs();
  selectWall(state.activeWall); setViewMode(state.viewMode || 'floor');
}
function showWelcome() {
  document.getElementById('project-view').classList.add('hidden');
  document.getElementById('welcome').classList.remove('hidden');
}

// ════════════════════════════
// RENDER: ROOM TABS
// ════════════════════════════
function renderRoomTabs() {
  const p = activeProj();
  const bar = document.getElementById('room-tabs-bar');
  bar.querySelectorAll('.room-tab').forEach(t => t.remove());
  const addBtn = bar.querySelector('.add-room-btn');
  p.rooms.forEach(r => {
    const tab = document.createElement('button');
    tab.className = 'room-tab' + (r.id === state.activeRoomId ? ' active' : '');
    tab.innerHTML = escHtml(r.name) + (r.id === state.activeRoomId && p.rooms.length > 1
      ? ` <span class="room-tab-del" onclick="deleteRoom('${r.id}');event.stopPropagation();">×</span>` : '');
    tab.onclick = () => switchRoom(r.id);
    bar.insertBefore(tab, addBtn);
  });
  const _titleR = activeRoom();
  const _shapeTag = (_titleR && getLShapeData(_titleR)) ? ' ⌐' : '';
  document.getElementById('plan-title').textContent = `${p.customer} — ${_titleR ? _titleR.name : ''}${_shapeTag} Floor Plan`;
  renderWallButtons();
}

// ════════════════════════════
// RENDER: CABINET LIST
// ════════════════════════════
function renderCabinetList() {
  const r = activeRoom();
  const list = document.getElementById('cabinet-list');
  if (!r) { list.innerHTML = ''; return; }
  const wallCabs     = r.cabinets.filter(c => c.wall === state.activeWall);
  const wallOpenings = (r.openings || []).filter(o => o.wall === state.activeWall);
  const fit = roomFitProblems(r);
  const fitById = new Map(fit.map(x => [x.item.id, x.reason]));
  const fitTag = id => fitById.has(id) ? `<div class="cab-note" style="color:var(--danger);font-weight:600;">⚠ Doesn't fit: ${fitById.get(id)}</div>` : '';
  let html = '';
  if (fit.length) {
    html += `<div role="alert" style="border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12px;line-height:1.45;">
      <strong>⚠ ${fit.length} item${fit.length === 1 ? " doesn't" : "s don't"} fit this room</strong><br>
      ${fit.map(x => `#${x.item.itemNum || '?'} ${escHtml(itemLabel(x.item))} — ${escHtml(wallName(r, x.item.wall))}`).join('<br>')}
    </div>`;
  }
  if (wallOpenings.length) {
    html += '<div class="cab-wall-header">Openings</div>';
    html += wallOpenings.map(o => `
      <div class="opening-item">
        <div class="opening-item-info">${OPENING_LABELS[o.type] || o.type}</div>
        <div class="opening-item-dim">${o.width}" × ${o.height}" @ ${o.offset || 0}" from left</div>
        <button class="opening-remove" onclick="removeOpening('${o.id}')" aria-label="Remove opening">×</button>
      </div>`).join('');
  }
  if (wallCabs.length) {
    html += '<div class="cab-wall-header">Cabinets</div>';
    html += wallCabs.map(c => {
      const cat   = CATALOG[c.type];
      const cabPr = cabinetPrice(c);
      const price = pricingOn() ? `<div class="cab-price">${cabPr != null ? fmtMoney(cabPr) : '<span style="color:#64748b;font-style:italic;">No price set</span>'}</div>` : '';
      return `<div class="cab-item${c.id === selectedItemId ? ' selected' : ''}" onclick="selectItem('${c.id}')" style="cursor:pointer;">
        <div class="cab-color" style="background:${cat.color}"></div>
        <div class="cab-info">
          <div class="cab-name">${cat.label}</div>
          <div class="cab-dim">${fmtFrac(c.width)}W × ${fmtFrac(c.height)}H × ${c.depth}"D · ${fmtFrac(c.offset||0)} from left</div>
          ${c.note ? `<div class="cab-note">${escHtml(c.note)}</div>` : ''}
          ${fitTag(c.id)}
          ${price}
        </div>
        <button class="cab-remove" onclick="event.stopPropagation(); removeCabinet('${c.id}')" aria-label="Remove cabinet">×</button>
      </div>`;
    }).join('');
  }
  const wallApps = (r.appliances||[]).filter(a => a.wall === state.activeWall);
  if (wallApps.length) {
    html += '<div class="cab-wall-header">Appliances</div>';
    html += wallApps.map(a => {
      const acat = APPLIANCES[a.type];
      return `<div class="cab-item${a.id === selectedItemId ? ' selected' : ''}" onclick="selectItem('${a.id}')" style="cursor:pointer;">
        <div class="cab-color" style="background:${acat.color}"></div>
        <div class="cab-info">
          <div class="cab-name">${acat.label}</div>
          <div class="cab-dim">${a.width}"W · ${fmtFrac(a.offset||0)} from left</div>
          ${a.note ? `<div class="cab-note">${escHtml(a.note)}</div>` : ''}
          ${fitTag(a.id)}
        </div>
        <button class="cab-remove" onclick="event.stopPropagation(); removeAppliance('${a.id}')" aria-label="Remove appliance">×</button>
      </div>`;
    }).join('');
  }
  const allIslands = (r.islands || []);
  if (allIslands.length) {
    html += '<div class="cab-wall-header">Islands</div>';
    html += allIslands.map(i => `<div class="cab-item">
      <div class="cab-color" style="background:#0f766e"></div>
      <div class="cab-info">
        <div class="cab-name">${i.label || 'Island'}</div>
        <div class="cab-dim">${i.width}"W × ${i.depth}"D · pos ${i.x}", ${i.y}" from NW</div>
      </div>
      <button class="cab-remove" onclick="removeIsland('${i.id}')" aria-label="Remove island">×</button>
    </div>`).join('');
  }
  if (!wallCabs.length && !wallOpenings.length && !wallApps.length && !allIslands.length) html = '<div class="no-cabs">Nothing on this wall yet.<br>Add cabinets, appliances, or openings above.</div>';
  html = openSpaceListHTML(r, state.activeWall) + html;   // "Open space · Fill…" (fillgap.js)
  list.innerHTML = html;
}

