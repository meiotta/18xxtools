// ─── TILE PACKS ────────────────────────────────────────────────────────────────
// All tiles from packwriter.txt, classified into named packs.
// Pack names come ONLY from packwriter.txt — no invented names.
//
// Each tile entry: { dsl: <tobymao DSL string>, color: <yellow|green|brown|gray> }
// Use TILE_GEO.parseDSL(entry.dsl, entry.color) to get renderable tile defs.
//
// Pack loading order for TILE_PACKS is canonical; use TILE_PACK_ORDER for UI.
// ──────────────────────────────────────────────────────────────────────────────

// Canonical display order for pack UI
const TILE_PACK_ORDER = [
  'Basic Tile Pack',
  'Junctions & Nontraditional Cities',
  'Limited Exit & Token Cities',
  'X Series',
  'These are dumb and you are dumb but they don\'t break anything, I think',
  'Unclassified (Review Needed)',
  'Unsupported',
];

const TILE_PACKS = {

  // ────────────────────────────────────────────────────────────────────────────
  // BASIC TILE PACK
  // Standard tiles present in most 18xx games. Crossings, junctions, OO cities,
  // K/X/CF cities, standard towns. These are the bread-and-butter tile set.
  // ────────────────────────────────────────────────────────────────────────────
  'Basic Tile Pack': {

    yellow: {
      '1':   { dsl: 'town=revenue:10;town=revenue:10;path=a:1,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:4', color: 'yellow' },
      '2':   { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:2', color: 'yellow' },
      '3':   { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:_0,b:1', color: 'yellow' },
      '4':   { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:_0,b:3', color: 'yellow' },
      '5':   { dsl: 'city=revenue:20;path=a:0,b:_0;path=a:1,b:_0', color: 'yellow' },
      '6':   { dsl: 'city=revenue:20;path=a:0,b:_0;path=a:2,b:_0', color: 'yellow' },
      '7':   { dsl: 'path=a:0,b:1', color: 'yellow' },
      '8':   { dsl: 'path=a:0,b:2', color: 'yellow' },
      '9':   { dsl: 'path=a:0,b:3', color: 'yellow' },
      '55':  { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:4', color: 'yellow' },
      '56':  { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:2;path=a:1,b:_1;path=a:_1,b:3', color: 'yellow' },
      '57':  { dsl: 'city=revenue:20;path=a:0,b:_0;path=a:_0,b:3', color: 'yellow' },
      '58':  { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:_0,b:2', color: 'yellow' },
      '69':  { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:4', color: 'yellow' },
      '235': { dsl: 'city=revenue:30;city=revenue:30;path=a:0,b:_0;label=OO', color: 'yellow' },
    },

    green: {
      // 2-city tiles
      '10':  { dsl: 'city=revenue:30;city=revenue:30;path=a:0,b:_0;path=a:3,b:_1', color: 'green' },
      '12':  { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'green' },
      '13':  { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0', color: 'green' },
      // OO 2-slot 4-exit (confirmed Basic by user)
      '14':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      '15':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'green' },
      // X tile = tile #16 and crossings 16-31 (two crossing paths, no city)
      '16':  { dsl: 'path=a:0,b:2;path=a:1,b:3', color: 'green' },
      '17':  { dsl: 'path=a:1,b:3;path=a:0,b:4', color: 'green' },
      '18':  { dsl: 'path=a:0,b:3;path=a:1,b:2', color: 'green' },
      '19':  { dsl: 'path=a:0,b:3;path=a:2,b:4', color: 'green' },
      '20':  { dsl: 'path=a:0,b:3;path=a:1,b:4', color: 'green' },
      '21':  { dsl: 'path=a:0,b:2;path=a:3,b:4', color: 'green' },
      '22':  { dsl: 'path=a:0,b:4;path=a:2,b:3', color: 'green' },
      '23':  { dsl: 'path=a:0,b:3;path=a:0,b:4', color: 'green' },
      '24':  { dsl: 'path=a:0,b:3;path=a:0,b:2', color: 'green' },
      '25':  { dsl: 'path=a:0,b:2;path=a:0,b:4', color: 'green' },
      '26':  { dsl: 'path=a:0,b:3;path=a:0,b:5', color: 'green' },
      '27':  { dsl: 'path=a:0,b:3;path=a:0,b:1', color: 'green' },
      '28':  { dsl: 'path=a:0,b:4;path=a:0,b:5', color: 'green' },
      '29':  { dsl: 'path=a:0,b:2;path=a:0,b:1', color: 'green' },
      '30':  { dsl: 'path=a:0,b:4;path=a:0,b:1', color: 'green' },
      '31':  { dsl: 'path=a:0,b:2;path=a:0,b:5', color: 'green' },
      // OO 2-exit
      '52':  { dsl: 'city=revenue:40,loc:5;city=revenue:40,loc:3;path=a:0,b:_0;path=a:2,b:_1;label=OO', color: 'green' },
      '59':  { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:2,b:_1;label=OO', color: 'green' },
      // Junctions (80-83)
      '80':  { dsl: 'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'green' },
      '81':  { dsl: 'junction;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0', color: 'green' },
      '82':  { dsl: 'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0', color: 'green' },
      '83':  { dsl: 'junction;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0', color: 'green' },
      // Basic towns (4-exit)
      '87':  { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'green' },
      '88':  { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      // 3-exit towns (141-144)
      '141': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:3,b:_0;path=a:1,b:_0', color: 'green' },
      '142': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0', color: 'green' },
      '143': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'green' },
      '144': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0', color: 'green' },
      // More towns
      '203': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0', color: 'green' },
      '204': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      '474': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'green' },
      // 1-city 3-exit
      '205': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0', color: 'green' },
      '206': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0', color: 'green' },
      // Y-label cities (standard)
      '207': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y', color: 'green' },
      '208': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y', color: 'green' },
      '576': { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:3,b:_0;path=a:1,b:_0;label=Y', color: 'green' },
      '577': { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=Y', color: 'green' },
      '578': { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=Y', color: 'green' },
      '579': { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=Y', color: 'green' },
      '53Y': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=Y', color: 'green' },
      '792': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=Y', color: 'green' },
      '793': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;label=Y', color: 'green' },
      // K-label cities (K tile = 236-238)
      '236': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=K', color: 'green' },
      '237': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;label=K', color: 'green' },
      '238': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=K', color: 'green' },
      // T-label (standard upgrade)
      '405': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:5,b:_0;label=T', color: 'green' },
      '440': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=T', color: 'green' },
      // 2-slot 3-exit cities (CF-adjacent)
      '441': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0', color: 'green' },
      '441a': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0', color: 'green' },
      '442': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0', color: 'green' },
      '443': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0', color: 'green' },
      '444': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'green' },
      // CF / Chickenfoot (OO city 4-exit)
      '619': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      '622': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y', color: 'green' },
      // OO green variants
      '8858': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:2;path=a:1,b:_1;path=a:_1,b:3;label=OO', color: 'green' },
      '8859': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:5;label=OO', color: 'green' },
      '8860': { dsl: 'city=revenue:40;city=revenue:40;path=a:1,b:_0;path=a:_0,b:5;path=a:2,b:_1;path=a:_1,b:4;label=OO', color: 'green' },
      '8862': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_1;path=a:4,b:_1;label=OO', color: 'green' },
      '8863': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:5;label=OO', color: 'green' },
      '8864': { dsl: 'city=revenue:40;city=revenue:40;path=a:1,b:_0;path=a:_0,b:5;path=a:2,b:_1;path=a:_1,b:3;label=OO', color: 'green' },
      '8865': { dsl: 'city=revenue:40;city=revenue:40;path=a:1,b:_0;path=a:_0,b:5;path=a:3,b:_1;path=a:_1,b:4;label=OO', color: 'green' },
      // Dual-town path variants
      '981': { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:2', color: 'green' },
      '991': { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:4', color: 'green' },
      // Path combos
      '624': { dsl: 'path=a:0,b:1;path=a:1,b:2', color: 'green' },
      '625': { dsl: 'path=a:0,b:1;path=a:2,b:3', color: 'green' },
      '626': { dsl: 'path=a:0,b:1;path=a:3,b:4', color: 'green' },
      // Miscellaneous standard green cities
      '901': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_0;path=a:_0,b:3', color: 'green' },
    },

    brown: {
      // 2-city tiles (OO-style without label)
      '35':  { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:2;path=a:1,b:_1;path=a:_1,b:3', color: 'brown' },
      '36':  { dsl: 'city=revenue:40;city=revenue:40;path=a:1,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:4', color: 'brown' },
      '37':  { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:3;path=a:3,b:_1;path=a:0,b:_0', color: 'brown' },
      // Big city (2-slot)
      '38':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      // Standard crossings (39-47, 70)
      '39':  { dsl: 'path=a:0,b:2;path=a:0,b:1;path=a:1,b:2', color: 'brown' },
      '40':  { dsl: 'path=a:0,b:2;path=a:2,b:4;path=a:0,b:4', color: 'brown' },
      '41':  { dsl: 'path=a:0,b:3;path=a:0,b:1;path=a:1,b:3', color: 'brown' },
      '42':  { dsl: 'path=a:0,b:3;path=a:3,b:5;path=a:0,b:5', color: 'brown' },
      '43':  { dsl: 'path=a:0,b:3;path=a:0,b:2;path=a:1,b:3;path=a:1,b:2', color: 'brown' },
      '44':  { dsl: 'path=a:0,b:3;path=a:1,b:4;path=a:0,b:1;path=a:3,b:4', color: 'brown' },
      '45':  { dsl: 'path=a:0,b:3;path=a:2,b:4;path=a:0,b:4;path=a:2,b:3', color: 'brown' },
      '46':  { dsl: 'path=a:0,b:3;path=a:2,b:4;path=a:3,b:4;path=a:0,b:2', color: 'brown' },
      '47':  { dsl: 'path=a:0,b:3;path=a:1,b:4;path=a:1,b:3;path=a:0,b:4', color: 'brown' },
      '70':  { dsl: 'path=a:0,b:1;path=a:0,b:2;path=a:1,b:3;path=a:2,b:3', color: 'brown' },
      // More crossings
      '627': { dsl: 'path=a:0,b:3;path=a:0,b:1;path=a:1,b:2;path=a:2,b:3', color: 'brown' },
      '628': { dsl: 'path=a:1,b:3;path=a:3,b:4;path=a:0,b:4;path=a:0,b:1', color: 'brown' },
      '629': { dsl: 'path=a:0,b:2;path=a:2,b:3;path=a:3,b:4;path=a:0,b:4', color: 'brown' },
      '798': { dsl: 'path=a:0,b:3;path=a:1,b:4;path=a:2,b:5', color: 'brown' },
      // Big 6-exit city
      '63':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'brown' },
      // 2-city OO (with label)
      '64':  { dsl: 'city=revenue:50;city=revenue:50,loc:3.5;path=a:0,b:_0;path=a:_0,b:2;path=a:3,b:_1;path=a:_1,b:4;label=OO', color: 'brown' },
      '65':  { dsl: 'city=revenue:50;city=revenue:50,loc:2.5;path=a:0,b:_0;path=a:_0,b:4;path=a:2,b:_1;path=a:_1,b:3;label=OO', color: 'brown' },
      '66':  { dsl: 'city=revenue:50;city=revenue:50,loc:1.5;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:2;label=OO', color: 'brown' },
      '67':  { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:4;label=OO', color: 'brown' },
      '68':  { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:4;label=OO', color: 'brown' },
      '118': { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3', color: 'brown' },
      '1064': { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:2;path=a:3,b:_1;path=a:_1,b:4', color: 'brown' },
      '1065': { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:4;path=a:2,b:_1;path=a:_1,b:3', color: 'brown' },
      '1066': { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:2', color: 'brown' },
      '1067': { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:4', color: 'brown' },
      '1068': { dsl: 'city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:4', color: 'brown' },
      // OO-label 2-slot variants
      '8872': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=OO', color: 'brown' },
      '8874': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:5,b:_0;label=OO', color: 'brown' },
      // Junctions (544-546)
      '544': { dsl: 'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '545': { dsl: 'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'brown' },
      '546': { dsl: 'junction;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      // Towns (145-148, 767-769, 911)
      '145': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '146': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'brown' },
      '147': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '148': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '767': { dsl: 'town=revenue:10;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'brown' },
      '768': { dsl: 'town=revenue:10;path=a:1,b:_0;path=a:2,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'brown' },
      '769': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '911': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      // X-label cities (X label ≠ XX label)
      '217': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:4,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=X', color: 'brown' },
      '218': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=X', color: 'brown' },
      '219': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:5,b:_0;label=X', color: 'brown' },
      // 2-slot 4-exit no label
      '448': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'brown' },
      '449': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '450': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      // Standard 2-slot 5-exit
      '125': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '611': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      // Y-label standard cities
      '168': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=Y', color: 'brown' },
      '169': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;label=Y', color: 'brown' },
      '216': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y', color: 'brown' },
      '582': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y', color: 'brown' },
      '623': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=Y', color: 'brown' },
      '796': { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_0;path=a:_0,b:4;label=Y', color: 'brown' },
      '801': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y', color: 'brown' },
      '61Y': { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y', color: 'brown' },
      '891Y': { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y', color: 'brown' },
      // K-label brown (upgrade of 236-238)
      '239': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=K', color: 'brown' },
      '465': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=K', color: 'brown' },
      // Misc small city
      '804': { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'brown' },
    },

    gray: {
      // Standard crossings
      '452': { dsl: 'path=a:0,b:3;path=a:2,b:4;path=a:0,b:4;path=a:0,b:2;path=a:2,b:3;path=a:3,b:4', color: 'gray' },
      '453': { dsl: 'path=a:0,b:3;path=a:1,b:4;path=a:1,b:3;path=a:0,b:4;path=a:0,b:1;path=a:3,b:4', color: 'gray' },
      '454': { dsl: 'path=a:0,b:3;path=a:1,b:3;path=a:0,b:2;path=a:0,b:1;path=a:1,b:2;path=a:2,b:3', color: 'gray' },
      '114': { dsl: 'path=a:0,b:2;path=a:2,b:4;path=a:0,b:4;path=a:1,b:3;path=a:3,b:5;path=a:1,b:5', color: 'gray' },
      // Junction
      '60':  { dsl: 'junction;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      // All-exits city (no label or Y label)
      '51':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'gray' },
      '171': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      '172': { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      '455': { dsl: 'city=revenue:50,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      '512': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=Y', color: 'gray' },
      '513': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      '895': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
      '915': { dsl: 'city=revenue:50,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'gray' },
      '1168': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'gray' },
      // 2-city 5/6 exits
      '167': { dsl: 'city=revenue:70,loc:0.5;city=revenue:70,loc:2.5;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;path=a:4,b:_0;path=a:5,b:_1;label=OO', color: 'gray' },
      '1167': { dsl: 'city=revenue:70,loc:0;city=revenue:70,loc:3;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;path=a:4,b:_0;path=a:5,b:_1', color: 'gray' },
      '123a': { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=OO', color: 'gray' },
      // K-label gray
      '240': { dsl: 'city=revenue:80,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=K', color: 'gray' },
      // Gray towns
      '806': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0', color: 'gray' },
      '807': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0', color: 'gray' },
      '808': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0', color: 'gray' },
      '912': { dsl: 'town=revenue:10;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'gray' },
    },

    white: {
      'white-blank':     { dsl: '', color: 'white' },
      'white-town':      { dsl: 'town=revenue:0', color: 'white' },
      'white-dual-town': { dsl: 'town=revenue:0;town=revenue:0', color: 'white' },
      'white-city':      { dsl: 'city=revenue:0', color: 'white' },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // JUNCTIONS & NONTRADITIONAL CITIES
  // User-defined special yellows, plus complex multi-path routing tiles
  // ────────────────────────────────────────────────────────────────────────────
  'Junctions & Nontraditional Cities': {
    yellow: {
      '201': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;label=Y', color: 'yellow' },
      '202': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:2,b:_0;label=Y', color: 'yellow' },
      '401': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;label=T', color: 'yellow' },
      '447': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:4,b:_0;label=T', color: 'yellow' },
      '621': { dsl: 'city=revenue:30;path=a:0,b:_0;path=a:_0,b:3;label=Y', color: 'yellow' },
      '630': { dsl: 'town=revenue:10;town=revenue:10;path=a:2,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:4', color: 'yellow' },
      '631': { dsl: 'town=revenue:10;town=revenue:10;path=a:3,b:_0;path=a:_0,b:4;path=a:0,b:_1;path=a:_1,b:2', color: 'yellow' },
      '632': { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3', color: 'yellow' },
      '633': { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0;path=a:_0,b:1;path=a:3,b:_1;path=a:_1,b:4', color: 'yellow' },
    },
    green: {
      // Complex 2-city routing (nontraditional shared-path junctions)
      '457': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:1;path=a:1,b:_1;path=a:_1,b:3;path=a:_0,b:2;path=a:2,b:_1', color: 'green' },
      '458': { dsl: 'city=revenue:20;city=revenue:20;path=a:1,b:_0;path=a:_0,b:4;path=a:0,b:_1;path=a:_1,b:3;path=a:0,b:_0;path=a:_1,b:4', color: 'green' },
      '459': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:4;path=a:_0,b:1;path=a:3,b:_1', color: 'green' },
      '460': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:4;path=a:0,b:_0;path=a:_0,b:4;path=a:1,b:_1;path=a:_1,b:3', color: 'green' },
      '461': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:0,b:_1;path=a:_1,b:2;path=a:1,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:2', color: 'green' },
      '462': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_1;path=a:_1,b:3;path=a:0,b:_0;path=a:_0,b:2;path=a:1,b:_1;path=a:_1,b:2', color: 'green' },
      '463': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:4;path=a:_0,b:4;path=a:_1,b:3', color: 'green' },
      '464': { dsl: 'city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:2,b:_1;path=a:3,b:_1;path=a:4,b:_1', color: 'green' },
    },
    brown: {},
    gray: {},
  },

  // ────────────────────────────────────────────────────────────────────────────
  // LIMITED EXIT & TOKEN CITIES
  // Dead-end/placeholder cities with revenue:0 (used for home token placement)
  // ────────────────────────────────────────────────────────────────────────────
  'Limited Exit & Token Cities': {
    yellow: {},
    green: {
      '613': { dsl: 'city=revenue:0;path=a:0,b:_0;path=a:3,b:_0', color: 'green' },
      '614': { dsl: 'city=revenue:0;path=a:0,b:_0;path=a:2,b:_0', color: 'green' },
      '615': { dsl: 'city=revenue:0;path=a:0,b:_0;path=a:1,b:_0', color: 'green' },
    },
    brown: {
      '610': { dsl: 'city=revenue:0;path=a:0,b:_0;path=a:3,b:_0', color: 'brown' },
      '616': { dsl: 'city=revenue:0,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
      '617': { dsl: 'city=revenue:0,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0', color: 'brown' },
      '618': { dsl: 'city=revenue:0,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'brown' },
    },
    gray: {},
  },

  // ────────────────────────────────────────────────────────────────────────────
  // THESE ARE DUMB AND YOU ARE DUMB BUT THEY DON'T BREAK ANYTHING, I THINK
  // XX-label tiles, towns with revenue > 10, icon= tiles, exotic city+town combos
  // NOTE: XX (label=XX) ≠ X (label=X). XX tiles go here; X tiles go in Basic.
  // ────────────────────────────────────────────────────────────────────────────
  'These are dumb and you are dumb but they don\'t break anything, I think': {
    yellow: {
      // Pre-filled by user
      '115':  { dsl: 'city=revenue:20;path=a:0,b:_0', color: 'yellow' },
      '128':  { dsl: 'city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:2,b:_1;label=C', color: 'yellow' },
      '437':  { dsl: 'town=revenue:30;path=a:0,b:_0;path=a:_0,b:2;icon=image:port,blocks_lay:1', color: 'yellow' },
      '438':  { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:2,b:_0;label=H;upgrade=cost:80', color: 'yellow' },
      '445':  { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:_0,b:2;icon=image:18_al/tree,blocks_lay:1', color: 'yellow' },
      '451a': { dsl: 'city=revenue:30;city=revenue:30;city=revenue:30;path=a:0,b:_0;path=a:2,b:_1;path=a:4,b:_2;label=ATL', color: 'yellow' },
      '471':  { dsl: 'city=revenue:20,loc:center;town=revenue:10,loc:4.5;path=a:0,b:_0;path=a:_0,b:3;path=a:_1,b:_0;label=M', color: 'yellow' },
      '472':  { dsl: 'city=revenue:20,loc:center;town=revenue:10,loc:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:_1,b:_0;label=T', color: 'yellow' },
      '473':  { dsl: 'city=revenue:20,loc:center;town=revenue:10,loc:4;path=a:0,b:_0;path=a:_0,b:2;path=a:_1,b:_0;label=V', color: 'yellow' },
      '790':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_0;path=a:_0,b:4;label=N', color: 'yellow' },
      '441a_y': { dsl: 'city=revenue:10;path=a:0,b:_0;label=B', color: 'yellow' }, // 441a yellow variant
      // Towns rev > 10
      '8850': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:5,b:_0', color: 'yellow' },
      '8851': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:4,b:_0', color: 'yellow' },
      '8852': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:3,b:_0', color: 'yellow' },
      '8854': { dsl: 'town=revenue:20;town=revenue:20;path=a:0,b:_0;path=a:3,b:_0;path=a:4,b:_1;path=a:5,b:_1', color: 'yellow' },
      '8855': { dsl: 'town=revenue:20;town=revenue:20;path=a:0,b:_0;path=a:3,b:_0;path=a:2,b:_1;path=a:5,b:_1', color: 'yellow' },
      '8856': { dsl: 'town=revenue:20;town=revenue:20;path=a:0,b:_0;path=a:4,b:_0;path=a:3,b:_1;path=a:5,b:_1', color: 'yellow' },
      '8857': { dsl: 'town=revenue:20;town=revenue:20;path=a:1,b:_0;path=a:4,b:_0;path=a:3,b:_1;path=a:5,b:_1', color: 'yellow' },
    },
    green: {
      // XX-label tiles (XX ≠ X — completely different tiles!)
      '210': { dsl: 'city=revenue:30;city=revenue:30;path=a:0,b:_0;path=a:3,b:_0;path=a:5,b:_1;path=a:4,b:_1;label=XX', color: 'green' },
      '211': { dsl: 'city=revenue:30;city=revenue:30;path=a:2,b:_0;path=a:3,b:_0;path=a:0,b:_1;path=a:1,b:_1;label=XX', color: 'green' },
      '212': { dsl: 'city=revenue:30;city=revenue:30;path=a:2,b:_0;path=a:3,b:_0;path=a:0,b:_1;path=a:5,b:_1;label=XX', color: 'green' },
      '213': { dsl: 'city=revenue:30;city=revenue:30;path=a:2,b:_0;path=a:3,b:_0;path=a:0,b:_1;path=a:4,b:_1;label=XX', color: 'green' },
      '214': { dsl: 'city=revenue:30;city=revenue:30;path=a:4,b:_0;path=a:3,b:_0;path=a:0,b:_1;path=a:2,b:_1;label=XX', color: 'green' },
      '215': { dsl: 'city=revenue:30;city=revenue:30;path=a:1,b:_0;path=a:3,b:_0;path=a:0,b:_1;path=a:4,b:_1;label=XX', color: 'green' },
      // Towns rev > 10
      '887': { dsl: 'town=revenue:20;path=a:1,b:_0;path=a:3,b:_0;path=a:0,b:_0;path=a:2,b:_0', color: 'green' },
      '888': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      '800': { dsl: 'town=revenue:30;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=D&SL', color: 'green' },
      '8866': { dsl: 'town=revenue:20;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:5,b:_0', color: 'green' },
      // Mixed city+town with unusual loc= (exotic)
      '476': { dsl: 'city=revenue:30,loc:center;town=revenue:10,loc:0;path=a:_0,b:2;path=a:4,b:_0;path=a:5,b:_0;path=a:_1,b:_0;label=M', color: 'green' },
      '477': { dsl: 'city=revenue:30,loc:center;town=revenue:10,loc:3.5;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:5,b:_0;path=a:_1,b:_0;label=T', color: 'green' },
      '478': { dsl: 'city=revenue:30,slots:2,loc:center;town=revenue:20,loc:0;path=a:2,b:_0;path=a:_0,b:4;path=a:_1,b:_0;label=V', color: 'green' },
      '602': { dsl: 'city=revenue:30;town=revenue:30;path=a:0,b:_0;path=a:2,b:_1;path=a:3,b:_0;path=a:4,b:_1;label=V', color: 'green' },
    },
    brown: {
      // Mixed city+town with unusual loc=
      '481': { dsl: 'city=revenue:40,slots:2,loc:center;path=a:0,b:_0;path=a:1,b:_0;path=a:5,b:_0;label=L', color: 'brown' },
      '482': { dsl: 'city=revenue:40,slots:2,loc:center;town=revenue:20,loc:0;path=a:2,b:_0;path=a:_0,b:3;path=a:4,b:_0;path=a:5,b:_0;path=a:_1,b:_0;label=M', color: 'brown' },
      '483': { dsl: 'city=revenue:40,loc:center;town=revenue:20,loc:3.5;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:5,b:_0;path=a:_1,b:_0;label=T', color: 'brown' },
      '484': { dsl: 'city=revenue:40,slots:2,loc:center;town=revenue:30,loc:0;path=a:2,b:_0;path=a:3,b:_0;path=a:_0,b:4;path=a:_1,b:_0;label=V', color: 'brown' },
      '603': { dsl: 'city=revenue:30;town=revenue:30;path=a:0,b:_0;path=a:1,b:_1;path=a:2,b:_0;path=a:3,b:_1;path=a:4,b:_0;path=a:5,b:_1;label=V', color: 'brown' },
      // Towns rev > 10
      '8871': { dsl: 'town=revenue:20;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'brown' },
    },
    gray: {},
  },

  // ────────────────────────────────────────────────────────────────────────────
  // UNCLASSIFIED (REVIEW NEEDED)
  // Game-specific named cities, unusual tile combos that don't fit above packs.
  // These are renderable but gated off by default until user reviews them.
  // ────────────────────────────────────────────────────────────────────────────
  'Unclassified (Review Needed)': {
    yellow: {},
    green: {
      '11':   { dsl: 'town=revenue:10;path=a:0,b:2;path=a:2,b:_0;path=a:_0,b:4;path=a:0,b:4;label=HALT', color: 'green' },
      '53':   { dsl: 'city=revenue:50;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=B', color: 'green' },
      '54':   { dsl: 'city=revenue:60,loc:0.5;city=revenue:60,loc:2.5;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=NY', color: 'green' },
      '120':  { dsl: 'city=revenue:60;city=revenue:60;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=T', color: 'green' },
      '121':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=B-L', color: 'green' },
      '129':  { dsl: 'city=revenue:60,slots:2;city=revenue:60;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=C', color: 'green' },
      '190':  { dsl: 'city=revenue:40;city=revenue:40;city=revenue:40;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_0;path=a:_0,b:4;path=a:2,b:_0;path=a:_0,b:5;label=ATL', color: 'green' },
      '209':  { dsl: 'city=revenue:40,slots:3;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'green' },
      '298LA': { dsl: 'city=revenue:40;city=revenue:40;city=revenue:40;city=revenue:40;label=LB;path=a:1,b:_0;path=a:2,b:_1;path=a:3,b:_2;path=a:4,b:_3;path=a:0,b:_0;path=a:0,b:_1;path=a:0,b:_2;path=a:0,b:_3', color: 'green' },
      '439':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=H;upgrade=cost:80', color: 'green' },
      '442a': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'green' },
      '443a': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=M', color: 'green' },
      '452a': { dsl: 'city=revenue:20;city=revenue:20;city=revenue:20;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:5;path=a:4,b:_2;path=a:_2,b:1;label=ATL', color: 'green' },
      '453a': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:5,b:_0;label=Aug', color: 'green' },
      '454a': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:5,b:_0;label=S', color: 'green' },
      '475':  { dsl: 'city=revenue:30,loc:center;path=a:0,b:_0;path=a:1,b:_0;path=a:5,b:_0;label=L', color: 'green' },
      '514':  { dsl: 'city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=P', color: 'green' },
      '580':  { dsl: 'city=revenue:60,loc:0.5;city=revenue:60,loc:2.5;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=P', color: 'green' },
      '581':  { dsl: 'city=revenue:50;city=revenue:50;city=revenue:50;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;path=a:4,b:_2;path=a:_2,b:5;label=B-V', color: 'green' },
      '590':  { dsl: 'city=revenue:60;city=revenue:60;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;path=a:3,b:_0;path=a:_0,b:4;label=Chi', color: 'green' },
      '592':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:4,b:_0;label=B', color: 'green' },
      '604':  { dsl: 'city=revenue:100,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=M', color: 'green' },
      '606':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=T', color: 'green' },
      '612':  { dsl: 'city=revenue:40;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=G', color: 'green' },
      '637':  { dsl: 'city=revenue:50,loc:0.5;city=revenue:50,loc:2.5;city=revenue:50,loc:4.5;path=a:0,b:_0;path=a:_0,b:1;path=a:4,b:_2;path=a:_2,b:5;path=a:2,b:_1;path=a:_1,b:3;label=M', color: 'green' },
      '791':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=N', color: 'green' },
      '802':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=D', color: 'green' },
      '904':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'green' },
      '907':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:5,b:_0;path=a:3,b:_0;label=Z', color: 'green' },
      '908':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:3,b:_0;label=Z', color: 'green' },
    },
    brown: {
      '32':   { dsl: 'city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;path=a:0,b:_0;path=a:1,b:_1;path=a:2,b:_2;path=a:3,b:_3;path=a:4,b:_4;path=a:5,b:_5;label=L', color: 'brown' },
      '33':   { dsl: 'city=revenue:50,loc:0;city=revenue:50,loc:2;city=revenue:50,loc:4;path=a:5,b:_0;path=a:3,b:_1;path=a:4,b:_2;label=L', color: 'brown' },
      '34':   { dsl: 'city=revenue:50,loc:1.5;city=revenue:50,loc:4.5;city=revenue:50,loc:3;path=a:0,b:_2;path=a:_2,b:3;path=a:2,b:_0;path=a:4,b:_1;label=BGM', color: 'brown' },
      '61':   { dsl: 'city=revenue:60;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'brown' },
      '62':   { dsl: 'city=revenue:80,slots:2;city=revenue:80,slots:2;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=NY', color: 'brown' },
      '122':  { dsl: 'city=revenue:80,slots:2;city=revenue:80,slots:2;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=T', color: 'brown' },
      '126':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=Lon', color: 'brown' },
      '127':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Bar', color: 'brown' },
      '130':  { dsl: 'city=revenue:100,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=C', color: 'brown' },
      '132':  { dsl: 'city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=C', color: 'brown' },
      '133':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=M', color: 'brown' },
      '135':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=KC;label=SL;label=MSP', color: 'brown' },
      '170':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=P', color: 'brown' },
      '191':  { dsl: 'city=revenue:60,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=A', color: 'brown' },
      '193':  { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=S', color: 'brown' },
      '220':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'brown' },
      '221':  { dsl: 'city=revenue:60,slots:2,loc:3;city=revenue:60,loc:0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:1,b:_1;path=a:0,b:_1;path=a:5,b:_1;path=a:_0,b:_1;label=H', color: 'brown' },
      '455a': { dsl: 'city=revenue:70;city=revenue:70;city=revenue:70;path=a:0,b:_0;path=a:_0,b:3;path=a:2,b:_1;path=a:_1,b:5;path=a:4,b:_2;path=a:_2,b:1;label=ATL', color: 'brown' },
      '456a': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:5,b:_0;label=Aug', color: 'brown' },
      '457a': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'brown' },
      '458a': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=M', color: 'brown' },
      '459a': { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:5,b:_0;label=S', color: 'brown' },
      '466':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=T', color: 'brown' },
      '480':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=G', color: 'brown' },
      '492':  { dsl: 'city=revenue:80,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=H', color: 'brown' },
      '497':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=T', color: 'brown' },
      '515':  { dsl: 'city=revenue:90;city=revenue:90;city=revenue:90;city=revenue:90;city=revenue:90;city=revenue:90;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=P', color: 'brown' },
      '583':  { dsl: 'city=revenue:80,slots:2;city=revenue:80,slots:2;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_1;path=a:_1,b:3;label=P', color: 'brown' },
      '584':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B-V', color: 'brown' },
      '591':  { dsl: 'city=revenue:80,slots:2;city=revenue:80,slots:2;path=a:0,b:_0;path=a:_0,b:1;path=a:2,b:_0;path=a:_0,b:3;path=a:3,b:_0;path=a:_0,b:4;label=Chi', color: 'brown' },
      '593':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'brown' },
      '605':  { dsl: 'city=revenue:150,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=M', color: 'brown' },
      '607':  { dsl: 'city=revenue:90,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=T', color: 'brown' },
      '609':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=G', color: 'brown' },
      '794':  { dsl: 'city=revenue:80,slots:4;path=a:0,b:_0;path=a:_0,b:3;path=a:1,b:_0;path=a:_0,b:4;path=a:2,b:_0;path=a:_0,b:5;label=N', color: 'brown' },
      '803':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=D', color: 'brown' },
      '902':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=L', color: 'brown' },
      '905':  { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'brown' },
      '909':  { dsl: 'city=revenue:50,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Z', color: 'brown' },
      '444b': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'brown' },
      '444m': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=M', color: 'brown' },
    },
    gray: {
      '48':   { dsl: 'city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;label=L', color: 'gray' },
      '49':   { dsl: 'city=revenue:70,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=L', color: 'gray' },
      '50':   { dsl: 'city=revenue:70,loc:1.5;city=revenue:70,loc:3;city=revenue:70,loc:4.5;path=a:0,b:_1;path=a:_1,b:3;path=a:1,b:_0;path=a:_0,b:2;path=a:4,b:_2;path=a:_2,b:5;label=BGM', color: 'gray' },
      '123':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=H', color: 'gray' },
      '124':  { dsl: 'city=revenue:100,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=T', color: 'gray' },
      '131':  { dsl: 'city=revenue:100,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=C', color: 'gray' },
      '134':  { dsl: 'city=revenue:100,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=M', color: 'gray' },
      '136':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=KC;label=SL;label=MSP', color: 'gray' },
      '232':  { dsl: 'city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=C', color: 'gray' },
      '446':  { dsl: 'city=revenue:70,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'gray' },
      '494':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=T', color: 'gray' },
      '516':  { dsl: 'city=revenue:120;city=revenue:120;city=revenue:120;city=revenue:120;city=revenue:120;city=revenue:120;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=P', color: 'gray' },
      '596':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=L', color: 'gray' },
      '597':  { dsl: 'city=revenue:80,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=B', color: 'gray' },
      '639':  { dsl: 'city=revenue:100,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=M', color: 'gray' },
      '805':  { dsl: 'city=revenue:60,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=D', color: 'gray' },
      '903':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=L', color: 'gray' },
      '906':  { dsl: 'city=revenue:60,slots:3;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=B', color: 'gray' },
      '910':  { dsl: 'city=revenue:60,slots:4;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Z', color: 'gray' },
      '997':  { dsl: 'city=revenue:60,slots:2;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0;path=a:5,b:_0;label=Boston', color: 'gray' },
    },
  },

  // ────────────────────────────────────────────────────────────────────────────
  // UNSUPPORTED
  // Narrow track (track:narrow) and dual track (track:dual) tiles.
  // These are stored for reference but EXCLUDED from all rendering and UI.
  // ────────────────────────────────────────────────────────────────────────────
  'Unsupported': {
    yellow: {
      '71':  { dsl: 'town=revenue:10;town=revenue:10;path=a:0,b:_0,track:narrow;path=a:_0,b:_1,track:narrow;path=a:_1,b:4,track:narrow', color: 'yellow' },
      '72':  { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:_0,b:1,track:narrow', color: 'yellow' },
      '73':  { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:_0,b:2,track:narrow', color: 'yellow' },
      '74':  { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:_0,b:3,track:narrow', color: 'yellow' },
      '75':  { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow', color: 'yellow' },
      '76':  { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:2,b:_0,track:narrow', color: 'yellow' },
      '77':  { dsl: 'path=a:0,b:1,track:narrow', color: 'yellow' },
      '78':  { dsl: 'path=a:0,b:2,track:narrow', color: 'yellow' },
      '79':  { dsl: 'path=a:0,b:3,track:narrow', color: 'yellow' },
      '113': { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow', color: 'yellow' },
      '644': { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:1,b:_0', color: 'yellow' },
      '645': { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:2,b:_0', color: 'yellow' },
      '657': { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:3,b:_0', color: 'yellow' },
      '658': { dsl: 'city=revenue:20;path=a:0,b:_0;path=a:2,b:_0,track:narrow', color: 'yellow' },
      '659': { dsl: 'city=revenue:20;path=a:0,b:_0;path=a:1,b:_0,track:narrow', color: 'yellow' },
      '679': { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:_0,b:1,track:narrow', color: 'yellow' },
      '956': { dsl: 'city=revenue:20;path=a:0,b:_0,track:narrow;path=a:3,b:_0,track:narrow', color: 'yellow' },
    },
    green: {
      '84':  { dsl: 'path=a:0,b:1,track:narrow;path=a:1,b:2,track:narrow;path=a:0,b:2,track:narrow', color: 'green' },
      '85':  { dsl: 'path=a:3,b:5,track:narrow;path=a:0,b:5,track:narrow;path=a:0,b:3,track:narrow', color: 'green' },
      '86':  { dsl: 'path=a:0,b:1,track:narrow;path=a:1,b:3,track:narrow;path=a:0,b:3,track:narrow', color: 'green' },
      '89':  { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:3,b:_0,track:narrow;path=a:4,b:_0,track:narrow', color: 'green' },
      '90':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0', color: 'green' },
      '233': { dsl: 'path=a:0,b:3,track:dual', color: 'green' },
      '234': { dsl: 'path=a:0,b:1,track:dual', color: 'green' },
      // narrow city/town tiles 91-117, 650-715, 957-974 (abbreviated for brevity — all narrow)
      '91':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0;path=a:3,b:_0,track:narrow;path=a:4,b:_0,track:narrow;path=a:5,b:_0', color: 'green' },
      '92':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow;path=a:4,b:_0;path=a:5,b:_0', color: 'green' },
      '93':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0;path=a:2,b:_0;path=a:3,b:_0,track:narrow;path=a:4,b:_0;path=a:5,b:_0', color: 'green' },
      '94':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0;path=a:1,b:_0,track:narrow;path=a:2,b:_0;path=a:3,b:_0,track:narrow', color: 'green' },
      '95':  { dsl: 'city=revenue:20,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0;path=a:2,b:_0,track:narrow;path=a:3,b:_0', color: 'green' },
      '96':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow', color: 'green' },
      '97':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0;path=a:3,b:_0', color: 'green' },
      '98':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0,track:narrow;path=a:4,b:_0', color: 'green' },
      '99':  { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0,track:narrow;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0', color: 'green' },
      '100': { dsl: 'city=revenue:30;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow', color: 'green' },
      '101': { dsl: 'city=revenue:30;path=a:0,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:4,b:_0,track:narrow', color: 'green' },
      '116': { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow', color: 'green' },
      '117': { dsl: 'town=revenue:10;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow', color: 'green' },
    },
    brown: {
      '102': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual;path=a:5,b:_0,track:dual', color: 'brown' },
      '103': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
      '104': { dsl: 'city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;city=revenue:70;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual;path=a:5,b:_0,track:dual;label=CP', color: 'brown' },
      '105': { dsl: 'city=revenue:40,slots:3;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;label=BM', color: 'brown' },
      '106': { dsl: 'junction;path=a:0,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:4,b:_0,track:dual;path=a:3,b:_0,track:dual', color: 'brown' },
      '107': { dsl: 'junction;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
      '108': { dsl: 'junction;path=a:0,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual;path=a:5,b:_0,track:dual', color: 'brown' },
      '672': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
      '673': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual', color: 'brown' },
      '674': { dsl: 'city=revenue:40,slots:2;path=a:0,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
      '676': { dsl: 'city=revenue:30,slots:2;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0;label=S', color: 'brown' },
      '696': { dsl: 'town=revenue:20;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
      '697': { dsl: 'town=revenue:20;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual', color: 'brown' },
      '698': { dsl: 'town=revenue:20;path=a:0,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'brown' },
    },
    gray: {
      '109': { dsl: 'city=revenue:50,slots:2;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'gray' },
      '110': { dsl: 'city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;city=revenue:100;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual;path=a:5,b:_0,track:dual;label=CP', color: 'gray' },
      '111': { dsl: 'city=revenue:70,slots:3;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;label=BM', color: 'gray' },
      '112': { dsl: 'junction;path=a:0,b:_0,track:dual;path=a:1,b:_0,track:dual;path=a:2,b:_0,track:dual;path=a:3,b:_0,track:dual;path=a:4,b:_0,track:dual', color: 'gray' },
      '988': { dsl: 'city=revenue:50,slots:3;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow;path=a:4,b:_0,track:narrow', color: 'gray' },
      '989': { dsl: 'city=revenue:70,slots:3;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow;path=a:4,b:_0,track:narrow;frame=color:#800080', color: 'gray' },
      '990': { dsl: 'city=revenue:100,slots:3;path=a:0,b:_0,track:narrow;path=a:1,b:_0,track:narrow;path=a:2,b:_0,track:narrow;path=a:3,b:_0,track:narrow;path=a:4,b:_0,track:narrow;path=a:5,b:_0,track:narrow;label=B;frame=color:#800080', color: 'gray' },
    },
  },

  // ── X Series ───────────────────────────────────────────────────────────────
  // Supplemental tiles used in specific 18xx games (manifest-only; never placed
  // by default but appear in the tile manifest for reference).
  'X Series': {
    yellow: {
      'X20': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'yellow', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 30 } },
    },
    green: {
      'X1':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
      'X2':  { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
      'X3':  { svgPath: 'M 0 43.5 A 83.25 83.25 0 0 0 -21.65 -12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 A 83.25 83.25 0 0 0 21.65 12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x: -21.65, y: -12.5}, {x: 21.65, y: 12.5}], revenue: { x: 33.37, y: 0, v: 40 } },
      'X4':  { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 A 33.015 33.015 0 0 1 0 25 M -37.67 -21.75 A 33.015 33.015 0 0 0 0 -25 M 0 -43.5 L 0 -25', color: 'green', oo: true, cityPositions: [{x: 0, y: 25}, {x: 0, y: -25}], revenue: { x: 33.37, y: 0, v: 40 } },
      'X5':  { svgPath: 'M 0 -43.5 L 0 -25 M 37.67 21.75 A 83.245 83.245 0 0 1 0 -25 M 0 43.5 L 0 25 M 37.67 -21.75 A 83.245 83.245 0 0 0 0 25', color: 'green', oo: true, cityPositions: [{x: 0, y: -25}, {x: 0, y: 25}], revenue: { x: 33.37, y: 0, v: 40 } },
      'X21': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 40 } },
    },
    brown: {
      'X6':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
      'X7':  { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown', oo: true, revenue: { x: 33.37, y: 0, v: 50 } },
      'X8':  { svgPath: 'M -37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
      'X9':  { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
      'X10': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
      'X22': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'brown', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 50 } },
    },
    grey: {
      'X11': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
      'X12': { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
      'X13': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
      'X14': { svgPath: 'M -37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
      'X15': { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
      'X16': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
      'X17': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
      'X18': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
      'X19': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
      'X23': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'grey', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 60 } },
    },
  },

};

// ── Helper: get all tiles across all renderable packs (excludes Unsupported) ──
function getAllRenderableTiles(enabledPacks) {
  const result = {};
  const renderablePacks = TILE_PACK_ORDER.filter(p => p !== 'Unsupported');
  for (const packName of renderablePacks) {
    if (enabledPacks && !enabledPacks[packName]) continue;
    const pack = TILE_PACKS[packName];
    if (!pack) continue;
    for (const color of ['white', 'yellow', 'green', 'brown', 'gray']) {
      if (!pack[color]) continue;
      for (const [id, entry] of Object.entries(pack[color])) {
        if (!result[id]) result[id] = entry;
      }
    }
  }
  return result;
}

// ── Helper: find which pack a tile belongs to ─────────────────────────────────
function getTilePack(tileId) {
  for (const packName of TILE_PACK_ORDER) {
    const pack = TILE_PACKS[packName];
    if (!pack) continue;
    for (const color of ['yellow', 'green', 'brown', 'gray']) {
      if (pack[color] && pack[color][String(tileId)]) return packName;
    }
  }
  return null;
}

// ── Default enabled packs (Unsupported always excluded) ───────────────────────
const DEFAULT_ENABLED_PACKS = {
  'Basic Tile Pack': true,
  'Junctions & Nontraditional Cities': true,
  'Limited Exit & Token Cities': true,
  'X Series': true,
  'These are dumb and you are dumb but they don\'t break anything, I think': false,
  'Unclassified (Review Needed)': false,
  'Unsupported': false,
};
