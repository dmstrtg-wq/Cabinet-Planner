// My Cabinet Planner — js/floorplan.js
// Floor plan drawing, print ruler, measure tool, island clearance.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RULER HELPER
// ════════════════════════════
function drawRuler(ctx, originX, originY, totalInches, scale, vertical, fromFloor) {
  const RULER_W = 28;
  ctx.save();

  // Background
  ctx.fillStyle = '#f8fafc';
  if (!vertical) {
    ctx.fillRect(originX, originY - RULER_W, totalInches * scale, RULER_W);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(originX, originY - 1, totalInches * scale, 1);
  } else {
    ctx.fillRect(originX - RULER_W, originY, RULER_W, totalInches * scale);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(originX - 1, originY, 1, totalInches * scale);
  }

  // Determine tick density based on scale
  const minPixPerTick = 18;
  const tickIntervals = [1, 2, 3, 6, 12, 24];
  const tickStep = tickIntervals.find(t => t * scale >= minPixPerTick) || 24;

  for (let inch = 0; inch <= totalInches; inch += tickStep) {
    const px = inch * scale;
    const isFoot   = inch % 12 === 0;
    const isHalf   = inch % 6  === 0 && !isFoot;
    const tickLen  = isFoot ? 14 : isHalf ? 8 : 5;
    const showLabel = isFoot;
    const ft  = Math.floor(inch / 12);
    const inn = inch % 12;
    const label = fromFloor
      ? (() => { const ri = totalInches - inch; const rft = Math.floor(ri/12); const rin = ri%12; return rin ? `${rft}'${rin}"` : `${rft}'`; })()
      : (inn === 0 ? `${ft}'` : `${ft}'${inn}"`);

    ctx.strokeStyle = isFoot ? '#64748b' : '#94a3b8';
    ctx.lineWidth   = isFoot ? 1 : 0.6;

    if (!vertical) {
      ctx.beginPath(); ctx.moveTo(originX+px, originY-tickLen); ctx.lineTo(originX+px, originY); ctx.stroke();
      if (showLabel) {
        ctx.fillStyle = '#334155'; ctx.font = `600 9px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(label, originX+px, originY-RULER_W+3);
      }
    } else {
      ctx.beginPath(); ctx.moveTo(originX-tickLen, originY+px); ctx.lineTo(originX, originY+px); ctx.stroke();
      if (showLabel) {
        ctx.fillStyle = '#334155'; ctx.font = `600 9px sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(label, originX-4, originY+px);
      }
    }
  }
  ctx.restore();
}

// ════════════════════════════
// MEASURE TOOL
// ════════════════════════════
const measureState = { active: false, pending: null, lines: [], hoverPt: null };

function toggleMeasure() {
  measureState.active = !measureState.active;
  measureState.pending = null;
  measureState.hoverPt = null;
  document.getElementById('measure-btn').classList.toggle('active', measureState.active);
  const canvas = document.getElementById('floor-plan');
  canvas.style.cursor = measureState.active ? 'crosshair' : 'default';
  renderCanvas();
}

function clearMeasurements() {
  measureState.lines = [];
  measureState.pending = null;
  measureState.hoverPt = null;
  document.getElementById('measure-clear-btn').style.display = 'none';
  renderCanvas();
}

function canvasPtToRoom(clientX, clientY, canvas, RX, RY, scale) {
  const rect = canvas.getBoundingClientRect();
  // Account for CSS display size vs canvas internal resolution
  const cssScaleX = canvas.width  / rect.width;
  const cssScaleY = canvas.height / rect.height;
  const mx = (clientX - rect.left) * cssScaleX;
  const my = (clientY - rect.top)  * cssScaleY;
  return {
    x: Math.round((mx - RX) / scale),
    y: Math.round((my - RY) / scale)
  };
}

function measureDist(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  return Math.round(Math.sqrt(dx*dx + dy*dy));
}

function fmtMeasure(inches) {
  const ft = Math.floor(inches / 12);
  const inn = inches % 12;
  if (ft === 0) return `${inn}"`;
  if (inn === 0) return `${ft}'`;
  return `${ft}' ${inn}"`;
}

function drawMeasurements(ctx, RX, RY, scale) {
  const allLines = [...measureState.lines];
  // Add live rubber-band if pending + hover
  if (measureState.pending && measureState.hoverPt) {
    allLines.push({ p1: measureState.pending, p2: measureState.hoverPt, live: true });
  }
  allLines.forEach(line => {
    const x1 = RX + line.p1.x * scale, y1 = RY + line.p1.y * scale;
    const x2 = RX + line.p2.x * scale, y2 = RY + line.p2.y * scale;
    const dist = measureDist(line.p1, line.p2);
    const mx = (x1+x2)/2, my = (y1+y2)/2;

    // Line
    ctx.save();
    ctx.strokeStyle = line.live ? '#3b82f6' : '#1e40af';
    ctx.lineWidth   = line.live ? 1.5 : 2;
    ctx.setLineDash(line.live ? [6,4] : []);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.setLineDash([]);

    // End-point ticks
    const ang = Math.atan2(y2-y1, x2-x1) + Math.PI/2;
    [x1,x2].forEach((ex,i) => {
      const ey = i===0 ? y1 : y2;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(ang)*6, ey + Math.sin(ang)*6);
      ctx.lineTo(ex - Math.cos(ang)*6, ey - Math.sin(ang)*6);
      ctx.stroke();
    });

    // Distance label pill
    const label = fmtMeasure(dist);
    ctx.font = 'bold 11px sans-serif';
    const tw = ctx.measureText(label).width;
    const pw = tw + 14, ph = 20, pr = 6;
    ctx.fillStyle = line.live ? '#3b82f6' : '#1e40af';
    ctx.beginPath();
    ctx.roundRect(mx-pw/2, my-ph/2, pw, ph, pr);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my);

    // Start dot
    ctx.fillStyle = line.live ? '#3b82f6' : '#1e40af';
    ctx.beginPath(); ctx.arc(x1,y1,4,0,Math.PI*2); ctx.fill();
    if (!line.live) { ctx.beginPath(); ctx.arc(x2,y2,4,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  });

  // Pending start dot pulse
  if (measureState.pending && !measureState.hoverPt) {
    const px = RX + measureState.pending.x * scale;
    const py = RY + measureState.pending.y * scale;
    ctx.save();
    ctx.fillStyle = '#3b82f6'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(px,py,10,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1e40af';
    ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ════════════════════════════
// ISLAND CLEARANCE HELPER
// ════════════════════════════
function calcIslandClearance(isl, r) {
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  const ix1 = isl.x, iy1 = isl.y;
  const ix2 = isl.x + isl.width, iy2 = isl.y + isl.depth;

  // Rect-to-rect axis-aligned clearance
  function rectClear(ax1,ay1,ax2,ay2, bx1,by1,bx2,by2) {
    const dx = Math.max(0, Math.max(bx1-ax2, ax1-bx2));
    const dy = Math.max(0, Math.max(by1-ay2, ay1-by2));
    if (dx===0 && dy===0) return 0;
    if (dx===0) return dy;
    if (dy===0) return dx;
    return Math.sqrt(dx*dx + dy*dy);
  }

  let minClear = Math.min(ix1, iy1, roomW-ix2, roomH-iy2); // wall distances

  // Cabinet footprints
  (r.cabinets||[]).forEach(cab => {
    const cat = CATALOG[cab.type]; if (!cat) return;
    const off = cab.offset||0, dep = cab.depth||24, w = cab.width;
    let cx1,cy1,cx2,cy2;
    if      (cab.wall==='north') { cx1=off; cy1=0;        cx2=off+w; cy2=dep; }
    else if (cab.wall==='south') { cx1=off; cy1=roomH-dep; cx2=off+w; cy2=roomH; }
    else if (cab.wall==='west')  { cx1=0;   cy1=off;       cx2=dep;   cy2=off+w; }
    else                         { cx1=roomW-dep; cy1=off; cx2=roomW; cy2=off+w; }
    minClear = Math.min(minClear, rectClear(ix1,iy1,ix2,iy2, cx1,cy1,cx2,cy2));
  });

  // Appliance footprints
  (r.appliances||[]).forEach(app => {
    const acat = APPLIANCES[app.type]; if (!acat || acat.wallMount) return;
    const off = app.offset||0, dep = acat.depth, w = app.width;
    let cx1,cy1,cx2,cy2;
    if      (app.wall==='north') { cx1=off; cy1=0;        cx2=off+w; cy2=dep; }
    else if (app.wall==='south') { cx1=off; cy1=roomH-dep; cx2=off+w; cy2=roomH; }
    else if (app.wall==='west')  { cx1=0;   cy1=off;       cx2=dep;   cy2=off+w; }
    else                         { cx1=roomW-dep; cy1=off; cx2=roomW; cy2=off+w; }
    minClear = Math.min(minClear, rectClear(ix1,iy1,ix2,iy2, cx1,cy1,cx2,cy2));
  });

  // Other islands
  (r.islands||[]).forEach(other => {
    if (other.id === isl.id) return;
    minClear = Math.min(minClear, rectClear(ix1,iy1,ix2,iy2, other.x,other.y,other.x+other.width,other.y+other.depth));
  });

  return Math.round(Math.max(0, minClear));
}

// ════════════════════════════
// RENDER: FLOOR PLAN
// ════════════════════════════
function renderCanvas() {
  const canvas = document.getElementById('floor-plan');
  const ctx = canvas.getContext('2d');
  const r = activeRoom();
  if (!r) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
  const scale    = CANVAS_SCALE;
  const viewMode = document.getElementById('view-sel').value;
  const roomW = Math.max(r.walls.north, r.walls.south, 48);
  const roomH = Math.max(r.walls.east,  r.walls.west,  48);
  const PDF = !!window._pdfMode; // true only while exportPDF/printFloorPlan capture this canvas
  const PAD = 68;
  canvas.width  = Math.max(roomW * scale + PAD*2, 380);
  canvas.height = Math.max(roomH * scale + PAD*2, 280);
  const RX = PAD, RY = PAD, RW = roomW*scale, RH = roomH*scale;
  vpGeom.floor = { originX: RX, originY: RY, wIn: roomW, hIn: roomH, scale, vertUp: false };

  // Canvas background
  ctx.fillStyle = '#F1F5F9'; ctx.fillRect(0,0,canvas.width,canvas.height);

  // L-shape helper — build room polygon path
  const _ld = getLShapeData(r);
  function buildRoomPath() {
    ctx.beginPath();
    if (_ld) {
      _ld.polygon.forEach(([px,py],i) => {
        const cx = RX+px*scale, cy = RY+py*scale;
        i===0 ? ctx.moveTo(cx,cy) : ctx.lineTo(cx,cy);
      });
    } else {
      ctx.rect(RX,RY,RW,RH);
    }
    ctx.closePath();
  }

  // Room fill (white, clipped to polygon)
  buildRoomPath(); ctx.fillStyle = '#FFFFFF'; ctx.fill();

  // L-shape: hatch the cut corner so it's clearly "not room"
  if (_ld) {
    const _c = _ld.corner, _sw1 = _ld.step1, _sw2 = _ld.step2;
    let _cx, _cy, _cw, _ch;
    if      (_c==='NE') { _cx=RX+_sw1.x*scale;  _cy=RY;                    _cw=_sw2.length*scale; _ch=_sw2.y*scale;      }
    else if (_c==='NW') { _cx=RX;                _cy=RY;                    _cw=_sw1.x*scale;      _ch=_sw2.y*scale;      }
    else if (_c==='SE') { _cx=RX+_sw1.x*scale;  _cy=RY+_sw2.y*scale;       _cw=_sw2.length*scale; _ch=RH-_sw2.y*scale;   }
    else                { _cx=RX;                _cy=RY+_sw2.y*scale;       _cw=_sw1.x*scale;      _ch=RH-_sw2.y*scale;   }
    // Slightly darker background
    ctx.fillStyle = '#D9E2EE'; ctx.fillRect(_cx, _cy, _cw, _ch);
    // Diagonal hatch lines to mark as "not room"
    ctx.save();
    ctx.beginPath(); ctx.rect(_cx, _cy, _cw, _ch); ctx.clip();
    ctx.strokeStyle = '#B8C8DC'; ctx.lineWidth = 1;
    const _hStep = Math.max(14, scale*3);
    for (let _i = -_ch; _i < _cw + _ch; _i += _hStep) {
      ctx.beginPath(); ctx.moveTo(_cx + _i, _cy); ctx.lineTo(_cx + _i + _ch, _cy + _ch); ctx.stroke();
    }
    ctx.restore();
  }

  // Grid clipped to room shape
  const GRID12 = 12*scale, GRID6 = 6*scale;
  ctx.save(); buildRoomPath(); ctx.clip();
  // Minor 6" grid
  ctx.strokeStyle = '#F0F4F8'; ctx.lineWidth = 0.5;
  for (let x = RX; x <= RX+RW; x += GRID6) { ctx.beginPath(); ctx.moveTo(x,RY); ctx.lineTo(x,RY+RH); ctx.stroke(); }
  for (let y = RY; y <= RY+RH; y += GRID6) { ctx.beginPath(); ctx.moveTo(RX,y); ctx.lineTo(RX+RW,y); ctx.stroke(); }
  // Major 12" (foot) grid
  ctx.strokeStyle = '#DDE3EC'; ctx.lineWidth = 0.8;
  for (let x = RX; x <= RX+RW; x += GRID12) { ctx.beginPath(); ctx.moveTo(x,RY); ctx.lineTo(x,RY+RH); ctx.stroke(); }
  for (let y = RY; y <= RY+RH; y += GRID12) { ctx.beginPath(); ctx.moveTo(RX,y); ctx.lineTo(RX+RW,y); ctx.stroke(); }
  ctx.restore();

  const _fitIds = new Set(roomFitProblems(r).map(x => x.item.id));
  const _flagRects = [];
  let cabs = r.cabinets;
  if (viewMode === 'base') cabs = cabs.filter(c => ['base','sink','vanity','drawerBase','cornerBase','lazysusan','filler3','filler6','fridgePanel'].includes(c.type));
  if (viewMode === 'wall') cabs = cabs.filter(c => ['wall','diagWall'].includes(c.type));

  function drawCabOnFloor(cab, wall) {
    const cat = CATALOG[cab.type];
    const cW = cab.width*scale, cD = cab.depth*scale;
    const cabOff = (cab.offset||0)*scale;
    const isActive = wall === state.activeWall;
    const isCorner = cab.type === 'cornerBase';
    const isLazySusan = cab.type === 'lazysusan';
    const isDiagWall = cab.type === 'diagWall';
    const effD = cD; // always use actual depth (24")
    const _rc = itemRect(r, { ...cab, wall }, cab.depth); if (!_rc) return;
    const x = RX + _rc.x*scale, y = RY + _rc.y*scale, w = _rc.w*scale, h = _rc.h*scale;
    if (_fitIds.has(cab.id)) _flagRects.push({x, y, w, h});

    if (isCorner) {
      ctx.globalAlpha = 0.88; ctx.fillStyle = cat.color;
      ctx.beginPath();
      if (wall==='north') { ctx.moveTo(x,y); ctx.lineTo(x+cW,y); ctx.lineTo(x+cW,y+cD*0.35); ctx.lineTo(x+cW*0.35,y+cD); ctx.lineTo(x,y+cD); }
      else if (wall==='south') { ctx.moveTo(x,y+cD); ctx.lineTo(x+cW,y+cD); ctx.lineTo(x+cW,y+cD*0.65); ctx.lineTo(x+cW*0.35,y); ctx.lineTo(x,y); }
      else if (wall==='west')  { ctx.moveTo(x,y); ctx.lineTo(x+cD,y); ctx.lineTo(x+cD,y+cW*0.35); ctx.lineTo(x+cD*0.35,y+cW); ctx.lineTo(x,y+cW); }
      else { ctx.moveTo(x+cD,y); ctx.lineTo(x,y); ctx.lineTo(x,y+cW*0.35); ctx.lineTo(x+cD*0.65,y+cW); ctx.lineTo(x+cD,y+cW); }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.2)'; ctx.lineWidth = isActive ? 2.5 : 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([3,2]);
      ctx.beginPath();
      if (wall==='north') { ctx.moveTo(x+cW,y+cD*0.35); ctx.lineTo(x+cW*0.35,y+cD); }
      else if (wall==='south') { ctx.moveTo(x+cW,y+cD*0.65); ctx.lineTo(x+cW*0.35,y); }
      else if (wall==='west')  { ctx.moveTo(x+cD,y+cW*0.35); ctx.lineTo(x+cD*0.35,y+cW); }
      else { ctx.moveTo(x,y+cW*0.35); ctx.lineTo(x+cD*0.65,y+cW); }
      ctx.stroke(); ctx.setLineDash([]);
    } else if (isLazySusan) {
      // L-shaped footprint: 33" along placed wall × 24" deep + 33" return on adjacent wall × 24" deep
      ctx.globalAlpha = 0.88; ctx.fillStyle = cat.color;
      ctx.beginPath();
      if (wall==='north') {
        ctx.moveTo(x,    y);    ctx.lineTo(x+cW, y);
        ctx.lineTo(x+cW, y+cD); ctx.lineTo(x+cD, y+cD);
        ctx.lineTo(x+cD, y+cW); ctx.lineTo(x,    y+cW);
      } else if (wall==='south') {
        const bY = y+cD;
        ctx.moveTo(x,    bY);    ctx.lineTo(x+cW,  bY);
        ctx.lineTo(x+cW, bY-cD); ctx.lineTo(x+cD,  bY-cD);
        ctx.lineTo(x+cD, bY-cW); ctx.lineTo(x,     bY-cW);
      } else if (wall==='west') {
        ctx.moveTo(x,    y);    ctx.lineTo(x+cW, y);
        ctx.lineTo(x+cW, y+cD); ctx.lineTo(x+cD, y+cD);
        ctx.lineTo(x+cD, y+cW); ctx.lineTo(x,    y+cW);
      } else {
        const rX = x+cD;
        ctx.moveTo(rX,    y);    ctx.lineTo(rX-cW, y);
        ctx.lineTo(rX-cW, y+cD); ctx.lineTo(rX-cD, y+cD);
        ctx.lineTo(rX-cD, y+cW); ctx.lineTo(rX,    y+cW);
      }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = isActive ? 2 : 1.5; ctx.stroke();
      // Rotating shelf: two concentric circles + cross lines centered in the corner 24"×24" square
      const rCX = (wall==='east') ? x+cD - cD*0.5 : x + cD*0.5;
      const rCY = y + cD*0.5;
      const r1 = cD*0.38, r2 = cD*0.16;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(rCX, rCY, r1, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(rCX, rCY, r2, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([2,2]);
      ctx.beginPath(); ctx.moveTo(rCX-r1, rCY); ctx.lineTo(rCX+r1, rCY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rCX, rCY-r1); ctx.lineTo(rCX, rCY+r1); ctx.stroke();
      ctx.setLineDash([]);
    } else if (isDiagWall) {
      // Diagonal corner wall: L-shape footprint (two wings) with a diagonal front face
      // wallD = standard wall cabinet protrusion depth (12") for each wing
      const wallD = Math.min(12 * scale, cW * 0.45, cD * 0.45);
      ctx.globalAlpha = 0.55; ctx.fillStyle = cat.color;
      ctx.beginPath();
      if (wall==='north') {
        // NW corner: north wing (cW east, wallD south) + west return (wallD east, cD south)
        ctx.moveTo(x, y);         ctx.lineTo(x+cW, y);
        ctx.lineTo(x+cW, y+wallD); ctx.lineTo(x+wallD, y+cD);
        ctx.lineTo(x, y+cD);
      } else if (wall==='south') {
        const bY = y+cD;
        ctx.moveTo(x, bY);          ctx.lineTo(x+cW, bY);
        ctx.lineTo(x+cW, bY-wallD); ctx.lineTo(x+wallD, y);
        ctx.lineTo(x, y);
      } else if (wall==='west') {
        ctx.moveTo(x, y);         ctx.lineTo(x, y+cW);
        ctx.lineTo(x+wallD, y+cW); ctx.lineTo(x+cD, y+wallD);
        ctx.lineTo(x+cD, y);
      } else {
        const rX = x+cD;
        ctx.moveTo(rX, y);          ctx.lineTo(rX, y+cW);
        ctx.lineTo(rX-wallD, y+cW); ctx.lineTo(x, y+wallD);
        ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.2)'; ctx.lineWidth = isActive ? 2.5 : 1.5; ctx.stroke();
      // Solid diagonal front face line
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath();
      if      (wall==='north') { ctx.moveTo(x+cW, y+wallD);    ctx.lineTo(x+wallD, y+cD);    }
      else if (wall==='south') { const bY=y+cD; ctx.moveTo(x+cW, bY-wallD); ctx.lineTo(x+wallD, y); }
      else if (wall==='west')  { ctx.moveTo(x+wallD, y+cW);    ctx.lineTo(x+cD, y+wallD);    }
      else                     { const rX=x+cD; ctx.moveTo(rX-wallD, y+cW); ctx.lineTo(x, y+wallD); }
      ctx.stroke();
    } else if (cab.type === 'wall') {
      // NKBA convention: upper/wall cabinets shown as dashed overlay in floor plan
      ctx.globalAlpha = 0.15; ctx.fillStyle = cat.color; ctx.fillRect(x,y,w,h); ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.55)';
      ctx.lineWidth = isActive ? 2 : 1.2; ctx.setLineDash([5,3]);
      ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = 0.88; ctx.fillStyle = cat.color; ctx.fillRect(x,y,w,h); ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? cat.color : 'rgba(0,0,0,0.12)'; ctx.lineWidth = isActive ? 2 : 1; ctx.strokeRect(x,y,w,h);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x+2,y+h*0.45); ctx.lineTo(x+w-2,y+h*0.45); ctx.stroke();
    }
    const isDark = ['#3B82F6','#1D4ED8','#06B6D4','#A855F7','#F59E0B','#F97316'].includes(cat.color);
    ctx.fillStyle = isDark ? '#fff' : '#1e293b';
    const fs = Math.max(8, Math.min(scale*2.0, 11));
    ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (isCorner) {
      if      (wall==='north') ctx.fillText(`${cab.width}"`, x+cW*0.25, y+cD*0.35);
      else if (wall==='south') ctx.fillText(`${cab.width}"`, x+cW*0.25, y+cD*0.65);
      else if (wall==='west')  ctx.fillText(`${cab.width}"`, x+cD*0.35, y+cW*0.25);
      else                     ctx.fillText(`${cab.width}"`, x+cD*0.65, y+cW*0.25);
    } else if (isLazySusan) {
      // Label in the middle of the L's long wing
      if (wall==='east') ctx.fillText(`LS${cab.width}"`, x+cD - cW*0.65, y+cW*0.55);
      else               ctx.fillText(`LS${cab.width}"`, x+cW*0.65, y+cW*0.55);
    } else if (isDiagWall) {
      // Label in the centre of the placed-wall wing
      const wallD2 = Math.min(12*scale, cW*0.45, cD*0.45);
      if      (wall==='north') ctx.fillText(`DCW${cab.width}"`, x+cW/2, y+wallD2/2);
      else if (wall==='south') ctx.fillText(`DCW${cab.width}"`, x+cW/2, y+cD-wallD2/2);
      else if (wall==='west')  ctx.fillText(`DCW${cab.width}"`, x+wallD2/2, y+cW/2);
      else                     ctx.fillText(`DCW${cab.width}"`, x+cD-wallD2/2, y+cW/2);
    } else { ctx.fillText(`${cab.width}"`, x+w/2, y+h/2); }
  }

  function drawAppOnFloor(app, wall) {
    const acat = APPLIANCES[app.type]; if (!acat) return;
    const aW = app.width*scale, aD = acat.depth*scale, aOff = (app.offset||0)*scale;
    const _ra = itemRect(r, { ...app, wall }, acat.depth); if (!_ra) return;
    const x = RX + _ra.x*scale, y = RY + _ra.y*scale, w = _ra.w*scale, h = _ra.h*scale;
    if (_fitIds.has(app.id)) _flagRects.push({x, y, w, h});
    ctx.globalAlpha=0.9; ctx.fillStyle=acat.color; ctx.fillRect(x,y,w,h); ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.strokeRect(x,y,w,h);
    // Burner circles for range/cooktop
    if (app.type==='range'||app.type==='cooktop') {
      const r2=Math.min(w,h)*0.12;
      [[0.28,0.3],[0.72,0.3],[0.28,0.7],[0.72,0.7]].forEach(([fx,fy])=>{
        ctx.beginPath(); ctx.arc(x+w*fx,y+h*fy,r2,0,Math.PI*2);
        ctx.fillStyle='#6B7280'; ctx.fill();
        ctx.strokeStyle='#9CA3AF'; ctx.lineWidth=0.6; ctx.stroke();
      });
    }
    // Door line for fridge
    if (app.type==='refrigerator') {
      ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1; ctx.setLineDash([2,2]);
      if (wall==='north'||wall==='south') { ctx.beginPath(); ctx.moveTo(x+w*0.5,y); ctx.lineTo(x+w*0.5,y+h); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x,y+h*0.5); ctx.lineTo(x+w,y+h*0.5); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(7,Math.min(scale*1.8,10))}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(acat.abbr, x+w/2, y+h/2);
  }

  const _wallList = _ld ? ['north','south','east','west','step1','step2'] : ['north','south','east','west'];
  _wallList.forEach(wall => {
    // Base cabs first (solid), then wall/upper cabs as dashed overlay on top (NKBA convention)
    cabs.filter(c => c.wall===wall && c.type!=='wall').forEach(cab => drawCabOnFloor(cab,wall));
    cabs.filter(c => c.wall===wall && c.type==='wall').forEach(cab => drawCabOnFloor(cab,wall));
    (r.appliances||[]).filter(a => a.wall===wall).forEach(app => drawAppOnFloor(app,wall));
  });

  (r.openings||[]).forEach(op => {
    const wall = op.wall, oW = op.width*scale, opOffset = (op.offset||0)*scale;
    let ox,oy,fw,fh;
    if      (wall==='north') { ox=RX+opOffset; oy=RY;      fw=oW; fh=8; }
    else if (wall==='south') { ox=RX+opOffset; oy=RY+RH-8; fw=oW; fh=8; }
    else if (wall==='west')  { ox=RX;          oy=RY+opOffset; fw=8; fh=oW; }
    else                     { ox=RX+RW-8;     oy=RY+opOffset; fw=8; fh=oW; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(ox,oy,fw,fh);
    const opColors = { door:'#d97706', window:'#0284c7', 'sink-loc':'#0891b2', arch:'#7c3aed' };
    ctx.strokeStyle = opColors[op.type]||'#d97706'; ctx.lineWidth = 2; ctx.setLineDash([3,3]);
    ctx.strokeRect(ox,oy,fw,fh); ctx.setLineDash([]);
    const icons = { door:'D', window:'W', 'sink-loc':'S', arch:'O' };
    ctx.fillStyle = opColors[op.type]||'#d97706'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icons[op.type]||'?', ox+fw/2, oy+fh/2);
  });

  // Draw measurements overlay (before islands so islands render on top)
  const { RX: mRX, RY: mRY } = { RX, RY };
  drawMeasurements(ctx, RX, RY, scale);

  // Draw islands with clearance indicator
  (r.islands || []).forEach(isl => {
    const ix = RX + isl.x * scale;
    const iy = RY + isl.y * scale;
    const iw = isl.width  * scale;
    const ih = isl.depth  * scale;
    const clearIn = calcIslandClearance(isl, r);
    // Color based on clearance: <24"=red, 24-36"=yellow, >=36"=green
    const clearOk    = clearIn >= 36;
    const clearWarn  = clearIn >= 24 && clearIn < 36;
    const borderCol  = clearOk ? '#16a34a' : clearWarn ? '#d97706' : '#dc2626';
    const fillCol    = clearOk ? '#D97706' : clearWarn ? '#D97706' : '#D97706'; // keep amber fill
    const glowCol    = clearOk ? 'rgba(22,163,74,0.2)' : clearWarn ? 'rgba(217,119,6,0.2)' : 'rgba(220,38,38,0.25)';

    // Clearance glow ring
    ctx.save();
    ctx.strokeStyle = borderCol; ctx.lineWidth = 3; ctx.globalAlpha = 0.5;
    ctx.setLineDash([4,3]);
    ctx.strokeRect(ix-6, iy-6, iw+12, ih+12);
    ctx.setLineDash([]); ctx.restore();

    // Shadow + fill
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillStyle = fillCol; ctx.globalAlpha = 0.85;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();
    ctx.globalAlpha = 1;

    // Solid border in clearance color
    ctx.strokeStyle = borderCol; ctx.lineWidth = 2.5; ctx.setLineDash([]);
    ctx.strokeRect(ix, iy, iw, ih);

    // Counter edge lines
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ix+3, iy+3); ctx.lineTo(ix+iw-3, iy+3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix+3, iy+ih-3); ctx.lineTo(ix+iw-3, iy+ih-3); ctx.stroke();

    // Label
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, Math.min(scale*2,12))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(isl.label || 'Island', ix+iw/2, iy+ih/2 - 7);
    ctx.font = `${Math.max(8, Math.min(scale*1.6,10))}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`${isl.width}"×${isl.depth}"`, ix+iw/2, iy+ih/2 + 6);

    // Clearance badge — bottom center of island
    const badgeTxt = clearOk ? `✓ ${clearIn}" clear` : `⚠ ${clearIn}" clear`;
    const badgeCol = clearOk ? '#16a34a' : clearWarn ? '#d97706' : '#dc2626';
    ctx.fillStyle = badgeCol;
    ctx.font = `bold ${Math.max(8, Math.min(scale*1.5,10))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(badgeTxt, ix+iw/2, iy+ih+5);
  });

  // Room border — double line for a clean wall look
  if (_ld) {
    buildRoomPath(); ctx.strokeStyle = '#B0BCCE'; ctx.lineWidth = 5; ctx.stroke();
    buildRoomPath(); ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3; ctx.stroke();
    // Draw inner wall corner indicator lines
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; ctx.setLineDash([5,4]);
    if (_ld.step1.isVertical) {
      const _s1x = RX + _ld.step1.x * scale;
      ctx.beginPath(); ctx.moveTo(_s1x, RY + _ld.step1.startY*scale); ctx.lineTo(_s1x, RY + (_ld.step1.startY+_ld.step1.length)*scale); ctx.stroke();
    }
    if (!_ld.step2.isVertical) {
      const _s2y = RY + _ld.step2.y * scale;
      ctx.beginPath(); ctx.moveTo(RX + _ld.step2.startX*scale, _s2y); ctx.lineTo(RX + (_ld.step2.startX+_ld.step2.length)*scale, _s2y); ctx.stroke();
    }
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 1; ctx.strokeRect(RX-2,RY-2,RW+4,RH+4);
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3; ctx.strokeRect(RX,RY,RW,RH);
  }

  // Active wall highlight — orange stroke on selected wall
  if (state.activeWall) {
    let seg = null;
    if (!_ld) {
      const wallSegs = {
        north: [[RX, RY],    [RX+RW, RY]],
        south: [[RX, RY+RH], [RX+RW, RY+RH]],
        west:  [[RX, RY],    [RX,    RY+RH]],
        east:  [[RX+RW, RY], [RX+RW, RY+RH]]
      };
      seg = wallSegs[state.activeWall] || null;
    } else if (state.activeWall === 'step1' && _ld.step1.isVertical) {
      const _s1x = RX + _ld.step1.x * scale;
      seg = [[_s1x, RY + _ld.step1.startY*scale], [_s1x, RY + (_ld.step1.startY+_ld.step1.length)*scale]];
    } else if (state.activeWall === 'step2' && !_ld.step2.isVertical) {
      const _s2y = RY + _ld.step2.y * scale;
      seg = [[RX + _ld.step2.startX*scale, _s2y], [RX + (_ld.step2.startX+_ld.step2.length)*scale, _s2y]];
    }
    if (seg) {
      ctx.save();
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(13,148,136,0.4)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(seg[0][0], seg[0][1]);
      ctx.lineTo(seg[1][0], seg[1][1]);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Wall dimension labels
  ctx.fillStyle = '#1e293b';
  const df = Math.max(10, scale*2.2); ctx.font = `700 ${df}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (_ld) {
    // L-shape: show bounding box dims + cut dims
    const _cW = _ld.cutW, _cD = _ld.cutD;
    ctx.fillText(fmtIn(roomW), RX+RW/2, RY-36);
    ctx.fillText(fmtIn(roomH), RX+RW/2, RY+RH+36);
    ctx.save(); ctx.translate(RX-36, RY+RH/2); ctx.rotate(-Math.PI/2); ctx.fillText(fmtIn(roomH),0,0); ctx.restore();
    ctx.save(); ctx.translate(RX+RW+36, RY+RH/2); ctx.rotate(Math.PI/2); ctx.fillText(fmtIn(roomW),0,0); ctx.restore();
    // Cut dimension labels near inner walls
    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${Math.max(9,scale*1.8)}px sans-serif`;
    if (_ld.step1.isVertical) {
      const _s1x = RX + _ld.step1.x * scale;
      const _s1mid = RY + (_ld.step1.startY + _ld.step1.length/2) * scale;
      ctx.save(); ctx.translate(_s1x + (_ld.step1.depthRight ? 14 : -14), _s1mid); ctx.rotate(-Math.PI/2);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(fmtIn(_ld.step1.length),0,0); ctx.restore();
    }
    if (!_ld.step2.isVertical) {
      const _s2y = RY + _ld.step2.y * scale;
      const _s2mid = RX + (_ld.step2.startX + _ld.step2.length/2) * scale;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(fmtIn(_ld.step2.length), _s2mid, _s2y + (_ld.step2.depthDown ? 14 : -14));
    }
    ctx.fillStyle = '#1e293b'; ctx.font = `700 ${df}px sans-serif`;
  } else {
    if (r.walls.north>0) ctx.fillText(fmtIn(r.walls.north), RX+RW/2, RY-36);
    if (r.walls.south>0) ctx.fillText(fmtIn(r.walls.south), RX+RW/2, RY+RH+36);
    ctx.save(); ctx.translate(RX-36, RY+RH/2); ctx.rotate(-Math.PI/2); if (r.walls.west>0) ctx.fillText(fmtIn(r.walls.west),0,0); ctx.restore();
    ctx.save(); ctx.translate(RX+RW+36, RY+RH/2); ctx.rotate(Math.PI/2); if (r.walls.east>0) ctx.fillText(fmtIn(r.walls.east),0,0); ctx.restore();
  }
  // Rulers baked into the canvas only for PDF output — on screen they live on the
  // viewport edges (drawViewportRulers) so they stay readable at any zoom.
  if (PDF) {
    drawRuler(ctx, RX, RY, roomW, scale, false, false); // X axis (top)
    drawRuler(ctx, RX, RY, roomH, scale, true,  false); // Y axis (left)
  }

  ctx.fillStyle = '#94A3B8'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  // Shape tag if L-shape
  if (_ld) {
    ctx.fillStyle = '#3b82f6'; ctx.font = '600 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillRect(RX+20, RY-46, 50, 16);
    ctx.fillStyle = '#fff'; ctx.fillText('⌐ L-Shape', RX+24, RY-38);
  }
  ctx.fillStyle = '#94A3B8'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('↑ N', RX+4, RY-28);
  const barPx = 24*scale, bx = RX+RW-barPx-8, by = RY+RH+40;
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+barPx,by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx,by-4); ctx.lineTo(bx,by+4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+barPx,by-4); ctx.lineTo(bx+barPx,by+4); ctx.stroke();
  ctx.fillStyle = '#475569'; ctx.font = '500 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('24"', bx+barPx/2, by+5);
  if (showDimensions) drawDimensions(ctx, r, scale, RX, RY, RW, RH, _ld);
  if (showWorkTriangle) drawWorkTriangle(ctx, r, scale, RX, RY, RW, RH);
  // Items that don't fit the room (wall shrunk, ceiling lowered): red dashed outline
  if (_flagRects.length) {
    ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3; ctx.setLineDash([6,4]);
    _flagRects.forEach(f => ctx.strokeRect(f.x - 2, f.y - 2, f.w + 4, f.h + 4));
    ctx.setLineDash([]); ctx.fillStyle = '#dc2626'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    if (!PDF) ctx.fillText(`⚠ ${_flagRects.length} item${_flagRects.length === 1 ? " doesn't" : "s don't"} fit — see list`, RX + RW, RY - 28);
    ctx.restore();
  }
  if (!PDF) drawFloorSelection(ctx, r, scale, RX, RY);
  renderSummary(r);
  // Auto-fit only on first render of a project (zoom resets to 1 signal)
  if (vpState.floor.zoom === 1 && vpState.floor.panX === 0 && vpState.floor.panY === 0) {
    requestAnimationFrame(() => fitView('floor'));
  } else {
    applyVpTransform('floor');
  }
}


