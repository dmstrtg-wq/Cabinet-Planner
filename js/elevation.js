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
  ctx.strokeStyle = PDF ? '#555555' : '#94A3B8'; ctx.lineWidth = PDF ? 1.5 : 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(WX,counterY); ctx.lineTo(WX+WW,counterY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = PDF ? '#555555' : '#94A3B8'; ctx.font = '500 9px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Counter Height 36"', WX+4, counterY-4);

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

  wallOpenings.forEach(op => {
    const ox = eX(op.offset||0, op.width), oW = op.width*scale, oH = op.height*scale;
    if (op.type==='window') {
      const sillY = floorY-(op.sillHeight||36)*scale-oH;
      ctx.fillStyle='#BAE6FD'; ctx.fillRect(ox+2,sillY,oW-4,oH);
      ctx.strokeStyle='#0369A1'; ctx.lineWidth=2; ctx.setLineDash([]); ctx.strokeRect(ox+2,sillY,oW-4,oH);
      ctx.strokeStyle='#7dd3fc'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(ox+2+oW/2,sillY); ctx.lineTo(ox+2+oW/2,sillY+oH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+2,sillY+oH/2); ctx.lineTo(ox+2+oW-4,sillY+oH/2); ctx.stroke();
      ctx.fillStyle='#0369A1'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('W '+op.width+'"', ox+oW/2, sillY-4);
    } else if (op.type==='door') {
      ctx.fillStyle='#FEF9C3'; ctx.fillRect(ox,floorY-oH,oW,oH);
      ctx.strokeStyle='#D97706'; ctx.lineWidth=2; ctx.setLineDash([]); ctx.strokeRect(ox,floorY-oH,oW,oH);
      ctx.strokeStyle='#F59E0B'; ctx.lineWidth=1.5;
      ctx.beginPath();
      if (flip) { ctx.arc(ox+oW,floorY,oW,Math.PI,Math.PI*1.5); }
      else       { ctx.arc(ox,floorY,oW,Math.PI*1.5,Math.PI*2); }
      ctx.stroke();
      ctx.fillStyle='#D97706'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('D '+op.width+'"', ox+oW/2, floorY-oH-4);
    } else if (op.type==='sink-loc') {
      ctx.fillStyle='#E0F2FE'; ctx.fillRect(ox,counterY-12,oW,12);
      ctx.strokeStyle='#0284C7'; ctx.lineWidth=1.5; ctx.setLineDash([]); ctx.strokeRect(ox,counterY-12,oW,12);
      ctx.strokeStyle='#0284C7'; ctx.lineWidth=1; ctx.strokeRect(ox+4,counterY-10,oW-8,8);
      ctx.fillStyle='#0284C7'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('S '+op.width+'"', ox+oW/2, counterY-14);
    } else {
      ctx.fillStyle='rgba(241,245,249,0.6)'; ctx.fillRect(ox,floorY-oH,oW,oH);
      ctx.strokeStyle='#7C3AED'; ctx.lineWidth=2; ctx.setLineDash([4,4]); ctx.strokeRect(ox,floorY-oH,oW,oH); ctx.setLineDash([]);
      ctx.fillStyle='#7C3AED'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText('O '+op.width+'"', ox+oW/2, floorY-oH-4);
    }
  });

  const darkSwatches = ['#2B2926','#1B3A5C','#4B4F5C','#5B6069','#1C1B1A'];
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
    if (bot === 0) { ctx.fillStyle = PDF ? '#888888' : '#94A3B8'; ctx.fillRect(x, floorY-7, cW, 7); }   // toe kick
    const label = 'FL ' + fmtFrac(cab.width);
    ctx.fillStyle = PDF ? '#1a1a1a' : (darkSwatches.includes(si.swatch) ? '#fff' : '#334155');
    ctx.font = `600 ${Math.max(8, Math.min(scale*1.7, 10))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(x + cW/2, y + cH/2);
    if (ctx.measureText(label).width > cW - 2) ctx.rotate(-Math.PI/2);   // narrow filler: label runs up the board
    ctx.fillText(label, 0, 0); ctx.restore();
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x + cW/2, y, cab.itemNum, PDF);
  });

  wallCabs.filter(c=>['base','sink','vanity','drawerBase','cornerBase','lazysusan','fridgePanel'].includes(c.type)).forEach(cab => {
    const cat=CATALOG[cab.type], cW=cab.width*scale, cH=(cab.height||cat.heights?.[0]||34.5)*scale;
    const x=eX(cab.offset||0, cab.width), y=floorY-cH;
    const isCorner=cab.type==='cornerBase';
    const si=cabStyle(cab);
    const txtColor=darkSwatches.includes(si.swatch)?'#fff':'#334155';
    if (isCorner) {
      const cutW=cW*0.28;
      ctx.fillStyle=PDF?'#FFFFFF':si.swatch;
      ctx.beginPath(); ctx.moveTo(x+cutW,y); ctx.lineTo(x+cW,y); ctx.lineTo(x+cW,y+cH); ctx.lineTo(x,y+cH); ctx.lineTo(x,y+cH*0.12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle=PDF?'#1a1a1a':'#64748B'; ctx.lineWidth=PDF?2:1.5; ctx.stroke();
      ctx.strokeStyle=PDF?'#888888':'#94A3B8'; ctx.beginPath(); ctx.moveTo(x,y+cH*0.12); ctx.lineTo(x+cutW,y); ctx.stroke();
      ctx.strokeStyle=PDF?'#333333':'#475569'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x+cutW+3,y+5); ctx.lineTo(x+cW-4,y+5); ctx.lineTo(x+cW-4,y+cH-12); ctx.lineTo(x+4,y+cH-12); ctx.lineTo(x+4,y+cH*0.18); ctx.closePath(); ctx.stroke();
      ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(x+cW*0.55-7,y+cH-18,14,5,2); ctx.fill();
      ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.fillRect(x,floorY-7,cW,7);
      ctx.fillStyle=PDF?'#D0D0D0':'#E2E8F0'; ctx.fillRect(x-1,y-4,cW+2,4);
      ctx.fillStyle=PDF?'#1a1a1a':txtColor; ctx.font=`600 ${Math.max(8,Math.min(scale*1.9,11))}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`${cat.abbr}${cab.width}`, x+cW*0.6, y+cH*0.5);
    } else {
      ctx.fillStyle=PDF?'#FFFFFF':si.swatch; ctx.fillRect(x,y,cW,cH);
      ctx.strokeStyle=PDF?'#1a1a1a':'#64748B'; ctx.lineWidth=PDF?2:1.5; ctx.strokeRect(x,y,cW,cH);
      if (cab.type === 'lazysusan') {
        // Bifolding door — two panels meeting at center fold
        const midX = x + cW/2;
        ctx.strokeStyle=PDF?'#333333':'#475569'; ctx.lineWidth=1;
        ctx.strokeRect(x+3, y+4, cW/2-4, cH-14); // left panel
        ctx.strokeRect(midX+1, y+4, cW/2-4, cH-14); // right panel
        ctx.strokeStyle=PDF?'#888888':'#94A3B8'; ctx.lineWidth=1.5; ctx.setLineDash([3,2]);
        ctx.beginPath(); ctx.moveTo(midX, y+4); ctx.lineTo(midX, y+cH-10); ctx.stroke();
        ctx.setLineDash([]);
        // Bifolding knobs at center fold
        ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.arc(midX, y+cH*0.45, 3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(midX, y+cH*0.55, 3, 0, Math.PI*2); ctx.fill();
      } else {
        drawDoorPanel(ctx, x, y, cW, cH, si.code, scale, PDF);
        ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(x+cW*0.5-8,y+cH-19,16,6,3); ctx.fill();
      }
      ctx.fillStyle=PDF?'#888888':'#94A3B8'; ctx.fillRect(x,floorY-7,cW,7);
      ctx.fillStyle=PDF?'#D0D0D0':'#E2E8F0'; ctx.fillRect(x-1,y-4,cW+2,4);
      ctx.fillStyle=PDF?'#1a1a1a':txtColor; const fs=Math.max(8,Math.min(scale*1.9,11)); ctx.font=`600 ${fs}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`${cat.abbr}${cab.width}`, x+cW/2, y+cH/2);
    }
    if (cab.note) { ctx.font=`italic ${Math.max(7,Math.min(scale*1.6,10))}px sans-serif`; ctx.fillStyle='#64748B'; ctx.textBaseline='bottom'; ctx.fillText(cab.note,x+cW/2,y-6); }
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x + (isCorner ? cW*0.6 : cW/2), y, cab.itemNum, PDF);
  });

  wallCabs.filter(c=>['wall','diagWall'].includes(c.type)).forEach(cab => {
    const cat=CATALOG[cab.type], cW=cab.width*scale, cH=(cab.height||cat.heights?.[0]||30)*scale;
    const bottomIn = cab.wallBottom != null ? cab.wallBottom : 54;
    const y=Math.max(WY, floorY-bottomIn*scale-cH);
    const x=eX(cab.offset||0, cab.width);
    const si=cabStyle(cab); const txtColor=darkSwatches.includes(si.swatch)?'#fff':'#334155';
    if (cab.type === 'diagWall') {
      // Diagonal corner wall cabinet. Seen straight-on from this wall it reads as a plain
      // full-height rectangle: the half nearest the corner is the finished end of the leg
      // that runs down the adjacent wall, the other half is the 45° door, foreshortened.
      // (It used to be drawn with a chamfer clipped off the top corner, which looked like
      // a damaged cabinet rather than a corner unit.)
      ctx.fillStyle=PDF?'#F8F8F8':si.swatch; ctx.strokeStyle=PDF?'#1a1a1a':'#94A3B8'; ctx.lineWidth=PDF?2:1.5;
      ctx.fillRect(x,y,cW,cH); ctx.strokeRect(x,y,cW,cH);
      const nearLeft  = (x - WX) <= scale + 0.5;
      const nearRight = (WX + WW - (x + cW)) <= scale + 0.5;
      if (nearLeft || nearRight) {
        const half = cW/2, doorX = nearLeft ? x + half : x;
        drawDoorPanel(ctx, doorX, y, half, cH, si.code, scale, PDF);
        // Seam between the door and the end panel
        ctx.strokeStyle=PDF?'#444444':'#CBD5E1'; ctx.lineWidth=PDF?1:0.8;
        ctx.beginPath(); ctx.moveTo(x+half, y); ctx.lineTo(x+half, y+cH); ctx.stroke();
        ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(doorX+half/2-6,y+cH-12,12,4,2); ctx.fill();
      } else {
        // Not actually in a corner (odd placement) — show it like a standard wall cabinet
        drawDoorPanel(ctx, x, y, cW, cH, si.code, scale, PDF);
        ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(x+cW*0.5-6,y+cH-12,12,4,2); ctx.fill();
      }
      ctx.fillStyle=PDF?'#1a1a1a':txtColor; const fs2=Math.max(8,Math.min(scale*1.9,11)); ctx.font=`600 ${fs2}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`DCW${cab.width}`, x+cW/2, y+cH/2);
    } else {
      ctx.fillStyle=PDF?'#F8F8F8':si.swatch; ctx.strokeStyle=PDF?'#1a1a1a':'#94A3B8'; ctx.lineWidth=PDF?2:1.5;
      ctx.fillRect(x,y,cW,cH); ctx.strokeRect(x,y,cW,cH);
      drawDoorPanel(ctx, x, y, cW, cH, si.code, scale, PDF);
      ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(x+cW*0.5-6,y+cH-12,12,4,2); ctx.fill();
      ctx.fillStyle=PDF?'#1a1a1a':txtColor; const fs=Math.max(8,Math.min(scale*1.9,11)); ctx.font=`600 ${fs}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(`W${cab.width}`, x+cW/2, y+cH/2);
      if (cab.note) { ctx.font=`italic ${fs-1}px sans-serif`; ctx.fillStyle=PDF?'#333333':'#64748B'; ctx.textBaseline='top'; ctx.fillText(cab.note,x+cW/2,y-12); }
    }
    // Bottom-from-floor annotation (both types)
    const bIn = cab.wallBottom != null ? cab.wallBottom : 54;
    if (bIn !== 54) {
      ctx.font=`600 8px sans-serif`; ctx.fillStyle=PDF?'#333333':'#f59e0b'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(`↑${bIn}" from floor`, x+cW/2, y+cH+3);
    }
    if (cab.note && cab.type !== 'diagWall') { ctx.font=`italic ${Math.max(7,Math.min(scale*1.6,10))}px sans-serif`; ctx.fillStyle='#64748B'; ctx.textBaseline='bottom'; ctx.fillText(cab.note,x+cW/2,y-6); }
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x + cW/2, y, cab.itemNum, PDF);
  });

  wallCabs.filter(c=>c.type==='tall').forEach(cab => {
    const cat=CATALOG[cab.type], cW=cab.width*scale, cH=(cab.height||cat.heights?.[0]||84)*scale;
    const x=eX(cab.offset||0, cab.width), y=floorY-cH;
    const si=cabStyle(cab); const txtColor=darkSwatches.includes(si.swatch)?'#fff':'#334155';
    ctx.fillStyle=PDF?'#FFFFFF':si.swatch; ctx.strokeStyle=PDF?'#1a1a1a':'#64748B'; ctx.lineWidth=PDF?2:1.5;
    ctx.fillRect(x,y,cW,cH); ctx.strokeRect(x,y,cW,cH);
    const mid=y+cH/2;
    drawDoorPanel(ctx, x, y, cW, cH/2, si.code, scale, PDF);
    drawDoorPanel(ctx, x, mid, cW, cH/2, si.code, scale, PDF);
    ctx.fillStyle=PDF?'#555555':'#94A3B8'; ctx.beginPath(); ctx.roundRect(x+cW/2-8,mid-3,16,6,3); ctx.fill();
    ctx.fillStyle=PDF?'#1a1a1a':txtColor; ctx.font=`bold ${Math.max(8,Math.min(scale*2,12))}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`WP${cab.width}`, x+cW/2, y+cH/2);
    if (showItemNumbers && cab.itemNum) drawItemHexagon(ctx, x+cW/2, y, cab.itemNum, PDF);
  });

  // ── Corner cabinet crossover: adjacent-wall corner cabs shown at elevation edges ──
  // A lazysusan/cornerBase/diagWall physically spans two walls; show the depth face here.
  {
    const CORNER_CAB_TYPES = ['lazysusan','cornerBase','diagWall'];
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
        ctx.fillStyle = PDF ? '#475569' : (darkSwatches.includes(si.swatch) ? '#fff' : '#475569');
        ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cat.abbr || '', x + cW / 2, y + cH / 2);
      });
    });
  }

  // Appliances in elevation
  (r.appliances||[]).filter(a => a.wall === wall && layerShowsItem(a)).forEach(app => {
    const acat = APPLIANCES[app.type]; if (!acat) return;
    const aW   = app.width * scale;
    const aH   = (app.height || acat.height) * scale;
    const x    = eX(app.offset||0, app.width);
    const botY = floorY - (app.customElevBottom != null ? app.customElevBottom : acat.elevBottom) * scale; // bottom edge Y
    const y    = botY - aH;                        // top edge Y

    drawApplianceFace(ctx, app, acat, x, y, aW, aH, scale);
    if (app.note) {
      ctx.font=`italic ${Math.max(7,scale*1.4)}px sans-serif`; ctx.fillStyle='#64748B';
      ctx.textBaseline='bottom'; ctx.fillText(app.note, x+aW/2, y-4);
    }
    if (showItemNumbers && app.itemNum) drawItemHexagon(ctx, x+aW/2, y, app.itemNum, PDF);
  });

  // PDF: dimension callout strings
  if (PDF) {
    function pdfDimString(items, dimY, above) {
      ctx.save();
      ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 0.8; ctx.setLineDash([]);
      items.forEach(({x1, x2, label}) => {
        if (x2 - x1 < 6) return;
        const midX = (x1+x2)/2;
        const tickOuter = above ? dimY - 10 : dimY + 10;
        const tickInner = above ? dimY + 2  : dimY - 2;
        // Extension lines
        ctx.beginPath(); ctx.moveTo(x1, tickOuter); ctx.lineTo(x1, tickInner); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, tickOuter); ctx.lineTo(x2, tickInner); ctx.stroke();
        // Dimension line
        ctx.beginPath(); ctx.moveTo(x1, dimY); ctx.lineTo(x2, dimY); ctx.stroke();
        // Slash ticks at ends (architectural style)
        const sl = 5;
        ctx.beginPath(); ctx.moveTo(x1-sl*0.5, dimY+sl*0.6); ctx.lineTo(x1+sl*0.5, dimY-sl*0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2-sl*0.5, dimY+sl*0.6); ctx.lineTo(x2+sl*0.5, dimY-sl*0.6); ctx.stroke();
        // Label
        const fs2 = Math.max(7, Math.min(10, (x2-x1)*0.14));
        ctx.font = `700 ${fs2}px sans-serif`; ctx.textAlign = 'center';
        ctx.textBaseline = above ? 'bottom' : 'top';
        ctx.fillText(label, midX, above ? dimY - 13 : dimY + 13);
      });
      ctx.restore();
    }
    // Upper cabinets → dim string above wall
    const upperDimItems = wallCabs
      .filter(c => ['wall','diagWall','tall'].includes(c.type))
      .map(c => ({ x1: eX(c.offset||0, c.width), x2: eX(c.offset||0, c.width) + c.width*scale, label: fmtFrac(c.width) }))
      .sort((a,b) => a.x1-b.x1);
    if (upperDimItems.length) pdfDimString(upperDimItems, WY - 28, true);
    // Base cabinets → dim string below floor
    const baseDimItems = wallCabs
      .filter(c => ['base','sink','vanity','drawerBase','cornerBase','lazysusan','fridgePanel'].includes(c.type) || (isFiller(c.type) && !(c.wallBottom > 0)))
      .map(c => ({ x1: eX(c.offset||0, c.width), x2: eX(c.offset||0, c.width) + c.width*scale, label: fmtFrac(c.width) }))
      .sort((a,b) => a.x1-b.x1);
    if (baseDimItems.length) pdfDimString(baseDimItems, WY + WH + 22, false);

    // Height chain (vertical) — counter height, then upper cabinet band — to the
    // left of the wall. Same architectural tick style as pdfDimString, rotated.
    function pdfDimStringV(items, dimX) {
      ctx.save();
      ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 0.8; ctx.setLineDash([]);
      items.forEach(({y1, y2, label}) => {
        if (Math.abs(y2 - y1) < 6) return;
        const midY = (y1+y2)/2;
        const tickOuter = dimX - 10, tickInner = dimX + 2;
        ctx.beginPath(); ctx.moveTo(tickOuter, y1); ctx.lineTo(tickInner, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tickOuter, y2); ctx.lineTo(tickInner, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dimX, y1); ctx.lineTo(dimX, y2); ctx.stroke();
        const sl = 5;
        ctx.beginPath(); ctx.moveTo(dimX-sl*0.6, y1+sl*0.5); ctx.lineTo(dimX+sl*0.6, y1-sl*0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dimX-sl*0.6, y2+sl*0.5); ctx.lineTo(dimX+sl*0.6, y2-sl*0.5); ctx.stroke();
        const fs2 = Math.max(7, Math.min(10, Math.abs(y2-y1)*0.14));
        ctx.save();
        ctx.translate(dimX-13, midY); ctx.rotate(-Math.PI/2);
        ctx.font = `700 ${fs2}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    }
    const counterInPdf = 36;
    pdfDimStringV([{ y1: floorY, y2: floorY - counterInPdf*scale, label: counterInPdf+'"' }], WX - 16);

    const wallCabsOnlyPdf = wallCabs.filter(c => ['wall','diagWall'].includes(c.type));
    if (wallCabsOnlyPdf.length) {
      const bottomInPdf = Math.min(...wallCabsOnlyPdf.map(c => c.wallBottom != null ? c.wallBottom : 54));
      const repPdf = wallCabsOnlyPdf.find(c => (c.wallBottom != null ? c.wallBottom : 54) === bottomInPdf);
      const catRPdf = CATALOG[repPdf.type];
      const hInPdf = repPdf.height || catRPdf.heights?.[0] || 30;
      const topInPdf = bottomInPdf + hInPdf;
      pdfDimStringV([{ y1: floorY - bottomInPdf*scale, y2: floorY - topInPdf*scale, label: hInPdf+'"' }], WX - 34);
    }
  }

  // On screen, rulers are drawn on the viewport edges (drawViewportRulers); the PDF
  // uses dimension strings instead.

  // Full dimension callouts (app mode, toggled by the Dims button) — individual
  // cabinet widths + overall total along the bottom, and a floor→counter→upper
  // cabinet band→ceiling height chain on the left.
  if (!PDF && showDimensions) {
    drawElevationDimensions(ctx, r, wall, scale, WX, WY, WW, floorY, eX);
  }

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

  if (!PDF) { drawElevGaps(ctx, r, wall, scale, floorY, eX); drawElevSelection(ctx, r, wall, scale, floorY, eX); drawElevGhost(ctx, r, wall, scale, floorY, eX); }
  ctx.strokeStyle=PDF?'#1a1a1a':'#334155'; ctx.lineWidth=PDF?2.5:3; ctx.strokeRect(WX,WY,WW,WH);
  ctx.fillStyle=PDF?'#888888':'#94A3B8'; ctx.fillRect(WX,WY-3,WW,3);
  ctx.fillStyle=PDF?'#1a1a1a':'#475569';
  const df=Math.max(10,scale*2.2); ctx.font=`700 ${df}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(fmtIn(wallLength), WX+WW/2, WY-(PDF?72:20));
  ctx.save(); ctx.translate(PDF ? WX-52 : WX-28, WY+WH/2); ctx.rotate(-Math.PI/2); ctx.fillText(fmtIn(ceiling),0,0); ctx.restore();
  const wallLabels = {north:'North',south:'South',east:'East',west:'West'};
  document.getElementById('elev-title').textContent = `${activeProj().customer} — ${activeRoom().name} · ${wallLabels[wall]} Wall Elevation`;
  if (vpState.elev.zoom === 1 && vpState.elev.panX === 0 && vpState.elev.panY === 0) {
    requestAnimationFrame(() => fitView('elev'));
  } else {
    applyVpTransform('elev');
  }
}

