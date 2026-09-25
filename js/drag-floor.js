// My Cabinet Planner — js/drag-floor.js
// Floor plan mouse/touch: drag, pan, double-click edit.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// DRAG ON FLOOR PLAN
// ════════════════════════════
(function(){
  let drag = null, hoverCabId = null;
  function getCanvasInfo() {
    const r = activeRoom(); if (!r) return null;
    const scale = CANVAS_SCALE;
    const roomW = Math.max(r.walls.north,r.walls.south,48);
    const roomH = Math.max(r.walls.east,r.walls.west,48);
    return { scale, RX:68, RY:68, RW:roomW*scale, RH:roomH*scale, r };
  }
  function hitTestCab(mx,my,info) {
    const {scale,RX,RY,RW,RH,r} = info;
    // Only what's visible (Layers) can be clicked; uppers first, since they draw on top of bases
    const isUpper = c => c.type === 'wall' || c.type === 'diagWall';
    for (const cab of [...r.cabinets.filter(isUpper), ...r.cabinets.filter(c => !isUpper(c))]) {
      if (!layerShowsItem(cab)) continue;
      const _rc = itemRect(r, cab, cab.depth); if (!_rc) continue;
      const x=RX+_rc.x*scale, y=RY+_rc.y*scale, w=_rc.w*scale, h=_rc.h*scale;
      if (mx>=x&&mx<=x+w&&my>=y&&my<=y+h) return {cab,wall:cab.wall,x,y,w,h};
    }
    for (const app of (r.appliances||[])) {
      const acat=APPLIANCES[app.type]; if(!acat || !layerShowsItem(app)) continue;
      const _ra = itemRect(r, app, acat.depth); if (!_ra) continue;
      const x=RX+_ra.x*scale, y=RY+_ra.y*scale, w=_ra.w*scale, h=_ra.h*scale;
      if (mx>=x&&mx<=x+w&&my>=y&&my<=y+h) return {cab:app,wall:app.wall,x,y,w,h};
    }
    for (const isl of (r.islands||[])) {
      const ix=RX+isl.x*scale, iy=RY+isl.y*scale, iw=isl.width*scale, ih=isl.depth*scale;
      if (mx>=ix&&mx<=ix+iw&&my>=iy&&my<=iy+ih) return {cab:isl,wall:'island',x:ix,y:iy,w:iw,h:ih,isIsland:true};
    }
    return null;
  }
  const canvas  = document.getElementById('floor-plan');
  const tooltip = document.getElementById('drag-tooltip');
  // Measure tool: click to set points
  canvas.addEventListener('click', e => {
    if (!measureState.active) return;
    const info = getCanvasInfo(); if (!info) return;
    const pt = canvasPtToRoom(e.clientX, e.clientY, canvas, info.RX, info.RY, info.scale);
    // Clamp to room
    pt.x = Math.max(0, Math.min(info.r.walls.north || 120, pt.x));
    pt.y = Math.max(0, Math.min(info.r.walls.east  || 96,  pt.y));
    if (!measureState.pending) {
      measureState.pending = pt;
    } else {
      measureState.lines.push({ p1: measureState.pending, p2: pt });
      measureState.pending = null;
      measureState.hoverPt = null;
      document.getElementById('measure-clear-btn').style.display = '';
    }
    renderCanvas();
  });

  // Measure tool: live rubber-band on mousemove
  canvas.addEventListener('mousemove', e => {
    if (!measureState.active || !measureState.pending) return;
    const info = getCanvasInfo(); if (!info) return;
    const pt = canvasPtToRoom(e.clientX, e.clientY, canvas, info.RX, info.RY, info.scale);
    measureState.hoverPt = pt;
    renderCanvas();
  });

  canvas.addEventListener('dblclick', e => {
    const info = getCanvasInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const z = vpState.floor.zoom;
    const hit  = hitTestCab((e.clientX-rect.left)/z, (e.clientY-rect.top)/z, info);
    if (!hit) return;
    e.preventDefault();
    if (hit.isIsland) openEditIslandModal(hit.cab);
    else openItemPopover(hit.cab, e.clientX, e.clientY);
  });

  canvas.addEventListener('mousedown', e => {
    if (measureState.active) return; // measure mode takes over
    const info = getCanvasInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const z = vpState.floor.zoom;
    const hit  = hitTestCab((e.clientX-rect.left)/z, (e.clientY-rect.top)/z, info);
    if (!hit) {
      // No cabinet hit — start viewport pan
      const vp = document.getElementById('fp-viewport');
      if (vp && e.button === 0) {
        const st = vpState.floor;
        const panStart = { x: e.clientX, y: e.clientY, px: st.panX, py: st.panY };
        let panned = false;
        vp.classList.add('panning');
        function onMove(ev) {
          if (Math.abs(ev.clientX - panStart.x) + Math.abs(ev.clientY - panStart.y) > 3) panned = true;
          st.panX = panStart.px + (ev.clientX - panStart.x);
          st.panY = panStart.py + (ev.clientY - panStart.y);
          applyVpTransform('floor');
        }
        function onUp() {
          if (!panned && selectedItemId) selectItem(null); // plain click on empty space clears the selection
          vp.classList.remove('panning');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }
      return;
    }
    e.preventDefault();
    if (selectedItemId !== hit.cab.id) selectItem(hit.cab.id);
    // Scale is in internal px/inch; need to divide visual delta by cssZoom to get internal delta
    const effectiveScale = info.scale * vpState.floor.zoom;
    if (hit.isIsland) {
      drag = { cabId:hit.cab.id, startMX:e.clientX-rect.left, startMY:e.clientY-rect.top, startX:hit.cab.x, startY:hit.cab.y, scale:effectiveScale, isIsland:true };
    } else {
      drag = { cabId:hit.cab.id, startMX:e.clientX-rect.left, startMY:e.clientY-rect.top, startOffset:hit.cab.offset||0, scale:effectiveScale, isNS:hit.wall==='north'||hit.wall==='south'||hit.wall==='step2' };
    }
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    const info = getCanvasInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const z = vpState.floor.zoom;
    // mx/my in screen px (for drag delta); hx/hy in canvas px (for hit testing)
    const mx = e.clientX-rect.left, my = e.clientY-rect.top;
    const hx = mx/z, hy = my/z;
    if (drag) {
      if (drag.isIsland) {
        const isl = (info.r.islands||[]).find(i=>i.id===drag.cabId);
        if (isl) {
          const roomW = Math.max(info.r.walls.north, info.r.walls.south, 48);
          const roomH = Math.max(info.r.walls.east,  info.r.walls.west,  48);
          isl.x = Math.max(0, Math.min(roomW - isl.width,  Math.round(drag.startX + (mx-drag.startMX)/drag.scale)));
          isl.y = Math.max(0, Math.min(roomH - isl.depth, Math.round(drag.startY + (my-drag.startMY)/drag.scale)));
          const clr = calcIslandClearance(isl, info.r);
          const clrOk = clr >= 36, clrWarn = clr >= 24;
          const clrTxt = clrOk ? `✓ ${clr}" clearance` : clrWarn ? `⚠ ${clr}" — tight` : `✗ ${clr}" — too close!`;
          tooltip.style.display='block';
          tooltip.style.background = clrOk ? '#16a34a' : clrWarn ? '#d97706' : '#dc2626';
          tooltip.textContent = `${isl.label||'Island'} · ${clrTxt}`;
          persist(); renderCanvas(); renderCabinetList();
        }
      } else {
        const delta = drag.isNS ? (mx-drag.startMX) : (my-drag.startMY);
        const cab = info.r.cabinets.find(c=>c.id===drag.cabId) || (info.r.appliances||[]).find(a=>a.id===drag.cabId);
        if (cab) {
          const newOffset = resolveMoveOffset(info.r, cab, drag.startOffset + delta/drag.scale);
          if (newOffset !== cab.offset) { cab.offset = newOffset; persist(); renderCanvas(); renderCabinetList(); }
          tooltip.style.display='block'; tooltip.textContent=`${fmtFrac(newOffset)} from left`;
        }
      }
    } else if (!measureState.active) {
      const hit = hitTestCab(hx,hy,info);
      if (hit) {
        canvas.style.cursor = 'grab';
        if (hoverCabId!==hit.cab.id) {
          hoverCabId=hit.cab.id;
          const lbl = hit.isIsland ? (hit.cab.label || 'Island') : (CATALOG[hit.cab.type]?.label || APPLIANCES[hit.cab.type]?.label || hit.cab.type);
          const pos = hit.isIsland ? `${hit.cab.x}", ${hit.cab.y}" from NW` : `${hit.cab.offset||0}" from left`;
          const hint = hit.isIsland ? ' · dbl-click to edit' : (CATALOG[hit.cab.type] || APPLIANCES[hit.cab.type]) ? ' · dbl-click to edit' : ' — drag to move';
          tooltip.style.display='block'; tooltip.textContent=`${lbl} · ${pos}${hint}`;
        }
      } else { canvas.style.cursor='default'; if(hoverCabId){hoverCabId=null;tooltip.style.display='none';} }
    }
  });
  window.addEventListener('mouseup', () => { if(drag){drag=null;canvas.style.cursor='default';tooltip.style.background='#1e293b';setTimeout(()=>{tooltip.style.display='none';},1200);} });
  // ── Floor-plan touch: pan, drag, double-tap to edit ──────────────────────
  {
    let fpLastTapTime = 0, fpLastTapId = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return; // 2-finger handled by viewport pinch handler
      const info = getCanvasInfo(); if (!info) return;
      const rect = canvas.getBoundingClientRect(); const t = e.touches[0];
      const z = vpState.floor.zoom;
      const hit = hitTestCab((t.clientX-rect.left)/z, (t.clientY-rect.top)/z, info);

      // No cabinet hit → start single-finger pan
      if (!hit) {
        const vp = document.getElementById('fp-viewport');
        if (!vp) return;
        const st = vpState.floor;
        const panStart = { x: t.clientX, y: t.clientY, px: st.panX, py: st.panY };
        let panned = false;
        vp.classList.add('panning');
        function onPanMove(ev) {
          if (ev.touches.length !== 1) return;
          const tt = ev.touches[0];
          if (Math.abs(tt.clientX - panStart.x) + Math.abs(tt.clientY - panStart.y) > 6) panned = true;
          st.panX = panStart.px + (tt.clientX - panStart.x);
          st.panY = panStart.py + (tt.clientY - panStart.y);
          applyVpTransform('floor');
          ev.preventDefault();
        }
        function onPanEnd() {
          if (!panned && selectedItemId) selectItem(null);
          vp.classList.remove('panning');
          window.removeEventListener('touchmove', onPanMove);
          window.removeEventListener('touchend', onPanEnd);
        }
        window.addEventListener('touchmove', onPanMove, { passive: false });
        window.addEventListener('touchend', onPanEnd);
        return;
      }

      // Double-tap to open edit modal (≤350 ms between taps on same cabinet)
      const now = Date.now();
      if (now - fpLastTapTime < 350 && fpLastTapId === hit.cab.id) {
        fpLastTapTime = 0; fpLastTapId = null;
        if (hit.isIsland) openEditIslandModal(hit.cab);
        else openItemPopover(hit.cab, t.clientX, t.clientY);
        e.preventDefault();
        return;
      }
      fpLastTapTime = now; fpLastTapId = hit.cab.id;
      if (selectedItemId !== hit.cab.id) selectItem(hit.cab.id);

      // Phone is view-only — no dragging
      if (window.innerWidth <= 767) return;

      e.preventDefault();
      const effectiveScale = info.scale * vpState.floor.zoom;
      if (hit.isIsland) {
        drag = { cabId: hit.cab.id, startMX: t.clientX-rect.left, startMY: t.clientY-rect.top,
                 startX: hit.cab.x, startY: hit.cab.y, scale: effectiveScale, isIsland: true };
      } else {
        drag = { cabId: hit.cab.id, startMX: t.clientX-rect.left, startMY: t.clientY-rect.top,
                 startOffset: hit.cab.offset||0, scale: effectiveScale,
                 isNS: hit.wall==='north'||hit.wall==='south'||hit.wall==='step2' };
      }
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (!drag) return;
      const info = getCanvasInfo(); if (!info) return;
      const rect = canvas.getBoundingClientRect(); const t = e.touches[0];
      if (drag.isIsland) {
        const isl = (info.r.islands||[]).find(i => i.id === drag.cabId);
        if (isl) {
          const roomW = Math.max(info.r.walls.north, info.r.walls.south, 48);
          const roomH = Math.max(info.r.walls.east,  info.r.walls.west,  48);
          isl.x = Math.max(0, Math.min(roomW - isl.width, Math.round(drag.startX + (t.clientX-rect.left - drag.startMX) / drag.scale)));
          isl.y = Math.max(0, Math.min(roomH - isl.depth, Math.round(drag.startY + (t.clientY-rect.top  - drag.startMY) / drag.scale)));
          tooltip.style.display='block'; tooltip.textContent=`${isl.label||'Island'} · ${isl.x}", ${isl.y}"`;
          persist(); renderCanvas(); renderCabinetList();
        }
      } else {
        const delta = drag.isNS ? (t.clientX-rect.left-drag.startMX) : (t.clientY-rect.top-drag.startMY);
        const cab = info.r.cabinets.find(c=>c.id===drag.cabId) || (info.r.appliances||[]).find(a=>a.id===drag.cabId);
        if (cab) {
          const newOffset = resolveMoveOffset(info.r, cab, drag.startOffset + delta / drag.scale);
          if (newOffset !== cab.offset) { cab.offset = newOffset; persist(); renderCanvas(); renderCabinetList(); }
          tooltip.style.display='block'; tooltip.textContent=`${fmtFrac(newOffset)} from left`;
        }
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => { if(drag){ drag=null; setTimeout(()=>{ tooltip.style.display='none'; }, 1200); } });
  }
})();

