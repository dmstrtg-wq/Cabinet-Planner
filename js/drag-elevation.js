// My Cabinet Planner — js/drag-elevation.js
// Elevation mouse/touch: drag, pan, double-click edit.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// DRAG ON ELEVATION
// ════════════════════════════
(function(){
  let elevDrag = null, elevHover = null;

  function getElevInfo() {
    const r = activeRoom(); if (!r) return null;
    const scale = ELEV_SCALE;
    const wall = state.elevWall;
    const wallLength = wallLengthOf(r, wall) || 120;
    const ceiling = r.ceilingHeight || 96;
    const WW = wallLength*scale, WH = ceiling*scale;
    // Use the renderer's actual origin — its padding grows when Dims is on (was a fixed 60,
    // which made clicks land 40px off with dimensions showing).
    const g = vpGeom.elev;
    const WX = g ? g.originX : 60, WY = g ? g.originY - WH : 60;
    return { scale, WX, WY, WW, WH, r, wall, ceiling, wallLength };
  }

  function hitTestElevCab(mx, my, info) {
    if (READ_ONLY) return null;   // share link: clicks pan, never pick up a cabinet
    const { scale, WX, WY, WH, WW, r, wall } = info;
    const floorY = WY + WH;
    const flip = wallFlipped(r, wall);
    const eX = (offset, width) => flip ? WX + WW - (offset + width)*scale : WX + offset*scale;
    const hitApp = app => {
      const acat = APPLIANCES[app.type]; if (!acat) return false;
      const aW = app.width*scale, aH = (itemVerticalRange(app)[1] - itemVerticalRange(app)[0])*scale;
      const x  = eX(app.offset||0, app.width);
      const y  = floorY - itemVerticalRange(app)[0]*scale - aH;
      return mx>=x&&mx<=x+aW&&my>=y&&my<=y+aH;
    };
    // A built-in (wall oven, microwave drawer, cooktop) sits inside a cabinet: it wins the click
    const apps = (r.appliances||[]).filter(a => a.wall === wall && layerShowsItem(a));
    const inner = apps.find(a => applianceHost(r, a) && hitApp(a)); if (inner) return inner;
    for (const cab of r.cabinets.filter(c => c.wall === wall && layerShowsItem(c))) {
      const [bIn, tIn] = itemVerticalRange(cab);          // (uppers, raised fillers and end panels at their real height)
      const cW = cab.width*scale, cH = (tIn - bIn)*scale;
      const x = eX(cab.offset||0, cab.width);
      const y = Math.max(WY, floorY - tIn*scale);
      if (mx>=x&&mx<=x+cW&&my>=y&&my<=y+cH) return cab;
    }
    const app = apps.find(hitApp); if (app) return app;
    // Doors and windows (behind the cabinets): the opening plus its casing
    if (layers.openings) {
      for (const op of (r.openings || []).filter(o => o.wall === wall && o.type !== 'sink-loc')) {
        const bot = op.type === 'window' ? (op.sillHeight ?? 36) : 0, pad = 3.5 * scale;
        const x = eX(op.offset || 0, op.width), y = floorY - (bot + op.height) * scale;
        if (mx >= x - pad && mx <= x + op.width * scale + pad && my >= y - pad && my <= floorY - bot * scale + pad) return { ...op, _opening: true };
      }
    }
    return null;
  }

  const canvas  = document.getElementById('elevation-plan');
  const tooltip = document.getElementById('drag-tooltip');

  canvas.addEventListener('dblclick', e => {
    if (state.viewMode !== 'elevation') return;
    const info = getElevInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const ze = vpState.elev.zoom;
    const hit  = hitTestElevCab((e.clientX-rect.left)/ze, (e.clientY-rect.top)/ze, info);
    if (!hit) return;
    e.preventDefault();
    if (hit._opening) { openOpeningPopover((info.r.openings || []).find(o => o.id === hit.id), e.clientX, e.clientY); return; }
    openItemPopover(hit, e.clientX, e.clientY);
  });

  let elevPan = null;
  canvas.addEventListener('mousedown', e => {
    if (state.viewMode !== 'elevation') return;
    const info = getElevInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const ze = vpState.elev.zoom;
    const cab  = hitTestElevCab((e.clientX - rect.left)/ze, (e.clientY - rect.top)/ze, info);
    if (!cab) {
      // No cabinet hit — start pan
      e.preventDefault();
      const vp = document.getElementById('elev-viewport');
      if (!vp) return;
      const st = vpState.elev;
      elevPan = { startX: e.clientX, startY: e.clientY, px: st.panX, py: st.panY, moved: false };
      vp.classList.add('panning');
      return;
    }
    e.preventDefault();
    if (!cab._opening && selectedItemId !== cab.id) selectItem(cab.id);
    const effectiveElevScale = info.scale * vpState.elev.zoom;
    elevDrag = { cabId: cab.id, startMX: e.clientX - rect.left, startMY: e.clientY - rect.top, startSill: cab.sillHeight ?? 36, startOffset: cab.offset || 0, scale: effectiveElevScale, wallLength: info.wallLength, cabWidth: cab.width, wall: info.wall };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (state.viewMode !== 'elevation') return;
    const info = getElevInfo(); if (!info) return;
    const rect = canvas.getBoundingClientRect();
    const ze = vpState.elev.zoom;
    // mx in screen px for drag delta; hx in canvas px for hit testing
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hx = mx/ze, hy = my/ze;

    if (elevPan) {
      if (Math.abs(e.clientX - elevPan.startX) + Math.abs(e.clientY - elevPan.startY) > 3) elevPan.moved = true;
      vpState.elev.panX = elevPan.px + (e.clientX - elevPan.startX);
      vpState.elev.panY = elevPan.py + (e.clientY - elevPan.startY);
      applyVpTransform('elev');
      return;
    }

    if (elevDrag) {
      const delta = mx - elevDrag.startMX;
      const flip  = wallFlipped(activeRoom(), elevDrag.wall);
      const raw   = elevDrag.startOffset + (flip ? -delta : delta) / elevDrag.scale;
      const op = (info.r.openings||[]).find(o=>o.id===elevDrag.cabId);
      if (op) {
        const res = resolveOpeningOffset(info.r, op, raw, e.altKey);   // Option/Alt: no snapping
        // A window also moves up and down (doors and openings stay on the floor)
        const sill = op.type === 'window' ? resolveWindowSill(info.r, op, elevDrag.startSill - (my - elevDrag.startMY) / elevDrag.scale) : op.sillHeight;
        if (res.offset !== op.offset || sill !== op.sillHeight) { op.offset = res.offset; if (op.type === 'window') op.sillHeight = sill; persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display = 'block'; tooltip.textContent = openingDragText(op, res);
        return;
      }
      const cab = info.r.cabinets.find(c=>c.id===elevDrag.cabId) || (info.r.appliances||[]).find(a=>a.id===elevDrag.cabId);
      if (cab) {
        const newOffset = resolveMoveOffset(info.r, cab, raw);
        if (newOffset !== cab.offset) { setItemOffset(info.r, cab, newOffset); persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display = 'block';
        tooltip.textContent = `${fmtFrac(newOffset)} from left`;
      }
    } else {
      const cab = hitTestElevCab(hx, hy, info);
      if (cab) {
        canvas.style.cursor = 'grab';
        if (elevHover !== cab.id) {
          elevHover = cab.id;
          const lbl = cab._opening ? (OPENING_LABELS[cab.type] || 'Opening') : (CATALOG[cab.type]?.label || APPLIANCES[cab.type]?.label || cab.type);
          tooltip.style.display = 'block';
          tooltip.textContent = `${lbl} · ${cab.offset || 0}" from left — drag to move`;
        }
      } else {
        canvas.style.cursor = '';   // let viewport's grab cursor show through
        if (elevHover) { elevHover = null; tooltip.style.display = 'none'; }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (elevPan) {
      if (!elevPan.moved && selectedItemId) selectItem(null); // plain click on empty space
      elevPan = null;
      const vp = document.getElementById('elev-viewport');
      if (vp) vp.classList.remove('panning');
    }
    if (elevDrag) {
      elevDrag = null;
      canvas.style.cursor = 'default';
      setTimeout(() => { tooltip.style.display = 'none'; }, 1200);
    }
  });

  // ── Elevation touch: pan, drag, double-tap to edit ───────────────────────
  {
    let elvLastTapTime = 0, elvLastTapId = null;
    canvas.addEventListener('touchstart', e => {
      if (state.viewMode !== 'elevation') return;
      if (e.touches.length !== 1) return;
      const info = getElevInfo(); if (!info) return;
      const rect = canvas.getBoundingClientRect(); const t = e.touches[0];
      const ze = vpState.elev.zoom;
      const cab = hitTestElevCab((t.clientX-rect.left)/ze, (t.clientY-rect.top)/ze, info);

      // No cabinet hit → single-finger pan
      if (!cab) {
        const vp = document.getElementById('elev-viewport');
        if (!vp) return;
        const st = vpState.elev;
        const panStart = { x: t.clientX, y: t.clientY, px: st.panX, py: st.panY };
        vp.classList.add('panning');
        function onEPanMove(ev) {
          if (ev.touches.length !== 1) return;
          const tt = ev.touches[0];
          st.panX = panStart.px + (tt.clientX - panStart.x);
          st.panY = panStart.py + (tt.clientY - panStart.y);
          applyVpTransform('elev');
          ev.preventDefault();
        }
        function onEPanEnd() {
          vp.classList.remove('panning');
          window.removeEventListener('touchmove', onEPanMove);
          window.removeEventListener('touchend', onEPanEnd);
        }
        window.addEventListener('touchmove', onEPanMove, { passive: false });
        window.addEventListener('touchend', onEPanEnd);
        return;
      }

      // Double-tap to edit
      const now = Date.now();
      if (now - elvLastTapTime < 350 && elvLastTapId === cab.id) {
        elvLastTapTime = 0; elvLastTapId = null;
        if (cab._opening) { openOpeningPopover((info.r.openings || []).find(o => o.id === cab.id), t.clientX, t.clientY); e.preventDefault(); return; }
        openItemPopover(cab, t.clientX, t.clientY);
        e.preventDefault();
        return;
      }
      elvLastTapTime = now; elvLastTapId = cab.id;
      if (!cab._opening && selectedItemId !== cab.id) selectItem(cab.id);

      // Phone is view-only
      if (window.innerWidth <= 767) return;

      e.preventDefault();
      elevDrag = { cabId: cab.id, startMX: t.clientX-rect.left, startMY: t.clientY-rect.top, startSill: cab.sillHeight ?? 36, startOffset: cab.offset||0,
                   scale: info.scale * vpState.elev.zoom, wallLength: info.wallLength,
                   cabWidth: cab.width, wall: info.wall };
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (!elevDrag || state.viewMode !== 'elevation') return;
      const info = getElevInfo(); if (!info) return;
      const rect = canvas.getBoundingClientRect(); const t = e.touches[0];
      const delta = t.clientX - rect.left - elevDrag.startMX;
      const flip  = wallFlipped(activeRoom(), elevDrag.wall);
      const op = (info.r.openings||[]).find(o => o.id === elevDrag.cabId);
      if (op) {
        const res = resolveOpeningOffset(info.r, op, elevDrag.startOffset + (flip ? -delta : delta) / elevDrag.scale);
        const sill = op.type === 'window' ? resolveWindowSill(info.r, op, elevDrag.startSill - (t.clientY - rect.top - elevDrag.startMY) / elevDrag.scale) : op.sillHeight;
        if (res.offset !== op.offset || sill !== op.sillHeight) { op.offset = res.offset; if (op.type === 'window') op.sillHeight = sill; persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display='block'; tooltip.textContent = openingDragText(op, res);
        e.preventDefault(); return;
      }
      const cab = info.r.cabinets.find(c => c.id === elevDrag.cabId) || (info.r.appliances||[]).find(a => a.id === elevDrag.cabId);
      if (cab) {
        const newOffset = resolveMoveOffset(info.r, cab, elevDrag.startOffset + (flip ? -delta : delta) / elevDrag.scale);
        if (newOffset !== cab.offset) { setItemOffset(info.r, cab, newOffset); persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display='block'; tooltip.textContent=`${fmtFrac(newOffset)} from left`;
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (elevDrag) { elevDrag=null; setTimeout(()=>{ tooltip.style.display='none'; }, 1200); }
    });
  }
})();

