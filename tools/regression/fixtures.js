// Builds the Phase 4 regression project (tools/regression/README.md).
window.buildRegressionProject = function () {
  // Ids are random: rename every id (and island wall references) to a fixed one, in order
  let text = JSON.stringify(_build()), n = 0;
  const ids = [...new Set([...text.matchAll(/"id":"([^"]+)"/g)].map(m => m[1]))];
  ids.forEach(id => { text = text.split(id).join('rg' + String(++n).padStart(4, '0')); });
  return JSON.parse(text);
};
function _build() {
  const p = buildDemoSampleProject(); p.createdAt = 1792700000000;
  p.id = 'regress-4-1a'; p.customer = 'Regression 4.1a';
  const A = p.rooms[0];
  const mk = (type, wall, width, offset, extra = {}) => ({ id: uid(), type, wall, width, offset, height: defaultCabHeight(type, A),
    depth: CATALOG[type].depth, note: '', wallBottom: ['wall', 'diagWall'].includes(type) ? 54 : (type === 'wallPanel' ? 54 : null),
    glassDoors: false, styleOverride: null, itemNum: 100 + A.cabinets.length, ...extra });
  const isl = A.islands[0]; isl.depth = 48; isl.seating = { e: 12 };
  const s = islandWallId(isl, 's'), n = islandWallId(isl, 'n');
  A.cabinets.push(mk('drawerBase', s, 18, 0), mk('sink', s, 24, 18), mk('base', s, 12, 42), mk('base', n, 30, 12), mk('basePanel', n, 0.75, 42));
  A.appliances.push({ id: uid(), type: 'dishwasher', wall: n, width: 24, height: APPLIANCES.dishwasher.height, note: '', offset: 0, customElevBottom: null, price: 650, itemNum: 150 });
  A.furniture = []; 
  // a bumped-out upper and a wall end panel on the north wall
  const up = A.cabinets.find(c => c.wall === 'north' && c.type === 'wall'); if (up) up.wallOffset = 3;
  A.cabinets.push(mk('wallPanel', 'east', 0.75, 26.25));
  // Room B: L-shaped kitchen with runs on the inner walls, a lazy susan and a diagonal upper
  const B = { id: 'regress-room-b', name: 'L Kitchen', kind: 'kitchen', walls: { north: 168, south: 120, east: 96, west: 144 }, ceilingHeight: 96,
    shape: 'L', lCut: { corner: 'NE', width: 48, depth: 48 }, cabinets: [], openings: [], appliances: [], islands: [], furniture: [] };
  const mb = (type, wall, width, offset, extra = {}) => ({ id: uid(), type, wall, width, offset, height: defaultCabHeight(type, B),
    depth: type === 'diagWall' ? 12 : CATALOG[type].depth, note: '', wallBottom: ['wall', 'diagWall'].includes(type) ? 54 : null, glassDoors: false, styleOverride: null, itemNum: B.cabinets.length + 1, ...extra });
  B.cabinets.push(mb('lazysusan', 'west', 36, 0), mb('base', 'west', 30, 36), mb('drawerBase', 'west', 24, 66), mb('diagWall', 'west', 24, 0), mb('wall', 'west', 30, 36),
    mb('base', 'north', 30, 36), mb('base', 'step1', 24, 0), mb('base', 'step2', 24, 10), mb('wall', 'step2', 24, 10), mb('tall', 'south', 24, 0), mb('filler3', 'south', 2.5, 24), mb('base', 'south', 36, 26.5));
  B.appliances.push({ id: uid(), type: 'refrigerator', wall: 'east', width: 36, height: APPLIANCES.refrigerator.height, note: '', offset: 0, customElevBottom: null, price: null, itemNum: 40 });
  B.openings.push({ id: uid(), type: 'window', wall: 'south', width: 30, height: 40, offset: 70, sillHeight: 42 });
  B.islands.push({ id: 'regress-isl-b', width: 60, depth: 30, x: 50, y: 70, label: 'Prep', seating: { s: 15, w: 10 } });
  // Rooms C-E: the bath, living and hall starter layouts
  const room = (id, name, kind, walls) => ({ id, name, kind, walls, ceilingHeight: 96, cabinets: [], openings: [], appliances: [], islands: [], furniture: [] });
  const C = room('regress-room-c', 'Bath', 'bath', { north: 96, south: 96, east: 84, west: 84 });
  const D = room('regress-room-d', 'Living', 'living', { north: 180, south: 180, east: 144, west: 144 });
  const E = room('regress-room-e', 'Hall', 'hall', { north: 120, south: 120, east: 60, west: 60 });
  bathStarterLayout(C); livingStarterLayout(D); hallStarterLayout(E);
  p.rooms.push(B, C, D, E);
  return JSON.parse(JSON.stringify(p));
}
