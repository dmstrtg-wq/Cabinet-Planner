// My Cabinet Planner — js/elevation.js
// Wall elevation drawing.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RENDER: ELEVATION
// ════════════════════════════
// Backfills itemNum on any cabinet/appliance that predates this feature (older
// saved projects), so numbers appear the first time this room is opened —
// without needing a one-time migration pass over every project in the database.
function ensureItemNumbers(r) {
  if (!r) return false;
  let next = nextItemNum(r);
  let changed = false;
  [...r.cabinets, ...(r.appliances||[])].forEach(item => {
    if (!item.itemNum) { item.itemNum = next++; changed = true; }
  });
  return changed;
}
function renderElevation() {
  const canvas = document.getElementById('elevation-plan');
  const ctx = canvas.getContext('2d');
  const r = activeRoom();
  if (!r) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
  if (ensureItemNumbers(r)) persist();
  const wall = state.elevWall;
  const scale = ELEV_SCALE;
  const wallLength = r.walls[wall] || 120;
  const ceiling = r.ceilingHeight || 96;
  const p = activeProj();
  const styleInfo = getStyles().find(s => s.code === (p.style||getStyles()[0]?.code)) || getStyles()[0];
  const PDF = !!window._pdfMode;
  const PAD = PDF ? 95 : (showDimensions ? 100 : 60);
  const canvasW = Math.max(wallLength*scale+PAD*2, 400);
  const canvasH = Math.max(ceiling*scale+PAD*2, 320);
  canvas.width = canvasW; canvas.height = canvasH;
  const WX=PAD, WY=PAD, WW=wallLength*scale, WH=ceiling*scale;

  if (PDF) {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,canvasW,canvasH);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(WX,WY,WW,WH);
  } else {
    ctx.fillStyle = '#F0F4F8'; ctx.fillRect(0,0,canvasW,canvasH);
    ctx.fillStyle = '#FAFAFA'; ctx.fillRect(WX,WY,WW,WH);
    if (layers.grid) {   // Layers ▸ Grid
      ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 0.5;
      const gs = 12*scale;
      for (let gx=WX; gx<=WX+WW; gx+=gs) { ctx.beginPath(); ctx.moveTo(gx,WY); ctx.lineTo(gx,WY+WH); ctx.stroke(); }
      for (let gy=WY; gy<=WY+WH; gy+=gs) { ctx.beginPath(); ctx.moveTo(WX,gy); ctx.lineTo(WX+WW,gy); ctx.stroke(); }
    }
  }
  ctx.fillStyle = PDF ? '#888888' : '#CBD5E1'; ctx.fillRect(WX,WY+WH,WW,4);
  const counterY = WY+WH-36*scale;
  if (['kitchen', 'laundry'].includes(roomKind(r))) {     // (a kitchen guide — not drawn in baths, living rooms, halls)
    ctx.strokeStyle = PDF ? '#555555' : '#94A3B8'; ctx.lineWidth = PDF ? 1.5 : 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(WX,counterY); ctx.lineTo(WX+WW,counterY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = PDF ? '#555555' : '#94A3B8'; ctx.font = '500 9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Counter Height 36"', WX+4, counterY-4);
  }

  const wallCabs     = r.cabinets.filter(c => c.wall === wall && layerShowsItem(c));          // Layers
  const wallOpenings = layers.openings ? (r.openings||[]).filter(o => o.wall === wall) : [];
  const floorY = WY+WH;
  if (!PDF) vpGeom.elev = { originX: WX, originY: floorY, wIn: wallLength, hIn: ceiling, scale, vertUp: true };

  // PDF: soffit band — dark fill from ceiling down to top of upper cabinets
  if (PDF) {
    const upperCabsForSoffit = wallCabs.filter(c => ['wall','diagWall'].includes(c.type));
    if (upperCabsForSoffit.length > 0) {
      const soffitBottom = Math.min(...upperCabsForSoffit.map(cab => {
        const catS = CATALOG[cab.type];
        const cHS = (cab.height || catS.heights?.[0] || 30) * scale;
        const bInS = cab.wallBottom != null ? cab.wallBottom : 54;
        return Math.max(WY, floorY - bInS*scale - cHS);
      }));
      if (soffitBottom > WY) {
        ctx.fillStyle = '#2B2926';
        ctx.fillRect(WX, WY, WW, soffitBottom - WY);
      }
    }
  }
  // South and west walls are mirrored in elevation (you face the opposite direction)
  const flip = wall === 'south' || wall === 'west';
  const eX = (offset, width) => flip
    ? WX + WW - (offset + width) * scale
    : WX + offset * scale;

  // Openings with trim (Build Plan 3.5): 3-1/2" casing around windows, doors and cased
  // openings; windows get a double-hung sash, a sill (stool) and an apron.
  const CASING = 3.5;
  const TRIM = PDF ? '#FFFFFF' : '#FFFFFF', TRIM_LINE = PDF ? '#1a1a1a' : '#94A3B8';
  const trimRect = (x, y, w, h) => { ctx.fillStyle = TRIM; ctx.fillRect(x, y, w, h); ctx.strokeStyle = TRIM_LINE; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); };
  const opLabel = (text, x, y, color) => {
    ctx.fillStyle = PDF ? '#1a1a1a' : color; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(text, x, y);
  };
  wallOpenings.forEach(op => {
    // Trim is optional per opening (Dan, 2026-10-08): op.noTrim = no casing / stool / apron
    const trim = !op.noTrim;
    const ox = eX(op.offset||0, op.width), oW = op.width*scale, oH = op.height*scale, c = trim ? CASING*scale : 0;
    if (op.type==='window') {
      const sill = op.sillHeight ?? 36, top = floorY - (sill + op.height)*scale, bot = floorY - sill*scale;
      if (trim) {
        trimRect(ox - c, top - c, oW + 2*c, c);                       // head casing
        trimRect(ox - c, top, c, oH); trimRect(ox + oW, top, c, oH);  // side casings
        trimRect(ox - c - 1*scale, bot, oW + 2*c + 2*scale, 1*scale); // stool (sill)
        trimRect(ox - c, bot + 1*scale, oW + 2*c, 3*scale);           // apron
      }
      ctx.fillStyle = PDF ? '#F2F6F9' : '#BAE6FD'; ctx.fillRect(ox, top, oW, oH);
      ctx.strokeStyle = PDF ? '#1a1a1a' : '#0369A1'; ctx.lineWidth = 1.5; ctx.strokeRect(ox, top, oW, oH);
      // double-hung: meeting rail across the middle, sash frames
      const sash = 1.5*scale;
      ctx.lineWidth = 1; ctx.strokeStyle = PDF ? '#333333' : '#0369A1';
      ctx.strokeRect(ox + sash, top + sash, oW - 2*sash, oH/2 - 1.5*sash);
      ctx.strokeRect(ox + sash, top + oH/2 + sash/2, oW - 2*sash, oH/2 - 1.5*sash);
      // label inside the glass, under the head (above it may sit on the soffit band)
      ctx.fillStyle = PDF ? '#FFFFFF' : 'rgba(255,255,255,0.8)'; ctx.font = 'bold 9px sans-serif';
      const wl = `W ${fmtFrac(op.width)} × ${fmtFrac(op.height)}, sill ${fmtFrac(sill)}`, wlw = ctx.measureText(wl).width + 6;
      ctx.fillRect(ox + oW/2 - wlw/2, top + 3, wlw, 13);
      opLabel(wl, ox + oW/2, top + 15, '#0369A1');
    } else if (op.type==='door') {
      const top = floorY - oH;
      if (trim) { trimRect(ox - c, top - c, oW + 2*c, c); trimRect(ox - c, top, c, oH); trimRect(ox + oW, top, c, oH); }
      ctx.fillStyle = PDF ? '#FFFFFF' : '#FEF9C3'; ctx.fillRect(ox, top, oW, oH);
      ctx.strokeStyle = PDF ? '#1a1a1a' : '#D97706'; ctx.lineWidth = 1.5; ctx.strokeRect(ox, top, oW, oH);
      // two-panel door slab + knob
      ctx.lineWidth = 1; ctx.strokeStyle = PDF ? '#555555' : '#F59E0B';
      const m = 4*scale;
      ctx.strokeRect(ox + m, top + m, oW - 2*m, oH*0.42 - m);
      ctx.strokeRect(ox + m, top + oH*0.48, oW - 2*m, oH*0.52 - m);
      ctx.fillStyle = PDF ? '#555555' : '#B45309'; ctx.beginPath(); ctx.arc(ox + oW - 2.5*scale, floorY - 36*scale, 1.1*scale, 0, Math.PI*2); ctx.fill();
      opLabel(`D ${fmtFrac(op.width)} × ${fmtFrac(op.height)}`, ox + oW/2, top - c - 3, '#D97706');
    } else if (op.type==='sink-loc') {
      ctx.fillStyle='#E0F2FE'; ctx.fillRect(ox,counterY-12,oW,12);
      ctx.strokeStyle='#0284C7'; ctx.lineWidth=1.5; ctx.setLineDash([]); ctx.strokeRect(ox,counterY-12,oW,12);
      ctx.strokeStyle='#0284C7'; ctx.lineWidth=1; ctx.strokeRect(ox+4,counterY-10,oW-8,8);
      ctx.fillStyle='#0284C7'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('S '+op.width+'"', ox+oW/2, counterY-14);
    } else {                                           // cased opening (arch)
      const top = floorY - oH;
      if (trim) { trimRect(ox - c, top - c, oW + 2*c, c); trimRect(ox - c, top, c, oH); trimRect(ox + oW, top, c, oH); }
      ctx.fillStyle = PDF ? '#FFFFFF' : 'rgba(241,245,249,0.6)'; ctx.fillRect(ox, top, oW, oH);
      ctx.strokeStyle = PDF ? '#1a1a1a' : '#7C3AED'; ctx.lineWidth = 1.5; ctx.setLineDash([4,4]); ctx.strokeRect(ox, top, oW, oH); ctx.setLineDash([]);
      opLabel(`Opening ${fmtFrac(op.width)} × ${fmtFrac(op.height)}`, ox + oW/2, top - c - 3, '#7C3AED');
    }
  });

  function cabStyle(cab) {
    const code = cab.styleOverride || p.style || 'AW';
    return getStyles().find(s => s.code === code) || styleInfo;
  }

  // Fillers: plain boards at whatever height they sit (any width, any height)
  wallCabs.filter(c => isFiller(c.type)).forEach(cab => {
    const [bot, top] = itemVerticalRange(cab);
    const cW = cab.width*scale, cH = (top - bot)*scale, x = eX(cab.offset||0, cab.width), y = floorY - top*scale;
    const si = cabStyle(cab);
    ctx.fillStyle = PDF ? '#FFFFFF' : si.swatch; ctx.fillRect(x, y, cW, cH);
    ctx.strokeStyle = PDF ? '#1a1a1a' : '#64748B'; ctx.lineWidth = PDF ? 1.5 : 1.2; ctx.strokeRect(x, y, cW, cH);
    if (bot === 0) { ctx.fillStyle = PDF ? '#888888' : '#94A3B8'; ctx.fillRect(x, floorY-TOE_KICK_H*scale, cW, TOE_KICK_H*scale); }   // toe kick
    const label = 'FL ' + fmtFrac(cab.width);
    ctx.fillStyle = PDF ? '#1a1a1a' : (swatchIsDark(si.swatch) ? '#fff' : '#334155');
    ctx.font = `600 ${Math.max(8, Math.min(scale*1.7, 10))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(x + cW/2, y + cH/2);
    if (ctx.measureText(label).width > cW - 2) ctx.rotate(-Math.PI/2);   // narrow filler: label runs up the board
    ctx.fillText(label, 0, 0); ctx.restore();
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x + cW/2, y, cab.itemNum, PDF);
  });

  // ── Cabinets (Build Plan 3.5): every door and drawer comes from the same layout the 3D
  // view uses (frontLayout in fronts3d.js), so the elevation is a true working drawing —
  // door-style panels, glass, pulls/knobs where they really go, and a hinge mark on each
  // door (dashed lines meeting at the HINGE side). Corner cabinets that span two walls
  // are drawn by drawElevCorner below; fillers above.
  const hwStyle = projectHardware(p), doorKnobs = hwStyle !== 'pulls', drawerKnobs = hwStyle === 'allKnobs';
  const LINE = PDF ? '#1a1a1a' : '#64748B', FRONT_LINE = PDF ? '#333333' : '#475569', HW = PDF ? '#555555' : '#94A3B8';
  const isFrontCab = c => CATALOG[c.type] && !isFiller(c.type) && !cornerInfo(r, c);
  // bases first, then talls, then uppers (uppers sit in front of nothing, but tall tops overlap the upper band)
  const order = c => itemLevel(c) === 'upper' ? 2 : itemVerticalRange(c)[1] > 40 ? 1 : 0;
  wallCabs.filter(isFrontCab).sort((a, b) => order(a) - order(b)).forEach(cab => {
    const [botIn, topIn] = itemVerticalRange(cab);
    const cW = cab.width*scale, x = eX(cab.offset||0, cab.width), y = floorY - topIn*scale, cH = (topIn - botIn)*scale;
    const si = cabStyle(cab), sinfo = doorStyleInfo(si.code);
    const txtColor = PDF ? '#1a1a1a' : swatchIsDark(si.swatch) ? '#fff' : '#334155';
    const upper = itemLevel(cab) === 'upper';
    ctx.fillStyle = PDF ? '#FFFFFF' : si.swatch; ctx.fillRect(x, y, cW, cH);
    ctx.strokeStyle = LINE; ctx.lineWidth = PDF ? 2 : 1.5; ctx.strokeRect(x, y, cW, cH);
    if (hasToeKick(cab)) { ctx.fillStyle = PDF ? '#888888' : '#94A3B8'; ctx.fillRect(x, floorY - TOE_KICK_H*scale, cW, TOE_KICK_H*scale); }
    const sx = fx => x + (fx + cab.width/2) * scale, sy = fy => floorY - fy*scale;
    const fronts = frontLayout(cab, r);
    const hingeUnknown = needsHinge(cab) && !cab.hinge;
    fronts.forEach(f => {
      const fx = sx(f.x0), fy = sy(f.y1), fw = (f.x1 - f.x0)*scale, fh = (f.y1 - f.y0)*scale, H = f.y1 - f.y0;
      if (f.kind === 'open') {                        // open shelving (7.4b): shaded interior + shelf lines / hooks
        ctx.fillStyle = PDF ? '#F2F2F2' : '#' + shade3D(si.swatch, -40).toString(16).padStart(6, '0'); ctx.fillRect(fx, fy, fw, fh);
        ctx.strokeStyle = FRONT_LINE; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, fh);
        for (let k = 1; k <= (f.shelves || 0); k++) { const yy = fy + fh - (fh * k) / (f.shelves + 1); ctx.fillStyle = PDF ? '#FFFFFF' : si.swatch; ctx.fillRect(fx, yy - 0.375 * scale, fw, 0.75 * scale); ctx.strokeRect(fx, yy - 0.375 * scale, fw, 0.75 * scale); }
        if (f.hooks) { ctx.fillStyle = HW; const n = Math.max(1, Math.round((f.x1 - f.x0) / 9)); for (let k = 0; k < n; k++) { ctx.beginPath(); ctx.arc(fx + fw * (k + 0.5) / n, fy + 6 * scale, 0.6 * scale, 0, Math.PI * 2); ctx.fill(); } }
        return;
      }
      ctx.strokeStyle = FRONT_LINE; ctx.lineWidth = 1; ctx.strokeRect(fx, fy, fw, fh);
      // Panel: same rule as the 3D fronts — short drawers and plain panels are slabs
      const plain = f.kind === 'panel' || (f.kind === 'false' && sinfo.door !== 'shaker');
      const slab = sinfo.door === 'slab' || plain || (f.kind !== 'door' && H < 8);
      if (f.glass) {
        const fr = Math.min(sinfo.frame, (f.x1 - f.x0) * 0.3, H * 0.3) * scale;
        ctx.fillStyle = PDF ? '#EEF4F8' : '#CFE3EE'; ctx.fillRect(fx + fr, fy + fr, fw - 2*fr, fh - 2*fr);
        ctx.strokeRect(fx + fr, fy + fr, fw - 2*fr, fh - 2*fr);
      } else if (!slab) drawDoorPanel(ctx, fx, fy, fw, fh, si.code, scale, PDF);
      // Hardware where the 3D puts it (addHardware in fronts3d.js)
      ctx.fillStyle = HW; ctx.strokeStyle = HW;
      if (f.kind === 'drawer') {
        const len = ((f.x1 - f.x0) >= 24 ? 8 : 5) * scale, hy = f.trash ? sy(f.y1 - 3) : fy + fh/2;   // trash pull-out: handle near the top
        if (drawerKnobs) { ctx.beginPath(); ctx.arc(fx + fw/2, hy, 0.65*scale, 0, Math.PI*2); ctx.fill(); }
        else { ctx.beginPath(); ctx.roundRect(fx + fw/2 - len/2, hy - 0.3*scale, len, 0.6*scale, 0.3*scale); ctx.fill(); }
        if (f.trash) {                                  // mark it as a trash pull-out
          ctx.font = `600 ${Math.max(7, Math.min(scale*1.3, 8))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(f.trash === 'double' ? 'trash + recycle' : 'trash', fx + fw/2, fy + fh - 3);
        }
      } else if (f.kind === 'door') {
        const hUp = upper || f.upper || ((cab.type === 'tall' || cab.type === 'linenTall') && f.y0 > 40);
        const hx = f.hinge === 'R' ? sx(f.x0 + 1.75) : sx(f.x1 - 1.75);
        const hyIn = hUp ? f.y0 + 3 : f.y1 - 3.5, len = Math.min(4, H * 0.4);
        if (doorKnobs) { ctx.beginPath(); ctx.arc(hx, sy(hyIn), 0.65*scale, 0, Math.PI*2); ctx.fill(); }
        else { const yA = sy(hUp ? hyIn + len : hyIn); ctx.beginPath(); ctx.roundRect(hx - 0.3*scale, yA, 0.6*scale, len*scale, 0.3*scale); ctx.fill(); }
        // Hinge mark: dashed lines from the handle-side corners to the middle of the hinge side
        // (a pair of doors has fixed hinges; a single door needs the cabinet's hinge side)
        const paired = fronts.some(q => q !== f && q.kind === 'door' && Math.abs(q.y0 - f.y0) < 0.01);
        if (!(hingeUnknown && !paired)) {
          const hingeX = f.hinge === 'R' ? fx + fw : fx, openX = f.hinge === 'R' ? fx : fx + fw;
          ctx.save(); ctx.strokeStyle = PDF ? '#777777' : swatchIsDark(si.swatch) ? 'rgba(226,232,240,0.6)' : 'rgba(71,85,105,0.55)'; ctx.lineWidth = 0.8; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(openX, fy + 2); ctx.lineTo(hingeX, fy + fh/2); ctx.lineTo(openX, fy + fh - 2); ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = PDF ? '#1a1a1a' : swatchIsDark(si.swatch) ? '#FBBF24' : '#B45309'; ctx.font = `700 ${Math.max(7, Math.min(scale*1.4, 9))}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('Hinge L/R?', fx + fw/2, fy + fh - 9);
        }
      }
    });
    // Oven / microwave cabinet with nothing in it yet: show the opening
    if (cab.type === 'ovenTall' || cab.type === 'mwDrawerBase') {
      const o = builtInOpening(r, cab);
      if (!o.filled) {
        const ox = x + 1.5*scale, oy = sy(o.y1), ow = cW - 3*scale, oh = (o.y1 - o.y0)*scale;
        ctx.fillStyle = PDF ? '#EEEEEE' : '#1F2328'; ctx.fillRect(ox, oy, ow, oh);
        ctx.fillStyle = PDF ? '#555555' : '#CBD5E1'; ctx.font = `600 ${Math.max(7, Math.min(scale*1.5, 9))}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cab.type === 'ovenTall' ? 'Oven opening' : 'Microwave opening', ox + ow/2, oy + oh/2);
      }
    }
    // Label = the order-list code (B18, SB36, W3030, WP2484 …) in the largest front
    const big = fronts.filter(f => f.kind === 'door' || f.kind === 'drawer').sort((a, b) => (b.x1-b.x0)*(b.y1-b.y0) - (a.x1-a.x0)*(a.y1-a.y0))[0];
    // (in a drawer, sit under its pull so the two don't cross)
    const lx = big ? sx((big.x0 + big.x1) / 2) : x + cW/2, ly = (big ? sy((big.y0 + big.y1) / 2) : y + cH/2) + (big && big.kind === 'drawer' ? 9 : 0);
    ctx.font = `600 ${Math.max(8, Math.min(scale*1.9, 11))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lbl = orderSku(cab), tw = ctx.measureText(lbl).width + 6;
    ctx.fillStyle = PDF ? '#FFFFFF' : swatchIsDark(si.swatch) ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.7)'; ctx.fillRect(lx - tw/2, ly - 7, tw, 14);
    ctx.fillStyle = txtColor; ctx.fillText(lbl, lx, ly);
    if (cab.wallOffset > 0) {          // 7.1: set out from the wall (casing filler behind)
      ctx.font = '600 8px sans-serif'; ctx.fillStyle = PDF ? '#333333' : '#0F766E'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`out ${fmtFrac(cab.wallOffset)} from wall`, x + cW/2, y + 3);
    }
    if (upper) {
      const bIn = cab.wallBottom != null ? cab.wallBottom : 54;
      if (bIn !== 54) { ctx.font = '600 8px sans-serif'; ctx.fillStyle = PDF ? '#333333' : '#f59e0b'; ctx.textBaseline = 'top'; ctx.fillText(`↑${bIn}" from floor`, x + cW/2, y + cH + 3); }
    }
    if (cab.note) { ctx.font = `italic ${Math.max(7, Math.min(scale*1.6, 10))}px sans-serif`; ctx.fillStyle = PDF ? '#333333' : '#64748B'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(cab.note, x + cW/2, y - 6); }
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x + cW/2, y, cab.itemNum, PDF);
  });

  // ── Corner cabinets on two walls (lazy susan, diagonal corner wall) — true view, the
  // same from either wall: the leg next to the corner set back, then this face's door.
  r.cabinets.filter(c => layerShowsItem(c)).forEach(cab => {
    const ci = cornerInfo(r, cab); if (!ci || (cab.wall !== wall && ci.w2 !== wall)) return;
    const si = cabStyle(cab);
    drawElevCorner(ctx, r, cab, ci, wall, scale, floorY, eX, PDF, si, swatchIsDark(si.swatch));
  });

  // ── Corner base crossover: an adjacent wall's blind corner base shown at the edge ──
  {
    const CORNER_CAB_TYPES = ['cornerBase'];
    // For each elevation wall: left corner and right corner, which adjacent wall and at which end.
    // atFarEnd:true  → corner is at offset ≈ adjWallLength (far end of adj wall)
    // atFarEnd:false → corner is at offset ≈ 0 (near/north/west end of adj wall)
    const cornerMap = {
      north: [{ adjWall:'west',  atFarEnd:false, drawAtRight:false }, { adjWall:'east',  atFarEnd:false, drawAtRight:true  }],
      south: [{ adjWall:'east',  atFarEnd:true,  drawAtRight:false }, { adjWall:'west',  atFarEnd:true,  drawAtRight:true  }],
      east:  [{ adjWall:'north', atFarEnd:true,  drawAtRight:false }, { adjWall:'south', atFarEnd:true,  drawAtRight:true  }],
      west:  [{ adjWall:'south', atFarEnd:false, drawAtRight:false }, { adjWall:'north', atFarEnd:false, drawAtRight:true  }],
    };
    (cornerMap[wall] || []).forEach(({ adjWall, atFarEnd, drawAtRight }) => {
      const adjLen = r.walls[adjWall] || 120;
      r.cabinets.filter(c => c.wall === adjWall && CORNER_CAB_TYPES.includes(c.type)).forEach(cab => {
        const off = cab.offset || 0;
        const atCorner = atFarEnd ? (off + cab.width >= adjLen - 1) : (off <= 1);
        if (!atCorner) return;
        const cat = CATALOG[cab.type]; if (!cat) return;
        // lazysusan L-shape extends cab.width along the adjacent wall (floor plan confirms this);
        // cornerBase and diagWall extend cab.depth — use depth for those.
        const crossW = cab.type === 'lazysusan' ? cab.width : (cab.depth || cat.depth || 24);
        const depthPx = crossW * scale;
        const cH = (cab.height || cat.heights?.[0] || (cab.type === 'diagWall' ? 30 : 34.5)) * scale;
        const cW = depthPx;
        const x = drawAtRight ? WX + WW - cW : WX;
        const isWallCab = cab.type === 'diagWall';
        let y;
        if (isWallCab) {
          const bIn = cab.wallBottom != null ? cab.wallBottom : 54;
          y = Math.max(WY, floorY - bIn * scale - cH);
        } else {
          y = floorY - cH;
        }
        const si = cabStyle(cab);
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = PDF ? '#F8F8F8' : si.swatch;
        ctx.fillRect(x, y, cW, cH);
        ctx.strokeStyle = PDF ? '#888888' : '#94A3B8'; ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x, y, cW, cH);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (!isWallCab) {
          ctx.fillStyle = PDF ? '#888888' : '#94A3B8'; ctx.globalAlpha = 0.7;
          ctx.fillRect(x, floorY - 7, cW, 7);
          ctx.globalAlpha = 1;
        }
        const fs = Math.max(7, Math.min(scale * 1.5, 9));
        ctx.fillStyle = PDF ? '#475569' : (swatchIsDark(si.swatch) ? '#fff' : '#475569');
        ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cat.abbr || '', x + cW / 2, y + cH / 2);
      });
    });
  }

  // Appliances in elevation
  (r.appliances||[]).filter(a => a.wall === wall && layerShowsItem(a)).forEach(app => {
    const acat = APPLIANCES[app.type]; if (!acat) return;
    const aW   = app.width * scale;
    const [aBot, aTop] = itemVerticalRange(app);
    const aH   = (aTop - aBot) * scale;              // (a shelf stack spans all its shelves)
    const x    = eX(app.offset||0, app.width);
    const botY = floorY - itemVerticalRange(app)[0] * scale; // bottom edge Y
    const y    = botY - aH;                        // top edge Y

    drawApplianceFace(ctx, app, acat, x, y, aW, aH, scale, { PDF, styleCode: p.style, ceilY: WY, r });
    if (app.note) {
      ctx.font=`italic ${Math.max(7,scale*1.4)}px sans-serif`; ctx.fillStyle='#64748B';
      ctx.textBaseline='bottom'; ctx.fillText(app.note, x+aW/2, y-4);
    }
    if (showItemNumbers && app.itemNum) drawItemHexagon(ctx, x+aW/2, y, app.itemNum, PDF);
  });

  // Dimension strings (Build Plan 3.5) — always on printed plans, on screen with Dims.
  // Drawn after the counters below so they sit on top.
  const dimsOn = PDF || showDimensions;

  // Items that don't fit the room on this wall: red dashed outline (screen only)
  if (!PDF) {
    const fitIds = new Set(roomFitProblems(r).map(x => x.item.id));
    [...r.cabinets, ...(r.appliances || [])].filter(i => i.wall === wall && fitIds.has(i.id)).forEach(i => {
      const [bottom, top] = itemVerticalRange(i);
      const h = top - bottom;
      ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3; ctx.setLineDash([6,4]);
      ctx.strokeRect(eX(i.offset || 0, i.width) - 2, floorY - (bottom + h) * scale - 2, i.width * scale + 4, h * scale + 4);
      ctx.restore();
    });
  }

  drawElevCountersAndTrim(ctx, r, p, wall, scale, floorY, eX, PDF);   // countertop, end panels, crown (counters.js)
  if (dimsOn) drawElevDimensionStrings(ctx, r, wall, scale, WX, WY, WW, WH, floorY, eX, PDF);
  if (!PDF) { drawElevGaps(ctx, r, wall, scale, floorY, eX); drawElevSelection(ctx, r, wall, scale, floorY, eX); drawElevGhost(ctx, r, wall, scale, floorY, eX); }
  ctx.strokeStyle=PDF?'#1a1a1a':'#334155'; ctx.lineWidth=PDF?2.5:3; ctx.strokeRect(WX,WY,WW,WH);
  ctx.fillStyle=PDF?'#888888':'#94A3B8'; ctx.fillRect(WX,WY-3,WW,3);
  ctx.fillStyle=PDF?'#1a1a1a':'#475569';
  const df=Math.max(10,scale*2.2); ctx.font=`700 ${df}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(fmtIn(wallLength), WX+WW/2, WY-(dimsOn?66:20));
  ctx.save(); ctx.translate(dimsOn ? WX-66 : WX-28, WY+WH/2); ctx.rotate(-Math.PI/2); ctx.fillText(fmtIn(ceiling),0,0); ctx.restore();
  const wallLabels = {north:'North',south:'South',east:'East',west:'West'};
  document.getElementById('elev-title').textContent = `${activeProj().customer} — ${activeRoom().name} · ${wallLabels[wall]} Wall Elevation`;
  if (vpState.elev.zoom === 1 && vpState.elev.panX === 0 && vpState.elev.panY === 0) {
    requestAnimationFrame(() => fitView('elev'));
  } else {
    applyVpTransform('elev');
  }
}


// ════════════════════════════
// DIMENSION STRINGS (Build Plan 3.5)
// ════════════════════════════
// Shop-drawing dimensions around one wall's elevation:
//   bottom  — every piece standing on the floor (and the open spaces between), then the wall
//   top     — every upper-level piece (and spaces); doors/windows located from the wall ends
//   left    — floor → countertop → bottom of uppers → top of uppers → ceiling, + overall
// Architectural slash ticks; inches with fractions (fmtFrac).
function drawElevDimensionStrings(ctx, r, wall, scale, WX, WY, WW, WH, floorY, eX, PDF) {
  const len = wallLength(r, wall), ceiling = r.ceilingHeight || 96;
  const INK = PDF ? '#1a1a1a' : '#1D4ED8', MUTED = PDF ? '#666666' : '#64748B';
  const items = wallItemsWithReturns(r, wall).filter(i => (CATALOG[i.type] || APPLIANCES[i.type]) && layerShowsItem(i));
  const lab = v => fmtFrac(Math.round(v * 16) / 16);
  // A chain along the wall: pieces + the gaps between them, from one wall end to the other
  const chain = list => {
    const segs = [];
    const spans = list.map(i => [i.offset || 0, (i.offset || 0) + i.width]).sort((m, n) => m[0] - n[0]);
    let at = 0;
    spans.forEach(([a, b]) => {
      if (b <= at + 0.01) return;                       // fully inside the previous piece (built-ins, overlaps)
      if (a > at + 0.24) segs.push({ a: at, b: a, gap: true });
      segs.push({ a: Math.max(a, at), b });
      at = b;
    });
    if (spans.length && len - at > 0.24) segs.push({ a: at, b: len, gap: true });
    return segs;
  };
  const hLine = (segs, y, labelAbove) => {
    ctx.save(); ctx.lineWidth = PDF ? 0.8 : 1; ctx.setLineDash([]);
    ctx.font = `700 ${PDF ? 9 : 9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = labelAbove ? 'bottom' : 'top';
    let lastRight = -Infinity;
    segs.forEach(sg => {
      const xa = eX(sg.a, 0), xb = eX(sg.b, 0), x1 = Math.min(xa, xb), x2 = Math.max(xa, xb);
      ctx.strokeStyle = sg.gap ? MUTED : INK; ctx.fillStyle = sg.gap ? MUTED : INK;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      [x1, x2].forEach(xx => {
        ctx.beginPath(); ctx.moveTo(xx, y - 6); ctx.lineTo(xx, y + 6); ctx.stroke();         // extension
        ctx.beginPath(); ctx.moveTo(xx - 3, y + 3); ctx.lineTo(xx + 3, y - 3); ctx.stroke();   // slash tick
      });
      const t = lab(sg.b - sg.a), tw = ctx.measureText(t).width;
      if (x2 - x1 < 8) return;
      // Too narrow for its label: lift it one row so neighbours don't collide
      const cx = (x1 + x2) / 2, crowded = tw + 4 > x2 - x1 || cx - tw / 2 < lastRight + 2;
      const ty = labelAbove ? y - 3 - (crowded ? 10 : 0) : y + 3 + (crowded ? 10 : 0);
      ctx.fillText(t, cx, ty);
      lastRight = cx + tw / 2;
    });
    ctx.restore();
  };
  const vLine = (pairs, x) => {                        // pairs: [{ y0, y1 }] in inches from the floor
    ctx.save(); ctx.lineWidth = PDF ? 0.8 : 1; ctx.strokeStyle = INK; ctx.fillStyle = INK;
    ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    pairs.forEach(({ y0, y1 }) => {
      if (y1 - y0 < 0.24) return;
      const ya = floorY - y0 * scale, yb = floorY - y1 * scale;
      ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, yb); ctx.stroke();
      [ya, yb].forEach(yy => {
        ctx.beginPath(); ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 3, yy + 3); ctx.lineTo(x + 3, yy - 3); ctx.stroke();
      });
      if (Math.abs(ya - yb) < 12) return;
      ctx.save(); ctx.translate(x - 3, (ya + yb) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(lab(y1 - y0), 0, 0); ctx.restore();
    });
    ctx.restore();
  };

  // ── Bottom: floor pieces, then the whole wall
  const floorPieces = items.filter(i => itemVerticalRange(i)[0] < 1 && !(APPLIANCES[i.type] && applianceHost(r, i)));
  if (floorPieces.length) hLine(chain(floorPieces), floorY + 20, false);
  hLine([{ a: 0, b: len }], floorY + 44, false);

  // ── Top: upper-level pieces (wall cabinets, hood, microwave, shelves) — talls/fridges
  // reach up there too, so they're part of this chain
  const upperPieces = items.filter(i => itemLevel(i) === 'upper' || itemVerticalRange(i)[1] > 60);
  if (upperPieces.length) hLine(chain(upperPieces), WY - 14, true);
  // Doors and windows located from the wall ends
  const ops = (r.openings || []).filter(o => o.wall === wall && (o.type === 'window' || o.type === 'door' || o.type === 'arch'));
  if (ops.length) hLine(chain(ops.map(o => ({ offset: o.offset, width: o.width }))), WY - 38, true);

  // ── Left: height chain + overall
  const counters = counterRuns(r).filter(run => run.wall === wall);
  const counterTop = counters.length ? Math.max(...counters.map(run => run.top + COUNTER_T)) : null;
  const uppers = items.filter(i => CATALOG[i.type] && itemLevel(i) === 'upper');
  const stops = [0];
  if (counterTop != null) stops.push(counterTop);
  if (uppers.length) {
    // bottom of the lowest upper, and the top most of them share (a stray high one doesn't skew it)
    const ub = Math.min(...uppers.map(i => itemVerticalRange(i)[0]));
    const tops = uppers.map(i => itemVerticalRange(i)[1]), count = t => tops.filter(v => Math.abs(v - t) < 0.01).length;
    const ut = tops.reduce((m, t) => count(t) > count(m) || (count(t) === count(m) && t < m) ? t : m, tops[0]);
    stops.push(ub, ut);
  }
  stops.push(ceiling);
  const st = [...new Set(stops.map(v => Math.round(v * 16) / 16))].sort((m, n) => m - n);
  vLine(st.slice(0, -1).map((y0, k) => ({ y0, y1: st[k + 1] })), WX - 20);
  vLine([{ y0: 0, y1: ceiling }], WX - 44);

  // Legend for the door marks
  ctx.save(); ctx.fillStyle = MUTED; ctx.font = 'italic 9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Dashed lines on a door meet at its hinge side.  Dimensions in inches.', WX, floorY + 62);
  ctx.restore();
}
