# frozen_string_literal: true
# Exported by 18xxtools — edit freely
# EDITOR_GRID rows=11 cols=12

module Engine
  module Game
    module GGGame
      module Map
LAYOUT = :pointy
AXES = { x: :number, y: :letter }.freeze

LOCATION_NAMES = {
  'A11' => 'Canadian West',
  'A19' => 'Montreal',
  'B10' => 'Barrie',
  'B16' => 'Ottawa',
  'B20' => 'Burlington',
  'B24' => 'Maritime Provinces',
  'C15' => 'Kingston',
  'D2' => 'Lansing',
  'D4' => 'Flint',
  'D10' => 'Hamilton & Toronto',
  'D14' => 'Rochester',
  'E5' => 'Detroit & Windsor',
  'E7' => 'London',
  'E11' => 'Dunkirk & Buffalo',
  'E19' => 'Albany',
  'E23' => 'Boston',
  'F2' => 'Chicago',
  'F4' => 'Toledo',
  'F6' => 'Cleveland',
  'F10' => 'Erie',
  'F16' => 'Scranton',
  'F20' => 'New Haven & Hartford',
  'F22' => 'Providence',
  'F24' => 'Mansfield',
  'G7' => 'Akron & Canton',
  'G17' => 'Reading & Allentown',
  'G19' => 'New York & Newark',
  'H4' => 'Columbus',
  'H10' => 'Pittsburgh',
  'H12' => 'Altoona',
  'H16' => 'Lancaster',
  'H18' => 'Philadelphia & Trenton',
  'I15' => 'Baltimore',
  'I19' => 'Atlantic City',
  'J2' => 'Gulf',
  'J14' => 'Washington',
  'K13' => 'Deep South',
  'K15' => 'Richmond',
}.freeze

TILES = {
  '1' => 1,
  '2' => 1,
  '3' => 2,
  '4' => 2,
  '7' => 4,
  '8' => 8,
  '9' => 7,
  '14' => 3,
  '15' => 2,
  '16' => 1,
  '18' => 1,
  '19' => 1,
  '20' => 1,
  '23' => 3,
  '24' => 3,
  '25' => 1,
  '26' => 1,
  '27' => 1,
  '28' => 1,
  '29' => 1,
  '39' => 1,
  '40' => 1,
  '41' => 2,
  '42' => 2,
  '43' => 2,
  '44' => 1,
  '45' => 2,
  '46' => 2,
  '47' => 1,
  '53' => 2,
  '54' => 1,
  '55' => 1,
  '56' => 1,
  '57' => 4,
  '58' => 2,
  '59' => 2,
  '61' => 2,
  '62' => 1,
  '63' => 3,
  '64' => 1,
  '65' => 1,
  '66' => 1,
  '67' => 1,
  '68' => 1,
  '69' => 1,
  '70' => 1,
}.freeze

HEXES = {
  white: {
    %w[
      B10 B12 B14 B22 C7 C9 C23 D8 D16 D18 D20 E3 E13 E15 E19 F12 F14 F18 G3 G5 G9 G11
      H2 H4 H6 H8 H10 H14 H16 I3 I5 I7 I9 I13 J4 J6 J8
    ] => '',
    ['C13'] => 'border=edge:0,type:impassable',
    ['F8'] => 'border=edge:2,type:impassable',
    ['D12'] => 'border=edge:2,type:impassable;border=edge:3,type:impassable',
    ['C11'] => 'border=edge:5,type:impassable',
    ['B16'] => 'city=revenue:0;border=edge:5,type:impassable',
    ['F16'] => 'city=revenue:0;upgrade=cost:120,terrain:mountain',
    %w[
      F4 F22 J14
    ] => 'city=revenue:0;upgrade=cost:80,terrain:water',
    %w[
      B20 D4 F10
    ] => 'town=revenue:0',
    ['E7'] => 'town=revenue:0;border=edge:5,type:impassable',
    %w[
      F20 G7 G17
    ] => 'town=revenue:0;town=revenue:0',
    %w[
      C21 D22 E17 E21 G13 G15 I11 J10 J12
    ] => 'upgrade=cost:120,terrain:mountain',
    ['C17'] => 'upgrade=cost:120,terrain:mountain;border=edge:2,type:impassable',
    %w[
      B18 C19 D6 I17
    ] => 'upgrade=cost:80,terrain:water',
  },
  yellow: {
    %w[
      E11 H18
    ] => 'city=revenue:0;city=revenue:0;label=OO',
    %w[
      D10 E5
    ] => 'city=revenue:0;city=revenue:0;label=OO;upgrade=cost:80,terrain:water',
    ['E23'] => 'city=revenue:30;path=a:3,b:_0;path=a:5,b:_0;label=B',
    ['I15'] => 'city=revenue:30;path=a:4,b:_0;path=a:0,b:_0;label=B',
    ['G19'] => 'city=revenue:40;city=revenue:40;path=a:3,b:_0;path=a:0,b:_1;label=NY;upgrade=cost:80,terrain:water',
  },
  gray: {
    ['H12'] => 'city=revenue:10,loc:2.5;path=a:1,b:_0;path=a:4,b:_0;path=a:1,b:4',
    ['D14'] => 'city=revenue:20;path=a:1,b:_0;path=a:4,b:_0;path=a:0,b:_0',
    ['K15'] => 'city=revenue:20;path=a:2,b:_0',
    ['D2'] => 'city=revenue:20;path=a:5,b:_0;path=a:4,b:_0',
    ['F6'] => 'city=revenue:30;path=a:5,b:_0;path=a:0,b:_0',
    ['A19'] => 'city=revenue:40;path=a:5,b:_0;path=a:0,b:_0',
    ['A17'] => 'path=a:0,b:5',
    ['D24'] => 'path=a:1,b:0',
    ['E9'] => 'path=a:2,b:3',
    %w[
      F24 I19
    ] => 'town=revenue:10;path=a:1,b:_0;path=a:2,b:_0',
    ['C15'] => 'town=revenue:10;path=a:1,b:_0;path=a:3,b:_0',
  },
  red: {
    ['B24'] => 'offboard=revenue:yellow_20|brown_30;path=a:1,b:_0;path=a:0,b:_0',
    ['K13'] => 'offboard=revenue:yellow_30|brown_40;path=a:2,b:_0;path=a:3,b:_0',
    ['A9'] => 'offboard=revenue:yellow_30|brown_50;path=a:5,b:_0;border=edge:4,type:impassable',
    ['A11'] => 'offboard=revenue:yellow_30|brown_50;path=a:5,b:_0;path=a:0,b:_0;border=edge:1,type:impassable',
    ['J2'] => 'offboard=revenue:yellow_30|brown_60;path=a:3,b:_0;path=a:4,b:_0;border=edge:2,type:impassable',
    ['I1'] => 'offboard=revenue:yellow_30|brown_60;path=a:4,b:_0;border=edge:5,type:impassable',
    ['F2'] => 'offboard=revenue:yellow_40|brown_70;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0',
  },
}.freeze

      end
    end
  end
end
