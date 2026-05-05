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
# Memphis = London-equivalent (6-slot L-hub, Y6).
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
          'Y6' => 'Memphis',

          # Offboards
          'S2' => 'Oklahoma City & St. Louis',
          'AA2' => 'Nashville & Knoxville',
          'AJ11' => 'Atlanta',
          'AJ23' => 'Tallahassee & Jacksonville',
          'B17'  => 'El Paso & West Texas',
          'H39' => 'Monterrey',
          'W40' => 'Tampico & Veracruz',

          # Major cities (Y-label, pre-printed yellow)
          'N15' => 'Dallas & Fort Worth',
          'Q28' => 'Houston',
          'Y26' => 'New Orleans',
          'AE12' => 'Birmingham',

          # Minor company cities (26 total)
          'AA6' => 'Jackson, TN',
          'V7' => 'Little Rock',
          'AG8' => 'Chattanooga',
          'AE10' => 'Huntsville',
          'V11' => 'Pine Bluff',
          'AA12' => 'Tupelo',
          'X13' => 'Vicksburg',
          'S16' => 'Shreveport',
          'V15' => 'Monroe',
          'Y16' => 'Jackson, MS',
          'AC18' => 'Meridian',
          'AF17' => 'Montgomery',
          'N19' => 'Waco',
          'V19' => 'Alexandria',
          'X19' => 'Natchez',
          'Z21' => 'Hattiesburg',
          'AD21' => 'Mobile',
          'T23' => 'Lake Charles',
          'X23' => 'Baton Rouge',
          'AE24' => 'Pensacola',
          'L25' => 'Austin',
          'R25' => 'Beaumont',
          'V25' => 'Lafayette',
          'J27' => 'San Antonio',
          'L31' => 'Corpus Christi',
          'I34' => 'Laredo',

          # Towns (no minor home, connectivity only)
          'AB9' => 'Corinth',
          'R13' => 'Texarkana',
          'V13' => 'Hot Springs',
          'AB13' => 'Columbus',
          'AG14' => 'Auburn',
          'K18' => 'Tyler',
          'U18' => 'Natchitoches',
          'AF19' => 'Selma',
          'Q22' => 'Lufkin',
          'AG22' => 'Demopolis',
          'AB25' => 'Biloxi',
          'Q30' => 'Galveston',
          'J37' => 'Brownsville',
        }.freeze

        HEXES = {
          white: {
            # ── Blank hexes — Row A (northern edge: TN / N. Arkansas) ──────────
            %w[N1 O2 P1 Q2 R1 T1 U2 V1 W2 X1 Y2 Z1 AB1 AC2 AD1 AE2
               AF1 AG2 AH1 AI2] =>
              '',

            # Row B
            %w[N3 O4 P3 Q4 R3 S4 T3 U4 V3 W4 X3 Y4 Z3 AA4 AB3
               AC4 AD3 AE4 AF3 AG4 AH3 AI4] =>
              '',

            # Row C — minus Y6 (Memphis) and AA6 (Jackson TN)
            %w[M6 N5 O6 P5 Q6 R5 S6 T5 U6 V5 W6 X5 Z5 AB5 AC6
               AD5 AE6 AF5 AG6 AH5 AI6] =>
              '',

            # Row D — minus S8/39 (Ozarks), V7 (LittleRock), Y8 (river),
            #          AG8 (Chattanooga)
            %w[M8 N7 O8 P7 Q8 R7 U8 W8 X7 Z7 AA8 AB7 AC8 AD7 AE8
               AF7 AH7 AI8] =>
              '',

            # Row E — minus S10/40 (Ozarks), Y10 (river), AB9 (Corinth town),
            #          AE10 (Huntsville), AF9/66/68/70 (Appalachians)
            %w[K10 L9 M10 N9 O10 P9 Q10 R9 U10 V9 W10 X9 Z9 AA10 AC10 AD9] =>
              '',

            # Row F — minus S12/39 (Ozarks), V11 (PineBluff), Z11 (river),
            #          AA12 (Tupelo), AE12 (Birmingham-Y), AG12/67/69 (Appalachians),
            #          AJ11 (Atlanta OB)
            %w[K12 L11 M12 N11 O12 P11 Q12 R11 U12 W12 X11 Y12 AB11 AC12 AD11 AF11] =>
              '',

            # Row G — minus R13 (Texarkana), V13 (HotSprings), X13 (Vicksburg),
            #          AB13 (Columbus), AG14 (Auburn), AH13/70 (Appalachians)
            %w[J13 K14 L13 M14 N13 O14 P13 Q14 S14 T13 U14 W14 Y14 Z13 AA14
               AC14 AD13 AE14 AF13] =>
              '',

            # Row H — minus N15 (Dallas-Y), S16 (Shreveport), V15 (Monroe),
            #          Y16 (JacksonMS), Z15 (river)
            %w[J15 K16 L15 M16 O16 P15 Q16 R15 T15 U16 W16 X15 AA16 AB15 AC16
               AD15 AE16 AF15 AG16 AH15 AI16 AJ15] =>
              '',

            # Row I — minus B17 (ElPaso OB), K18 (Tyler), U18 (Natchitoches),
            #          Y18 (river), AC18 (Meridian), AF17 (Montgomery)
            %w[C18 D17 E18 F17 G18 H17 I18 J17 L17 M18 N17 O18 P17 Q18 R17 S18
               T17 V17 W18 X17 Z17 AA18 AB17 AD17 AE18 AG18 AH17 AI18] =>
              '',

            # Row J — minus N19 (Waco), V19 (Alexandria), X19 (Natchez),
            #          Y20 (river), AF19 (Selma)
            %w[J19 K20 L19 M20 O20 P19 Q20 R19 S20 T19 U20 W20 Z19 AA20 AB19
               AC20 AD19 AE20 AG20 AH19 AI20 AJ19] =>
              '',

            # Row K — minus Q22 (Lufkin), W22 (bayou), X21 (river),
            #          Z21 (Hattiesburg), AD21 (Mobile), AG22 (Demopolis)
            %w[I22 J21 K22 L21 M22 N21 O22 P21 R21 S22 T21 U22 V21 Y22 AA22
               AB21 AC22 AE22 AF21 AH21 AI22] =>
              '',

            # Row L — minus T23 (LakeCharles), V23/45 (bayou), X23 (BatonRouge),
            #          Y24 (river), AE24 (Pensacola), AJ23 (Florida OB)
            %w[I24 J23 K24 L23 M24 N23 O24 P23 Q24 R23 S24 U24 Z23 AA24 AB23
               AC24 AD23 AF23 AG24 AH23 AI24] =>
              '',

            # Row M — minus L25 (Austin), R25 (Beaumont), V25 (Lafayette),
            #          Y26 (NewOrleans-Y), AB25 (Biloxi)
            %w[G26 H25 I26 J25 K26 M26 N25 O26 P25 Q26 S26 T25 U26 W26 X25
               Z25 AA26 AC26 AD25 AE26 AF25] =>
              '',

            # Row N — minus J27 (SanAntonio), Q28 (Houston-Y),
            #          S28/41/43 (swamp)
            %w[F27 G28 H27 I28 K28 L27 M28 N27 O28 P27 R27 T27 W28 X27 Y28
               Z27 AA28 AB27 AC28 AD27 AE28 AF27] =>
              '',

            # Row O — minus O30/50/62 (blue Gulf), Q30 (Galveston),
            #          S30/40/42/46 (swamp)
            %w[E30 F29 G30 H29 I30 J29 K30 L29 M30 N29 P29 R29 V29 X29 Z29
               AB29 AC30 AD29 AF29] =>
              '',

            # Row P — minus L31 (CorpusChristi)
            %w[F31 G32 H31 I32 J31 K32 M32 N31 O32 P31 Q32 R31 S32 T31 U32
               V31 W32 X31 Y32 Z31 AA32 AB31 AC32 AD31] =>
              '',

            # Row Q — minus I34 (Laredo)
            %w[D33 E34 F33 G34 H33 J33 K34 L33 M34 N33 O34 P33 Q34 R33 S34
               T33 U34 V33 W34] =>
              '',

            # Row R — minus H35/17 (Sierra Madre hills)
            %w[E36 F35 G36 J35 K36 L35 M36 N35 O36 P35 Q36 R35 S36 T35 U36
               V35] =>
              '',

            # Row S — minus G38 (hill), H37 (mountain), I38 (hill), J37 (Brownsville)
            %w[D37 E38 F37 K38 L37 M38 N37 O38 P37 Q38 R37] =>
              '',

            # Row T — minus H39 (Monterrey OB), W40 (Tampico OB)
            %w[E40 F39 G40 I40 J39 K40 L39 M40 N39 O40 P39 Q40 R39 S40 T39
               U40 V39] =>
              '',

            # Row U (southern Mexico fringe)
            %w[E42 F41 G42 H41 I42 J41 K42 L41 M42 N41 O42 P41 Q42 R41] =>
              '',

            # ── Terrain: Mississippi River corridor ────────────────────────────
            # Blank crossing hexes between river cities — $40 to bridge.
            %w[Y8 Z11 Z15 Y18 Y20 X21 Y24] =>
              'upgrade=cost:40,terrain:river',

            # Y10: open river hex just south of Memphis
            ['Y10'] =>
              'upgrade=cost:40,terrain:river',

            # ── Terrain: Ozark hills (NW Arkansas) ────────────────────────────
            %w[S8 T7 S12 T11] =>
              'upgrade=cost:40,terrain:hill',

            %w[S10 T9] =>
              'upgrade=cost:60,terrain:hill',

            # ── Terrain: Appalachian foothills / ridge (NE Alabama & Georgia) ──
            %w[AF9 AG12 AH13 AI14 AI18] =>
              'upgrade=cost:40,terrain:hill',

            %w[AG10 AH9 AI10 AH11 AI12] =>
              'upgrade=cost:80,terrain:mountain',

            # ── Terrain: Big Thicket / Louisiana bayou & swamp ────────────────
            %w[S28 U28 V27 S30 T29 U30 W30] =>
              'upgrade=cost:20,terrain:swamp',

            %w[V23 W24 W22] =>
              'upgrade=cost:20,terrain:swamp',

            # ── Terrain: Sierra Madre foothills (Northern Mexico) ─────────────
            %w[H35 I36 G38 I38] =>
              'upgrade=cost:40,terrain:hill',

            ['H37'] =>
              'upgrade=cost:80,terrain:mountain',

            # ── Memphis — 6-slot London-equivalent hub ────────────────────────
            # Starts white with all six edges open; upgrades through the L-series.
            # upgrade=cost:20 models the Memphis rail bridge toll (Mississippi).
            ['Y6'] =>
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'city=revenue:20,groups:Memphis;city=revenue:20,groups:Memphis;' \
              'path=a:0,b:_0;path=a:1,b:_1;path=a:2,b:_2;' \
              'path=a:3,b:_3;path=a:4,b:_4;path=a:5,b:_5;' \
              'upgrade=cost:20;label=L',

            # ── Minor company cities — plain ───────────────────────────────────
            %w[AA6 V7 AE10 V11 AA12 S16 V15 Y16 AC18 AF17 N19 V19 Z21 AD21
               T23 AE24 L25 R25 V25 J27 L31 I34] =>
              'city=revenue:0',

            # Chattanooga: in the Appalachian foothills
            ['AG8'] =>
              'city=revenue:0;upgrade=cost:40,terrain:hill',

            # Cities on the Mississippi River (bridge cost applies)
            ['X13'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            ['X19'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            ['X23'] =>
              'city=revenue:0;upgrade=cost:40,terrain:river',

            # ── Towns ──────────────────────────────────────────────────────────
            %w[AB9 R13 V13 AB13 AG14 K18 U18 AF19 Q22 AG22 AB25 Q30 J37] =>
              'town=revenue:0',
          },

          yellow: {
            # ── Pre-printed yellow cities ──────────────────────────────────────
            #
            # Dallas & Fort Worth: DFW is the western industrial anchor.
            # Connects north toward Little Rock/Memphis (edge 0),
            # southeast toward Tyler/Houston (edge 2),
            # south toward Waco/San Antonio (edge 3).
            ['N15'] =>
              'city=revenue:30,slots:2;' \
              'path=a:0,b:_0;path=a:2,b:_0;path=a:3,b:_0;label=Y',

            # Houston: Gulf Coast industrial hub.
            # Connects northwest toward Dallas (edge 5),
            # northeast toward Beaumont/New Orleans (edge 1),
            # south toward Gulf (edge 3).
            ['Q28'] =>
              'city=revenue:20,slots:1;' \
              'path=a:1,b:_0;path=a:3,b:_0;path=a:5,b:_0;label=Y',

            # New Orleans: Mississippi delta and Gulf terminus.
            # Connects north toward Memphis via the river (edge 0),
            # northwest toward Baton Rouge/Lafayette (edge 5),
            # east toward Mobile/Biloxi (edge 2).
            ['Y26'] =>
              'city=revenue:30,slots:2;' \
              'path=a:0,b:_0;path=a:2,b:_0;path=a:5,b:_0;label=Y',

            # Birmingham: Alabama's industrial center.
            # Connects west toward Memphis (edge 4),
            # north toward Nashville direction (edge 1),
            # south toward Montgomery (edge 3).
            ['AE12'] =>
              'city=revenue:30,slots:2;' \
              'path=a:1,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y',
          },

          gray: {
            # ── Offboards ──────────────────────────────────────────────────────
            #
            # Oklahoma City & St. Louis direction (north-central)
            ['S2'] =>
              'offboard=revenue:yellow_20|green_30|brown_40|gray_50,visit_cost:0;' \
              'path=a:3,b:_0,terminal:1',

            # Nashville & Knoxville (north-northeast — the primary Tennessee exit)
            ['AA2'] =>
              'offboard=revenue:yellow_30|green_40|brown_60|gray_80,visit_cost:0;' \
              'path=a:2,b:_0,terminal:1;path=a:3,b:_0,terminal:1',

            # Atlanta (east edge — major industrial market)
            ['AJ11'] =>
              'offboard=revenue:yellow_30|green_40|brown_60|gray_80,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:5,b:_0,terminal:1',

            # Tallahassee & Jacksonville (southeast edge — Florida coast)
            ['AJ23'] =>
              'offboard=revenue:yellow_20|green_30|brown_40|gray_60,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1',

            # El Paso & West Texas (west edge — transcontinental route)
            ['B17'] =>
              'offboard=revenue:yellow_10|green_20|brown_30|gray_40,visit_cost:0;' \
              'path=a:1,b:_0,terminal:1;path=a:2,b:_0,terminal:1',

            # Monterrey (south — Mexican interior market)
            ['H39'] =>
              'offboard=revenue:yellow_20|green_30|brown_50|gray_70,visit_cost:0;' \
              'path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1',

            # Tampico & Veracruz (south-central — Gulf of Mexico / Mexico routes)
            ['W40'] =>
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

            ['Y30'] =>
              'junction;path=a:0,b:_0,terminal:1',

            ['AE30'] =>
              'junction;path=a:0,b:_0,terminal:1',
          },
        }.freeze
      end
    end
  end
end
