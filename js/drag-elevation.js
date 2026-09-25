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
    const wallLength = r.walls[wall] || 120;
    const ceiling = r.ceilingHeight || 96;
    const WW = wallLength*scale, WH = ceiling*scale;
    // Use the renderer's actual origin — its padding grows when Dims is on (was a fixed 60,
    // which made clicks land 40px off with dimensions showing).
    const g = vpGeom.elev;
    const WX = g ? g.originX : 60, WY = g ? g.originY - WH : 60;
    return { scale, WX, WY, WW, WH, r, wall, ceiling, wallLength };
  }

  function hitTestElevCab(mx, my, info) {
    const { scale, WX, WY, WH, WW, r, wall } = info;
    const floorY = WY + WH;
    const flip = wall === 'south' || wall === 'west';
    const eX = (offset, width) => flip ? WX + WW - (offset + width)*scale : WX + offset*scale;
    for (const cab of r.cabinets.filter(c => c.wall === wall && layerShowsItem(c))) {
      const cW = cab.width*scale, cH = cab.height*scale;
      const x = eX(cab.offset||0, cab.width);
      const bIn = (cab.type==='wall'||cab.type==='diagWall') ? (cab.wallBottom != null ? cab.wallBottom : 54) : 0;
      const y = (cab.type==='wall'||cab.type==='diagWall') ? Math.max(WY, floorY-bIn*scale-cH) : floorY-cH;
      if (mx>=x&&mx<=x+cW&&my>=y&&my<=y+cH) return cab;
    }
    for (const app of (r.appliances||[]).filter(a => a.wall === wall && layerShowsItem(a))) {
      const acat = APPLIANCES[app.type]; if (!acat) continue;
      const aW = app.width*scale, aH = (app.height||acat.height)*scale;
      const x  = eX(app.offset||0, app.width);
      const y  = floorY - (app.customElevBottom != null ? app.customElevBottom : acat.elevBottom)*scale - aH;
      if (mx>=x&&mx<=x+aW&&my>=y&&my<=y+aH) return app;
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
    if (selectedItemId !== cab.id) selectItem(cab.id);
    const effectiveElevScale = info.scale * vpState.elev.zoom;
    elevDrag = { cabId: cab.id, startMX: e.clientX - rect.left, startOffset: cab.offset || 0, scale: effectiveElevScale, wallLength: info.wallLength, cabWidth: cab.width, wall: info.wall };
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
      const flip  = elevDrag.wall === 'south' || elevDrag.wall === 'west';
      const raw   = elevDrag.startOffset + (flip ? -delta : delta) / elevDrag.scale;
      const cab = info.r.cabinets.find(c=>c.id===elevDrag.cabId) || (info.r.appliances||[]).find(a=>a.id===elevDrag.cabId);
      if (cab) {
        const newOffset = resolveMoveOffset(info.r, cab, raw);
        if (newOffset !== cab.offset) { cab.offset = newOffset; persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display = 'block';
        tooltip.textContent = `${fmtFrac(newOffset)} from left`;
      }
    } else {
      const cab = hitTestElevCab(hx, hy, info);
      if (cab) {
        canvas.style.cursor = 'grab';
        if (elevHover !== cab.id) {
          elevHover = cab.id;
          const lbl = CATALOG[cab.type]?.label || APPLIANCES[cab.type]?.label || cab.type;
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
        openItemPopover(cab, t.clientX, t.clientY);
        e.preventDefault();
        return;
      }
      elvLastTapTime = now; elvLastTapId = cab.id;
      if (selectedItemId !== cab.id) selectItem(cab.id);

      // Phone is view-only
      if (window.innerWidth <= 767) return;

      e.preventDefault();
      elevDrag = { cabId: cab.id, startMX: t.clientX-rect.left, startOffset: cab.offset||0,
                   scale: info.scale * vpState.elev.zoom, wallLength: info.wallLength,
                   cabWidth: cab.width, wall: info.wall };
    }, { passive: false });

    window.addEventListener('touchmove', e => {
      if (!elevDrag || state.viewMode !== 'elevation') return;
      const info = getElevInfo(); if (!info) return;
      const rect = canvas.getBoundingClientRect(); const t = e.touches[0];
      const delta = t.clientX - rect.left - elevDrag.startMX;
      const flip  = elevDrag.wall === 'south' || elevDrag.wall === 'west';
      const cab = info.r.cabinets.find(c => c.id === elevDrag.cabId) || (info.r.appliances||[]).find(a => a.id === elevDrag.cabId);
      if (cab) {
        const newOffset = resolveMoveOffset(info.r, cab, elevDrag.startOffset + (flip ? -delta : delta) / elevDrag.scale);
        if (newOffset !== cab.offset) { cab.offset = newOffset; persist(); renderElevation(); renderCanvas(); renderCabinetList(); }
        tooltip.style.display='block'; tooltip.textContent=`${fmtFrac(newOffset)} from left`;
      }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (elevDrag) { elevDrag=null; setTimeout(()=>{ tooltip.style.display='none'; }, 1200); }
    });
  }
})();

