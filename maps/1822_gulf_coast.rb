# frozen_string_literal: true

# 1822 Gulf Coast — map.rb
#
# Geographic scope:
#   E/W: Marfa, TX → Tallahassee, FL  (~104°W – ~84°W)
#   N/S: Monterrey, MX → Nashville, TN (~25.7°N – ~36°N)
#
# Grid: 36 visual columns × 21 rows (A–U), flat-top layout.
# Coordinate parity: odd-position rows (A,C,E,G,I,K,M,O,Q,S,U) use even col
#                    numbers; even-position rows (B,D,F,H,J,L,N,P,R,T) use odd.
# Col range 2–72 for even-position rows; 1–71 for odd-position rows.
#
# Memphis = London-equivalent (6-slot L-hub, C50).
# Minor capacity: 26 single-slot white cities + 4 Y-cities = 30 potential homes.
# Tile manifest: deferred to separate design stage.

module Engine
  module Game
    module G1822GulfCoast
      module Map
        # Tile manifest deferred — extend from 1822 base tile series.
        # Custom tiles needed: L-progression for Memphis, Y-progressions for
        # Dallas/FW, Houston, New Orleans, Birmingham; game-specific grays.
        TILES = {}.freeze

        LOCATION_NAMES = {
          # Memphis hub
          'C50' => 'Memphis',

          # Offboards
          'A38' => 'Oklahoma City & St. Louis',
          'A54' => 'Nashville & Knoxville',
          'F71' => 'Atlanta',
          'L71' => 'Tallahassee & Jacksonville',
          'I4'  => 'El Paso & West Texas',
          'T15' => 'Monterrey',
          'T45' => 'Tampico & Veracruz',

          # Major cities (Y-label, pre-printed yellow)
          'H27' => 'Dallas & Fort Worth',
          'N33' => 'Houston',
          'M50' => 'New Orleans',
          'F61' => 'Birmingham',

          # Minor company cities (26 total)
          'C54' => 'Jackson, TN',
          'D43' => 'Little Rock',
          'D65' => 'Chattanooga',
          'E62' => 'Huntsville',
          'F43' => 'Pine Bluff',
          'F53' => 'Tupelo',
          'G48' => 'Vicksburg',
          'H37' => 'Shreveport',
          'H43' => 'Monroe',
          'H49' => 'Jackson, MS',
          'I58' => 'Meridian',
          'I64' => 'Montgomery',
          'J27' => 'Waco',
          'J43' => 'Alexandria',
          'J47' => 'Natchez',
          'K52' => 'Hattiesburg',
          'K60' => 'Mobile',
          'L39' => 'Lake Charles',
          'L47' => 'Baton Rouge',
          'L61' => 'Pensacola',
          'M24' => 'Austin',
          'M36' => 'Beaumont',
          'M44' => 'Lafayette',
          'N19' => 'San Antonio',
          'P23' => 'Corpus Christi',
          'Q18' => 'Laredo',

          # Towns (no minor home, connectivity only)
          'E56' => 'Corinth',
          'G36' => 'Texarkana',
          'G44' => 'Hot Springs',
          'G56' => 'Columbus',
          'G66' => 'Auburn',
          'I22' => 'Tyler',
          'I42' => 'Natchitoches',
          'J63' => 'Selma',
          'K34' => 'Lufkin',
          'K66' => 'Demopolis',
          'M56' => 'Biloxi',
          'O34' => 'Galveston',
          'S20' => 'Brownsville',
        }.freeze

        HEXES = {
          white: {
            # ── Blank hexes — Row A (northern edge: TN / N. Arkansas) ──────────
            %w[A28 A30 A32 A34 A36 A40 A42 A44 A46 A48 A50 A52 A56 A58 A60 A62
               A64 A66 A68 A70] =>
              '',

            # Row B
            %w[B27 B29 B31 B33 B35 B37 B39 B41 B43 B45 B47 B49 B51 B53 B55
               B57 B59 B61 B63 B65 B67 B69] =>
              '',

            # Row C — minus C50 (Memphis) and C54 (Jackson TN)
            %w[C26 C28 C30 C32 C34 C36 C38 C40 C42 C44 C46 C48 C52 C56 C58
               C60 C62 C64 C66 C68 C70] =>
              '',

            # Row D — minus D37/39 (Ozarks), D43 (LittleRock), D49 (river),
            #          D65 (Chattanooga)
            %w[D25 D27 D29 D31 D33 D35 D41 D45 D47 D51 D53 D55 D57 D59 D61
               D63 D67 D69] =>
              '',

            # Row E — minus E38/40 (Ozarks), E50 (river), E56 (Corinth town),
            #          E62 (Huntsville), E64/66/68/70 (Appalachians)
            %w[E22 E24 E26 E28 E30 E32 E34 E36 E42 E44 E46 E48 E52 E54 E58 E60] =>
              '',

            # Row F — minus F37/39 (Ozarks), F43 (PineBluff), F51 (river),
            #          F53 (Tupelo), F61 (Birmingham-Y), F65/67/69 (Appalachians),
            #          F71 (Atlanta OB)
            %w[F21 F23 F25 F27 F29 F31 F33 F35 F41 F45 F47 F49 F55 F57 F59 F63] =>
              '',

            # Row G — minus G36 (Texarkana), G44 (HotSprings), G48 (Vicksburg),
            #          G56 (Columbus), G66 (Auburn), G68/70 (Appalachians)
            %w[G20 G22 G24 G26 G28 G30 G32 G34 G38 G40 G42 G46 G50 G52 G54
               G58 G60 G62 G64] =>
              '',

            # Row H — minus H27 (Dallas-Y), H37 (Shreveport), H43 (Monroe),
            #          H49 (JacksonMS), H51 (river)
            %w[H19 H21 H23 H25 H29 H31 H33 H35 H39 H41 H45 H47 H53 H55 H57
               H59 H61 H63 H65 H67 H69 H71] =>
              '',

            # Row I — minus I4 (ElPaso OB), I22 (Tyler), I42 (Natchitoches),
            #          I50 (river), I58 (Meridian), I64 (Montgomery)
            %w[I6 I8 I10 I12 I14 I16 I18 I20 I24 I26 I28 I30 I32 I34 I36 I38
               I40 I44 I46 I48 I52 I54 I56 I60 I62 I66 I68 I70] =>
              '',

            # Row J — minus J27 (Waco), J43 (Alexandria), J47 (Natchez),
            #          J49 (river), J63 (Selma)
            %w[J19 J21 J23 J25 J29 J31 J33 J35 J37 J39 J41 J45 J51 J53 J55
               J57 J59 J61 J65 J67 J69 J71] =>
              '',

            # Row K — minus K34 (Lufkin), K46 (bayou), K48 (river),
            #          K52 (Hattiesburg), K60 (Mobile), K66 (Demopolis)
            %w[K18 K20 K22 K24 K26 K28 K30 K32 K36 K38 K40 K42 K44 K50 K54
               K56 K58 K62 K64 K68 K70] =>
              '',

            # Row L — minus L39 (LakeCharles), L43/45 (bayou), L47 (BatonRouge),
            #          L49 (river), L61 (Pensacola), L71 (Florida OB)
            %w[L17 L19 L21 L23 L25 L27 L29 L31 L33 L35 L37 L41 L51 L53 L55
               L57 L59 L63 L65 L67 L69] =>
              '',

            # Row M — minus M24 (Austin), M36 (Beaumont), M44 (Lafayette),
            #          M50 (NewOrleans-Y), M56 (Biloxi)
            %w[M14 M16 M18 M20 M22 M26 M28 M30 M32 M34 M38 M40 M42 M46 M48
               M52 M54 M58 M60 M62 M64] =>
              '',

            # Row N — minus N19 (SanAntonio), N33 (Houston-Y),
            #          N37/41/43 (swamp)
            %w[N11 N13 N15 N17 N21 N23 N25 N27 N29 N31 N35 N39 N45 N47 N49
               N51 N53 N55 N57 N59 N61 N63] =>
              '',

            # Row O — minus O30/50/62 (blue Gulf), O34 (Galveston),
            #          O38/40/42/46 (swamp)
            %w[O10 O12 O14 O16 O18 O20 O22 O24 O26 O28 O32 O36 O44 O48 O52
               O56 O58 O60 O64] =>
              '',

            # Row P — minus P23 (CorpusChristi)
            %w[P11 P13 P15 P17 P19 P21 P25 P27 P29 P31 P33 P35 P37 P39 P41
               P43 P45 P47 P49 P51 P53 P55 P57 P59] =>
              '',

            # Row Q — minus Q18 (Laredo)
            %w[Q8 Q10 Q12 Q14 Q16 Q20 Q22 Q24 Q26 Q28 Q30 Q32 Q34 Q36 Q38
               Q40 Q42 Q44 Q46] =>
              '',

            # Row R — minus R15/17 (Sierra Madre hills)
            %w[R9 R11 R13 R19 R21 R23 R25 R27 R29 R31 R33 R35 R37 R39 R41
               R43] =>
              '',

            # Row S — minus S14 (hill), S16 (mountain), S18 (hill), S20 (Brownsville)
            %w[S8 S10 S12 S22 S24 S26 S28 S30 S32 S34 S36] =>
              '',

            # Row T — minus T15 (Monterrey OB), T45 (Tampico OB)
            %w[T9 T11 T13 T17 T19 T21 T23 T25 T27 T29 T31 T33 T35 T37 T39
               T41 T43] =>
              '',

            # Row U (southern Mexico fringe)
            %w[U10 U12 U14 U16 U18 U20 U22 U24 U26 U28 U30 U32 U34 U36] =>
              '',

            # ── Terrain: Mississippi River corridor ────────────────────────────
            # Blank crossing hexes between river cities — $40 to bridge.
            %w[D49 F51 H51 I50 J49 K48 L49] =>
              'upgrade=cost:40,terrain:river',

            # E50: open river hex just south of Memphis
            ['E50'] =>
              'upgrade=cost:40,terrain:river',

            # ── Terrain: Ozark hills (NW Arkansas) ────────────────────────────
            %w[D37 D39 F37 F39] =>
              'upgrade=cost:40,terrain:hill',

            %w[E38 E40] =>
              'upgrade=cost:60,terrain:hill',

            # ── Terrain: Appalachian foothills / ridge (NE Alabama & Georgia) ──
            %w[E64 F65 G68 G70 I70] =>
              'upgrade=cost:40,terrain:hill',

            %w[E66 E68 E70 F67 F69] =>
              'upgrade=cost:80,terrain:mountain',

            # ── Terrain: Big Thicket / Louisiana bayou & swamp ────────────────
            %w[N37 N41 N43 O38 O40 O42 O46] =>
              'upgrade=cost:20,terrain:swamp',

            %w[L43 L45 K46] =>
              'upgrade=cost:20,terrain:swamp',

            # ── Terrain: Sierra Madre foothills (Northern Mexico) ─────────────
            %w[R15 R17 S14 S18] =>
              'upgrade=cost:40,terrain:hill',

            ['S16'] =>
              'upgrade=cost:80,terrain:mountain',

            # ── Memphis — 6-slot London-equivalent hub ────────────────────────
            # Starts white with all six edges open; upgrades through the L-series.
            # upgrade=cost:20 models the Memphis rail bridge toll (Mississippi).
            ['C50'] =>
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'path=a:0,b:_0;path=a:1,b:_1;path=a:2,b:_2;' \
              'path=a:3,b:_3;path=a:4,b:_4;path=a:5,b:_5;' \
              'upgrade=cost:20;label=L',

            # ── Minor company cities — plain ───────────────────────────────────
            %w[C54 D43 E62 F43 F53 H37 H43 H49 I58 I64 J27 J43 K52 K60
               L39 L61 M24 M36 M44 N19 P23 Q18] =>
              'city=revenue:0',

            # Chattanooga: in the Appalachian foothills
            ['D65'] =>
              'city=revenue:0;upgrade=cost:40,terrain:hill',

            # Cities on the Mississippi River (bridge cost applies)
            ['G48'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            ['J47'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            ['L47'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            # ── Towns ──────────────────────────────────────────────────────────
            %w[E56 G36 G44 G56 G66 I22 I42 J63 K34 K66 M56 O34 S20] =>
              'town=revenue:0',
          },

          yellow: {
            # ── Pre-printed yellow cities ──────────────────────────────────────
            #
            # Dallas & Fort Worth: DFW is the western industrial anchor.
            # Connects north toward Little Rock/Memphis (edge 0),
            # southeast toward Tyler/Houston (edge 2),
            # south toward Waco/San Antonio (edge 3).
            ['H27'] =>
              'city=revenue:30,slots:2;' \
              'path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y',

            # Houston: Gulf Coast industrial hub.
            # Connects northwest toward Dallas (edge 5),
            # northeast toward Beaumont/New Orleans (edge 1),
            # south toward Gulf (edge 3).
            ['N33'] =>
              'city=revenue:20,slots:1;' \
              'path=a:1,b:_0;path=a:3,b:_0;path=a:5,b:_0;label=Y',

            # New Orleans: Mississippi delta and Gulf terminus.
            # Connects north toward Memphis via the river (edge 0),
            # northwest toward Baton Rouge/Lafayette (edge 5),
            # east toward Mobile/Biloxi (edge 2).
            ['M50'] =>
              'city=revenue:30,slots:2;' \
              'path=a:0,b:_0;path=a:2,b:_0;path=a:5,b:_0;label=Y',

            # Birmingham: Alabama's industrial center.
            # Connects west toward Memphis (edge 4),
            # north toward Nashville direction (edge 1),
            # south toward Montgomery (edge 3).
            ['F61'] =>
              'city=revenue:30,slots:2;' \
              'path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y',
          },

          gray: {
            # ── Offboards ──────────────────────────────────────────────────────
            #
            # Oklahoma City & St. Louis direction (north-central)
            ['A38'] =>
              'offboard=revenue:yellow_20|green_30|brown_40|gray_50,visit_cost:0;' \
              'path=a:3,b:_0,terminal:1',

            # Nashville & Knoxville (north-northeast — the primary Tennessee exit)
            ['A54'] =>
              'offboard=revenue:yellow_30|green_40|brown_60|gray_80,visit_cost:0;' \
              'path=a:2,b:_0,terminal:1;path=a:3,b:_0,terminal:1',

            # Atlanta (east edge — major industrial market)
            ['F71'] =>
              'offboard=revenue:yellow_30|green_40|brown_60|gray_80,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:5,b:_0,terminal:1',

            # Tallahassee & Jacksonville (southeast edge — Florida coast)
            ['L71'] =>
              'offboard=revenue:yellow_20|green_30|brown_40|gray_60,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1',

            # El Paso & West Texas (west edge — transcontinental route)
            ['I4'] =>
              'offboard=revenue:yellow_10|green_20|brown_30|gray_40,visit_cost:0;' \
              'path=a:1,b:_0,terminal:1;path=a:2,b:_0,terminal:1',

            # Monterrey (south — Mexican interior market)
            ['T15'] =>
              'offboard=revenue:yellow_20|green_30|brown_50|gray_70,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1',

            # Tampico & Veracruz (south-central — Gulf of Mexico / Mexico routes)
            ['T45'] =>
              'offboard=revenue:yellow_20|green_30|brown_40|gray_50,visit_cost:0;' \
              'path=a:3,b:_0,terminal:1;path=a:4,b:_0,terminal:1',
          },

          blue: {
            # ── Gulf of Mexico — shipping lane junctions ────────────────────────
            # Approached from the north (edge 0) by coastal track.
            # Revenue bonus for routes that terminate here is handled by
            # the 1822 port-bonus mechanism (to be defined in game.rb).
            ['O30'] =>
              'junction;path=a:0,b:_0,terminal:1',

            ['O50'] =>
              'junction;path=a:0,b:_0,terminal:1',

            ['O62'] =>
              'junction;path=a:0,b:_0,terminal:1',
          },
        }.freeze
      end
    end
  end
end
