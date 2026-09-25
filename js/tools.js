// My Cabinet Planner — js/tools.js
// Dimension callouts, item tags, work triangle, cut list, room templates.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// DIMENSION CALLOUTS
// ════════════════════════════
function toggleDimensions() { setLayer('dims', !layers.dims); }  // same switch as Layers ▸ Dimensions

function toggleItemNumbers() { setLayer('itemNums', !layers.itemNums); renderCutList(); }  // = Layers ▸ Item numbers

// Small numbered hexagon tag, straddling the top edge of a cabinet/appliance —
// matches the callout convention on a real cabinet shop drawing.
function drawItemHexagon(ctx, cx, cy, num, PDF) {
  const rad = PDF ? 8 : 10;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = Math.PI/180 * (60*i - 90);
    const px = cx + rad*Math.cos(ang), py = cy + rad*Math.sin(ang);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = PDF ? '#FFFFFF' : '#FFFBEB';
  ctx.fill();
  ctx.strokeStyle = PDF ? '#1a1a1a' : '#B45309';
  ctx.lineWidth = PDF ? 1.2 : 1.5;
  ctx.stroke();
  ctx.fillStyle = PDF ? '#1a1a1a' : '#B45309';
  ctx.font = `700 ${PDF ? 9 : 10}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), cx, cy + 0.5);
  ctx.restore();
}

// Shared by the floor plan and elevation dimension renderers — draws one blue
// dimension line with tick marks and a labeled box at its midpoint.
function drawDimLine(ctx, x1, y1, x2, y2, label, isH, aboveOrLeft) {
  ctx.strokeStyle = '#1D4ED8'; ctx.fillStyle = '#1D4ED8';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  if (isH) {
    ctx.beginPath(); ctx.moveTo(x1,y1-5); ctx.lineTo(x1,y1+5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2,y2-5); ctx.lineTo(x2,y2+5); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x1-5,y1); ctx.lineTo(x1+5,y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2-5,y2); ctx.lineTo(x2+5,y2); ctx.stroke();
  }
  const mx=(x1+x2)/2, my=(y1+y2)/2;
  const bw=ctx.measureText(label).width+8, bh=14;
  let bx, by;
  if (isH) { bx=mx-bw/2; by=aboveOrLeft ? my-bh-3 : my+3; }
  else      { bx=aboveOrLeft ? mx-bw-3 : mx+3; by=my-bh/2; }
  ctx.fillStyle='#DBEAFE'; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='#1D4ED8'; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#1D4ED8'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(label, bx+bw/2, by+bh/2);
}

function drawDimensions(ctx, r, scale, RX, RY, RW, RH, _ld) {
  const walls = _ld ? ['north','south','east','west','step1','step2'] : ['north','south','east','west'];
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '600 9px sans-serif';
  ctx.textBaseline = 'middle';

  walls.forEach(wall => {
    const cabs = r.cabinets.filter(c=>c.wall===wall).sort((a,b)=>(a.offset||0)-(b.offset||0));
    if (!cabs.length) return;
    let dimY, dimX, isH, baseX, baseY, aboveOrLeft;
    if (wall==='north')      { dimY=RY-30;     isH=true;  baseX=RX; aboveOrLeft=true;  }
    else if (wall==='south') { dimY=RY+RH+30;  isH=true;  baseX=RX; aboveOrLeft=false; }
    else if (wall==='west')  { dimX=RX-30;     isH=false; baseY=RY; aboveOrLeft=true;  }
    else if (wall==='east')  { dimX=RX+RW+30;  isH=false; baseY=RY; aboveOrLeft=false; }
    else if (_ld) {
      const sw=_ld[wall];
      if (sw.isVertical) {
        isH=false; baseY=RY+sw.startY*scale;
        dimX = sw.depthRight ? RX+sw.x*scale+26 : RX+sw.x*scale-26;
        aboveOrLeft = !sw.depthRight;
      } else {
        isH=true; baseX=RX+sw.startX*scale;
        dimY = sw.depthDown ? RY+sw.y*scale+26 : RY+sw.y*scale-26;
        aboveOrLeft = !sw.depthDown;
      }
    } else return;

    cabs.forEach(cab => {
      const off=(cab.offset||0)*scale, cW=cab.width*scale;
      if (isH) {
        drawDimLine(ctx, baseX+off, dimY, baseX+off+cW, dimY, cab.width+'"', true, aboveOrLeft);
      } else {
        drawDimLine(ctx, dimX, baseY+off, dimX, baseY+off+cW, cab.width+'"', false, aboveOrLeft);
      }
    });
  });
  ctx.restore();
}

// Elevation dimensions: individual base cabinet widths + one overall total along
// the bottom, and a floor→counter→upper-cabinet-band→ceiling height chain on the
// left — same visual language as a real cabinet shop drawing.
function drawElevationDimensions(ctx, r, wall, scale, WX, WY, WW, floorY, eX) {
  const wallCabs = r.cabinets.filter(c => c.wall === wall);
  if (!wallCabs.length) return;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '600 9px sans-serif';
  ctx.textBaseline = 'middle';

  // ── Horizontal: individual base cabinet widths, just under the floor line ──
  const baseCabs = wallCabs
    .filter(c => ['base','sink','vanity','drawerBase','cornerBase','lazysusan','fridgePanel'].includes(c.type))
    .sort((a,b) => (a.offset||0)-(b.offset||0));
  const hY = floorY + 14;
  baseCabs.forEach(cab => {
    const x = eX(cab.offset||0, cab.width), w = cab.width*scale;
    drawDimLine(ctx, x, hY, x+w, hY, cab.width+'"', true, false);
  });

  // ── Horizontal: overall total across the occupied run, further below ──
  if (baseCabs.length) {
    const first = baseCabs[0], last = baseCabs[baseCabs.length-1];
    const firstOff = first.offset||0, lastEnd = (last.offset||0)+last.width;
    const x1 = eX(firstOff, 0), x2 = eX(lastEnd, 0);
    const lo = Math.min(x1,x2), hi = Math.max(x1,x2);
    const totalIn = Math.round((lastEnd - firstOff) * 100) / 100;
    drawDimLine(ctx, lo, hY+28, hi, hY+28, totalIn+'"', true, false);
  }

  // ── Vertical: floor → counter height, on the left ──
  const counterIn = 36;
  drawDimLine(ctx, WX-16, floorY, WX-16, floorY-counterIn*scale, counterIn+'"', false, true);

  // ── Vertical: floor → bottom of the lowest-hanging upper cabinet → its top ──
  const wallCabsOnly = wallCabs.filter(c => ['wall','diagWall'].includes(c.type));
  if (wallCabsOnly.length) {
    const bottomIn = Math.min(...wallCabsOnly.map(c => c.wallBottom != null ? c.wallBottom : 54));
    const rep = wallCabsOnly.find(c => (c.wallBottom != null ? c.wallBottom : 54) === bottomIn);
    const cat = CATALOG[rep.type];
    const hIn = rep.height || cat.heights?.[0] || 30;
    const topIn = bottomIn + hIn;
    drawDimLine(ctx, WX-34, floorY-bottomIn*scale, WX-34, floorY-topIn*scale, hIn+'"', false, true);
  }

  // ── Vertical: overall ceiling height, outermost ──
  const ceiling = r.ceilingHeight || 96;
  drawDimLine(ctx, WX-52, floorY, WX-52, WY, ceiling+'"', false, true);

  ctx.restore();
}

// ════════════════════════════
// WORK TRIANGLE
// ════════════════════════════
function toggleSidebar() {
  document.body.classList.toggle('sb-collapsed');
}
function togglePanel() {
  document.body.classList.toggle('panel-collapsed');
  // Let the canvas re-fit after the panel animates
  setTimeout(() => fitView(state.viewMode === 'elevation' ? 'elev' : 'floor'), 250);
}
function toggleSummary() {
  const el = document.getElementById('summary-table');
  const open = el.classList.toggle('summary-open');
  document.getElementById('summary-toggle-btn').classList.toggle('active', open);
}

// ════════════════════════════
// CUT LIST PANEL
// ════════════════════════════
function toggleCutList() {
  const el = document.getElementById('cutlist-panel');
  const open = el.classList.toggle('cutlist-open');
  document.querySelectorAll('#cutlist-btn, #cutlist-btn-elev').forEach(btn => btn.classList.toggle('active', open));
  if (open) renderCutList();
}

// Live-updating schedule mapping each item number to its cabinet/appliance —
// the companion to the hexagon tags drawn on the elevation. No-ops when the
// panel is closed so it's cheap to call from every add/remove/render path.
function renderCutList() {
  const el = document.getElementById('cutlist-panel');
  if (!el || !el.classList.contains('cutlist-open')) return;
  const r = activeRoom();
  if (!r) { el.innerHTML = ''; return; }
  ensureItemNumbers(r);

  const items = [
    ...r.cabinets.map(c => ({ ...c, kind: 'cabinet' })),
    ...(r.appliances||[]).map(a => ({ ...a, kind: 'appliance' })),
  ].filter(i => i.itemNum).sort((a,b) => a.itemNum - b.itemNum);

  if (!items.length) {
    el.innerHTML = `<h4>Cut List — ${escHtml(r.name)}</h4><p style="font-size:12px;color:var(--text-muted);">No cabinets or appliances yet.</p>`;
    return;
  }

  const rows = items.map(item => {
    const cat = item.kind === 'cabinet' ? CATALOG[item.type] : APPLIANCES[item.type];
    const label = cat ? cat.label : item.type;
    const depth = item.depth || (cat && cat.depth) || '—';
    const wallLabel = item.wall ? item.wall.charAt(0).toUpperCase()+item.wall.slice(1) : '—';
    return `<tr>
      <td><span class="cutlist-num">${item.itemNum}</span></td>
      <td>${escHtml(label)}</td>
      <td>${fmtFrac(item.width)}W × ${fmtFrac(item.height)}H × ${depth}"D</td>
      <td>${escHtml(wallLabel)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <h4>Cut List — ${escHtml(r.name)} (${items.length} item${items.length===1?'':'s'})</h4>
    <table class="cutlist-table">
      <thead><tr><th>#</th><th>Item</th><th>Size</th><th>Wall</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function toggleWorkTriangle() {
  showWorkTriangle = !showWorkTriangle;
  document.getElementById('tri-btn').classList.toggle('active', showWorkTriangle);
  renderCanvas();
}

function toggleMoreTools() {
  document.getElementById('tb-more-menu').classList.toggle('hidden');
}
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('tb-more-wrap');
  const menu = document.getElementById('tb-more-menu');
  if (wrap && menu && !menu.classList.contains('hidden') && !wrap.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

function getItemCentroid(item, wall, scale, RX, RY, RW, RH, depthIn) {
  const r = activeRoom(); if (!r) return null;
  const rc = itemRect(r, { ...item, wall }, depthIn); if (!rc) return null;
  return { x: RX + (rc.x + rc.w/2)*scale, y: RY + (rc.y + rc.h/2)*scale };
}

function drawWorkTriangle(ctx, r, scale, RX, RY, RW, RH) {
  let fridge=null, range=null, sink=null;
  for (const a of (r.appliances||[])) {
    const ac = APPLIANCES[a.type]; if (!ac) continue;
    const c = getItemCentroid(a, a.wall, scale, RX, RY, RW, RH, ac.depth);
    if (!c) continue;
    if ((a.type==='refrigerator'||a.type==='beverageCooler') && !fridge) fridge={...c};
    if ((a.type==='range'||a.type==='cooktop') && !range) range={...c};
  }
  for (const op of (r.openings||[])) {
    if (op.type==='sink-loc' && !sink) {
      const c = getItemCentroid(op, op.wall, scale, RX, RY, RW, RH, 2);
      if (c) sink={...c};
    }
  }
  const pts = [fridge, range, sink].filter(Boolean);
  if (pts.length < 2) {
    // Show hint if toggle is on but appliances missing
    ctx.save();
    ctx.fillStyle='rgba(22,163,74,0.15)'; ctx.strokeStyle='#16A34A'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
    ctx.strokeRect(RX+4, RY+4, 140, 22);
    ctx.setLineDash([]);
    ctx.fillStyle='#16A34A'; ctx.font='500 10px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('△ Add fridge, range & sink to see triangle', RX+10, RY+15);
    ctx.restore();
    return;
  }
  const pxPerIn = scale;
  let perim = 0;
  for (let i=0; i<pts.length; i++) {
    const a=pts[i], b=pts[(i+1)%pts.length];
    perim += Math.hypot(b.x-a.x, b.y-a.y) / pxPerIn;
  }
  const perimFt = perim / 12;
  let color;
  if (perimFt>=13&&perimFt<=26) color='#16A34A';
  else if (perimFt>=10&&perimFt<=30) color='#D97706';
  else color='#DC2626';

  ctx.save();
  ctx.strokeStyle=color; ctx.lineWidth=2; ctx.setLineDash([7,4]);
  ctx.fillStyle=color+'28';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);

  // Draw leg length labels
  for (let i=0; i<pts.length; i++) {
    const a=pts[i], b=pts[(i+1)%pts.length];
    const legIn = Math.hypot(b.x-a.x, b.y-a.y)/pxPerIn;
    const legFt = (legIn/12).toFixed(1);
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    const lbl=legFt+"'";
    const bw=ctx.measureText(lbl).width+8, bh=14;
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fillRect(mx-bw/2,my-bh/2,bw,bh);
    ctx.strokeStyle=color; ctx.lineWidth=1; ctx.strokeRect(mx-bw/2,my-bh/2,bw,bh);
    ctx.fillStyle=color; ctx.font='600 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(lbl, mx, my);
  }

  // Draw vertex dots + icons
  pts.forEach(pt => {
    ctx.beginPath(); ctx.arc(pt.x,pt.y,8,0,Math.PI*2);
    ctx.fillStyle=color+'CC'; ctx.fill();
    ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pt.icon||'●', pt.x, pt.y);
  });

  // Total + grade badge at centroid
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const grade=perimFt>=13&&perimFt<=26?'✓ Ideal':perimFt>=10&&perimFt<=30?'⚠ OK':'✗ Poor';
  const tot=`${perimFt.toFixed(1)}ft · ${grade}`;
  const bw2=ctx.measureText(tot).width+14, bh2=18;
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect ?
    ctx.roundRect(cx-bw2/2,cy-bh2/2,bw2,bh2,4) : ctx.rect(cx-bw2/2,cy-bh2/2,bw2,bh2);
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='600 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(tot, cx, cy);
  ctx.restore();
}

// ════════════════════════════
// ROOM TEMPLATES
// ════════════════════════════
const ROOM_TEMPLATES = [
  { id:'galley',   icon:'', name:'Galley',    desc:'Long narrow, 2 parallel walls',   north:144, south:144, east:72,  west:72,  ceiling:96, shape:'rect' },
  { id:'lshape',   icon:'', name:'L-Shape',   desc:'Two walls, one corner cut out',   north:144, south:144, east:120, west:120, ceiling:96, shape:'L',    corner:'NE', cutW:72, cutD:60 },
  { id:'ushape',   icon:'', name:'U-Shape',   desc:'Three walls of cabinets',         north:144, south:144, east:120, west:120, ceiling:96, shape:'rect' },
  { id:'gshape',   icon:'', name:'G-Shape',   desc:'Three walls + short peninsula',   north:168, south:168, east:144, west:144, ceiling:96, shape:'rect' },
  { id:'peninsula',icon:'', name:'Peninsula', desc:'Open plan with peninsula arm',    north:180, south:180, east:132, west:132, ceiling:96, shape:'rect' },
  { id:'blank',    icon:'', name:'Custom',    desc:'Start fresh, enter dimensions',   north:0,   south:0,   east:0,   west:0,   ceiling:96, shape:'rect' },
];

function openRoomTemplates() {
  const grid = document.getElementById('template-grid');
  grid.innerHTML = ROOM_TEMPLATES.map(t => `
    <div onclick="applyTemplate('${t.id}')"
         style="cursor:pointer;border:2px solid var(--border);border-radius:10px;padding:16px 10px;text-align:center;background:white;transition:border-color .15s,background .15s"
         onmouseover="this.style.borderColor='#2563EB';this.style.background='#EFF6FF'"
         onmouseout="this.style.borderColor='var(--border)';this.style.background='white'">
      <div style="font-size:26px;margin-bottom:6px">${t.icon}</div>
      <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px">${t.name}</div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.4">${t.desc}</div>
      ${t.north ? `<div style="margin-top:6px;font-size:10px;color:#64748b">${t.north}"×${t.east}"</div>` : ''}
    </div>`).join('');
  document.getElementById('modal-room-templates').classList.remove('hidden');
  document.getElementById('modal-room-templates').style.display = 'flex';
}
function closeRoomTemplates() {
  document.getElementById('modal-room-templates').classList.add('hidden');
  document.getElementById('modal-room-templates').style.display = '';
}
function applyTemplate(tId) {
  const t = ROOM_TEMPLATES.find(x=>x.id===tId); if (!t) return;
  closeRoomTemplates();
  document.getElementById('ar-name').value = '';
  setRoomDimFields('ar', t.north ? t : { ...ROOM_DIM_DEFAULTS, ceiling: t.ceiling });
  const isL = t.shape === 'L';
  document.getElementById('ar-shape-rect').checked = !isL;
  document.getElementById('ar-shape-L').checked    = isL;
  if (isL) {
    document.getElementById('ar-corner').value    = t.corner || 'NE';
    document.getElementById('ar-cut-width').value = t.cutW || 60;
    document.getElementById('ar-cut-depth').value = t.cutD || 60;
    document.getElementById('ar-lcut-fields').style.display = '';
  } else {
    document.getElementById('ar-lcut-fields').style.display = 'none';
  }
  openModal('modal-add-room');
  setTimeout(() => document.getElementById('ar-name').focus(), 50);
}

