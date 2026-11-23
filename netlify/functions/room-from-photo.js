/**
 * Room from a photo or sketch (Build Plan 5.4, Dan 2026-11-22). Reads a picture of a room —
 * a hand sketch or floor plan with measurements, or a phone photo of the real room — and
 * describes it as corners, walls, doors and windows, cabinet runs and islands, for the
 * planner's review screen. Nothing is built or saved here: the browser shows the result,
 * the person fixes what's wrong, and only then is the room created (in their own browser /
 * account, like any room they draw).
 *
 * POST /.netlify/functions/room-from-photo
 * Headers: Authorization: Bearer <supabase-access-token>
 * Body: { requestId, mediaType: 'image/jpeg'|'image/png'|'image/webp'|'application/pdf', data: <base64>, kind?: 'kitchen'|… }
 *
 * Open to every signed-in account (Dan: "Everyone, including free"), with a daily limit per
 * account: free 3, Silver 10, Gold 25 pictures in a rolling 24 hours. Every call is logged to
 * price_import_log (step 'room-photo'; counts and tokens only, never the picture).
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
 *   optional: ROOM_PHOTO_MODEL (default claude-sonnet-5-5: fast enough to answer inside Netlify's time limit)
 */

const { createClient } = require('@supabase/supabase-js');
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default || sdk;

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MODEL = process.env.ROOM_PHOTO_MODEL || 'claude-sonnet-5-5';
const PER_DAY = { free: 3, silver: 10, gold: 25 };
const MAX_BODY = 5 * 1024 * 1024;   // Netlify's request limit is 6 MB

const CABINET_TYPES = ['base', 'drawerBase', 'sink', 'cornerBase', 'lazysusan', 'mwDrawerBase', 'wall', 'diagWall', 'tall', 'ovenTall',
  'vanity', 'linenTall', 'mediaBase', 'openTall', 'locker', 'bench', 'filler', 'basePanel', 'wallPanel', 'fridgePanel'];
const APPLIANCE_TYPES = ['refrigerator', 'range', 'cooktop', 'hood', 'dishwasher', 'microwave', 'wallOven', 'microwaveDrawer',
  'beverageCooler', 'toilet', 'tub', 'shower'];

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const num = { type: 'number' };
const item = {
  type: 'object', additionalProperties: false,
  required: ['code', 'type', 'width_in', 'height_in', 'gap_before_in', 'note'],
  properties: {
    code: { type: 'string', description: 'The code as written (B24, SB36, W3042, DW, 36" HOOD), or a short name if none is written.' },
    type: { type: 'string', enum: [...CABINET_TYPES, ...APPLIANCE_TYPES] },
    width_in: num,
    height_in: { anyOf: [num, { type: 'null' }], description: 'Only when the code or picture gives it (W3042 → 42); otherwise null.' },
    gap_before_in: { type: 'number', description: 'Empty space between the previous piece (or the run start) and this one, as drawn; 0 when they touch.' },
    note: { type: 'string', description: 'Extras written with it (2 roll-out trays, tray dividers, glass doors), or "".' },
  },
};
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['picture_kind', 'corners', 'walls', 'openings', 'runs', 'islands', 'notes'],
  properties: {
    picture_kind: { type: 'string', enum: ['sketch_or_plan', 'room_photo', 'not_a_room'] },
    corners: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: num, y: num } } },
    walls: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['length_in', 'measured', 'kind'],
      properties: { length_in: num, measured: { type: 'boolean' }, kind: { type: 'string', enum: ['full', 'half', 'open'] } } } },
    openings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['wall', 'type', 'offset_in', 'width_in'],
      properties: { wall: { type: 'integer' }, type: { type: 'string', enum: ['door', 'window', 'opening'] }, offset_in: num, width_in: num } } },
    runs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['wall', 'level', 'start_offset_in', 'items'],
      properties: { wall: { type: 'integer' }, level: { type: 'string', enum: ['base', 'upper', 'tall'] },
        start_offset_in: { anyOf: [num, { type: 'null' }] }, items: { type: 'array', items: item } } } },
    islands: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['x', 'y', 'width_in', 'depth_in', 'rotation_deg', 'note'],
      properties: { x: num, y: num, width_in: num, depth_in: num, rotation_deg: num, note: { type: 'string' } } } },
    notes: { type: 'array', items: { type: 'string' } },
  },
};

const SYSTEM = `You turn a picture of a room into a plan for a kitchen and bath cabinet design app. The picture is either a sketch or floor plan (hand drawn or printed, usually with measurements and cabinet codes written on it) or a photo of a real room.

WALLS VS. CABINET FRONTS (the most common mistake): a cabinet sketch usually draws only the cabinets, as a band along the walls. The walls are the OUTER lines the cabinets sit against. The line along the front of the cabinets, about 24" out from the wall for base cabinets (12" for uppers), is the cabinet fronts, never a wall, even when it is drawn as a solid line that closes the shape. The room is the open floor in front of the cabinets. When the picture doesn't show the rest of the room, close it with "open" walls (measured: false) placed far enough out that the floor in front of every cabinet is at least 48" deep, and far enough to hold any island that is placed in the room.

Describe the room in inches, looking down from above, with x to the right and y downward as the picture is drawn (for a photo, as if you were looking down at the floor plan of what you see).

corners: the room's outline, clockwise as seen from above, starting at the top-left-most corner. Wall k runs from corner k to corner k+1 (the last wall closes back to corner 0), so walls has exactly as many entries as corners. Keep every angle you see: most corners are 90°, but angled (45°) walls and cut corners are common.
- length_in: the wall's length. Use the measurement written on the picture when there is one (measured: true). When none is written, estimate from the drawing's scale or, in a photo, from standard sizes (base cabinets are 24" deep and 34.5" tall, counters 36" high, doors about 30–36" wide, uppers usually 30–42" tall, a standard range 30") and set measured: false.
- kind: "full" for a wall, "half" for a pony or half wall, "open" where the room opens to another space with no wall.
- The corner coordinates must agree with the wall lengths.

openings: doors, windows and wide openings in a wall: offset_in is the distance from the wall's first corner (corner k) to the near edge of the opening, along the wall.

runs: the cabinets and appliances along each wall, in order going from the wall's first corner toward its second. One run per wall per level: "base" (base cabinets, drawer bases, sink bases, dishwashers, ranges, base fillers), "upper" (wall cabinets, hoods, upper fillers), "tall" (pantries, oven cabinets, refrigerators, linen towers). start_offset_in is the gap from the wall's first corner to the first item when you can tell it (0 when the run starts in the corner), otherwise null. List pieces in order. gap_before_in is the empty space drawn before a piece (common for uppers: a gap over a sink or window); use 0 when pieces touch. Add a "filler" item only when one is labeled.
- Corner cabinets (lazy Susan, blind corner, diagonal corner base or wall cabinet) sit where two walls meet. List each one once, as the first or last piece of one wall's run, and leave room for it on the other wall: that wall's run must stop short of (or start after) the corner by the corner cabinet's size along that wall (36 for a 36" lazy Susan, 24 for a 24" diagonal wall cabinet). Set start_offset_in to make that true, or null when you can't tell. A diagonal corner wall cabinet (DWC, often drawn across the corner above a lazy Susan) is type diagWall on the upper run.
- Sizes written as width × height (24x36 next to an upper is 24" wide, 36" tall; 12x36 is 12" wide, 36" tall) give the height too.
- Read codes the usual way: B24 is a 24" base, DB30 a 30" drawer base (the (3) means 3 drawers), SB36 a 36" sink base, BMW24 a 24" base for a microwave drawer (type mwDrawerBase), W3042 a 30" wide 42" tall wall cabinet, W1542 15" × 42", DWP / BEP an end panel (basePanel, width 0.75), REP / FEP a refrigerator end panel, a range drawn with 4 burners and a hood above it is a range plus a hood, DW a dishwasher (24" unless marked).
- Put extras written next to a cabinet in note ("w/ RT x2" → "2 roll-out trays", "w/ TC" → "tray dividers").
- Something you can see but can't place on a wall (a run that bends into the room, a peninsula), describe in notes rather than guessing.
- Other drawings on the same page that are not placed in the room (an elevation of another wall, an island or pantry wall drawn off to the side with no position) must NOT become walls or runs. List each in notes with its overall size and pieces in order, for example: "Separate drawing, 63 1/2" wide: filler, 30" × 90" tall pantry 24" deep, 30" × 24" wall cabinet 18" deep, 24" × 96" end panel." Add one as an island only when its position in the room is drawn.

islands: free-standing islands: x, y is the island's center, width_in along its long side, depth_in across, rotation_deg 0 when its long side runs left to right.

notes: short plain sentences about anything you could not read, guessed, or left out. If the picture is not a room, set picture_kind "not_a_room" with empty lists and say why in notes.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Reading pictures is not set up yet.' });
  if ((event.body || '').length > MAX_BODY) return json(413, { error: 'That picture is too large. Please use one under 4 MB.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Please sign in to use this.' });
  const { data: authData, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !authData?.user) return json(401, { error: 'Please sign in again.' });
  const userId = authData.user.id;

  let body;
  try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid request.' }); }
  const requestId = String(body.requestId || '').slice(0, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return json(400, { error: 'Invalid request.' });
  const mediaType = body.mediaType;
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mediaType) || typeof body.data !== 'string' || !body.data) {
    return json(400, { error: 'Please use a photo (JPEG, PNG or WebP) or a PDF.' });
  }

  // Daily limit by plan (the account owner's plan for team members is checked the same way as the importer: their own row)
  const { data: profile } = await db.from('company_profiles').select('subscription_tier').eq('user_id', userId).maybeSingle();
  const tier = ['silver', 'gold'].includes(profile?.subscription_tier) ? profile.subscription_tier : 'free';
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent, error: logErr } = await db.from('price_import_log').select('id').eq('user_id', userId).eq('step', 'room-photo').gte('created_at', since);
  if (logErr) return json(500, { error: 'Something went wrong on our side. Please try again later.' });
  if ((recent || []).length >= PER_DAY[tier]) {
    return json(429, { error: `You've used your ${PER_DAY[tier]} pictures for today. You can draw the room instead, or try again tomorrow.` });
  }

  const picture = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: body.data } };
  const kind = String(body.kind || '').replace(/[^a-z ]/gi, '').slice(0, 20);

  const client = new Anthropic({ timeout: 55 * 1000, maxRetries: 0 });   // Netlify ends a function at 60 s
  let result = null, usage = {}, ok = false, error = null, reason = '';   // reason: why it failed, saved in the log
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },   // low effort keeps it well under the time limit
      system: SYSTEM,
      messages: [{ role: 'user', content: [picture, { type: 'text', text: `This is ${kind ? `a ${kind}` : 'a room'}. Describe it.` }] }],
    });
    usage = response.usage || {};
    reason = response.stop_reason || '';
    if (response.stop_reason === 'refusal') error = "We couldn't read that picture. Please try another one, or draw the room instead.";
    else if (response.stop_reason === 'max_tokens') error = 'That picture has more than we can read at once. Try a picture of one room.';
    else {
      const text = (response.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      result = JSON.parse(text);
      ok = true;
    }
  } catch (e) {
    reason = `${e.constructor?.name || 'Error'} ${e.status || ''} ${String(e.message || '').slice(0, 160)}`.trim();
    console.error('room-from-photo', reason);
    if (e instanceof SyntaxError) error = "We couldn't read that picture. Please try another one.";
    else if (e instanceof Anthropic.RateLimitError) error = 'We are busy right now. Please try again in a minute.';
    else if (e instanceof Anthropic.BadRequestError) error = "We couldn't open that file. Please use a clear photo or a PDF.";
    else if (e instanceof Anthropic.APIConnectionError) error = 'That took too long. Please try again, or use a smaller picture.';   // (timeouts too)
    else error = 'Something went wrong reading the picture. Please try again.';
  }

  await db.from('price_import_log').insert({
    user_id: userId, import_id: requestId, step: 'room-photo', model: ok ? MODEL : `${MODEL} | ${reason}`.slice(0, 250),   // no error column, so a failure's reason rides along here
    items: result ? (result.runs || []).reduce((n, r) => n + (r.items || []).length, 0) : 0,
    input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, ok,
  });

  if (!ok) return json(502, { error });
  return json(200, { room: result, left: PER_DAY[tier] - (recent || []).length - 1 });
};
