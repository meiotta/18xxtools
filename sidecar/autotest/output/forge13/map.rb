# frozen_string_literal: true
# Exported by 18xxtools — edit freely
# EDITOR_GRID rows=7 cols=12

LAYOUT = :flat
AXES = { x: :number, y: :letter }.freeze

LOCATION_NAMES = {
  'A11' => 'Easton',
  'B2' => 'Pittsburgh',
  'B4' => 'Berlin',
  'B6' => 'Harrisburg',
  'B10' => 'Allentown',
  'B12' => 'New York',
  'C5' => 'Hagerstown',
  'C7' => 'Columbia',
  'C11' => 'Trenton & Amboy',
  'D2' => 'Charleroi & Connellsville',
  'D8' => 'Strasburg',
  'D10' => 'Philadelphia',
  'E3' => 'Green Spring',
  'E9' => 'Wilmington',
  'E11' => 'Burlington & Princeton',
  'F8' => 'Baltimore',
  'F10' => 'Camden',
  'G1' => 'Ohio',
  'H4' => 'Leesburg',
  'H6' => 'Washington DC',
  'I9' => 'Delmarva Peninsula',
  'K5' => 'Fredericksburg',
  'L4' => 'Charlottesville',
  'M3' => 'Lynchburg',
  'M7' => 'Richmond',
  'N2' => 'West Virginia Coal',
  'N8' => 'Norfolk',
}.freeze

TILES = {
  '1' => 1,
  '2' => 1,
  '3' => 2,
  '4' => 2,
  '14' => 5,
  '15' => 6,
  '16' => 1,
  '19' => 1,
  '20' => 1,
  '23' => 3,
  '24' => 3,
  '25' => 2,
  '26' => 1,
  '27' => 1,
  '28' => 1,
  '29' => 1,
  '39' => 1,
  '40' => 1,
  '41' => 1,
  '42' => 1,
  '43' => 2,
  '44' => 1,
  '45' => 1,
  '46' => 1,
  '47' => 2,
  '55' => 1,
  '56' => 1,
  '57' => 7,
  '58' => 2,
  '69' => 1,
  '70' => 1,
  '611' => 5,
  '915' => 1,
  'X1' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X2' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X3' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X4' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X5' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X6' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X7' => { 'count' => 2, 'color' => 'yellow', 'code' => '' },
  'X8' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X9' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
}.freeze

HEXES = {
  white: {
    %w[
      B8 C3 C9 D6 D12 E7 F2 F6 G3 G5 G7 G9 H2 H10 I3 I5 J2 J10 K3 L6 M5
    ] => '',
    %w[
      B6 B10 C5 E3 L4 M7
    ] => 'city=revenue:0',
    ['H6'] => 'city=revenue:0;label=DC',
    %w[
      D8 F10
    ] => 'city=revenue:0;upgrade=cost:40,terrain:water',
    %w[
      B4 H4 M3
    ] => 'city=revenue:0;upgrade=cost:80,terrain:mountain',
    ['K5'] => 'town=revenue:0',
    %w[
      C11 D2 E11
    ] => 'town=revenue:0;town=revenue:0',
    %w[
      C7 E9
    ] => 'town=revenue:0;upgrade=cost:40,terrain:water',
    %w[
      I7 J6 K7 L8
    ] => 'upgrade=cost:40,terrain:water',
    %w[
      D4 E5 F4 J4 L2
    ] => 'upgrade=cost:80,terrain:mountain',
  },
  yellow: {
    ['D10'] => 'city=revenue:30;city=revenue:30;path=a:0,b:_0;path=a:3,b:_1;label=OO',
    ['F8'] => 'city=revenue:30;city=revenue:30;path=a:1,b:_0;path=a:4,b:_1;label=OO;upgrade=cost:40,terrain:water',
  },
  gray: {
    ['A5'] => 'path=a:1,b:5',
    ['A7'] => 'path=a:1,b:5;path=a:0,b:1',
    ['G11'] => 'path=a:2,b:3',
    ['N6'] => 'path=a:3,b:4',
    ['A11'] => 'town=revenue:30;path=a:0,b:_0;path=a:_0,b:1',
    ['I9'] => 'town=revenue:30;path=a:3,b:_0;path=a:_0,b:5',
  },
  red: {
    ['C1'] => 'city=revenue:yellow_40|green_50|brown_60|gray_80;path=a:5,b:_0;border=edge:4,type:impassable',
    ['N8'] => 'offboard=revenue:yellow_30|green_40|brown_50|gray_60;path=a:2,b:_0',
    ['B2'] => 'offboard=revenue:yellow_40|green_50|brown_60|gray_80;path=a:0,b:_0;border=edge:1,type:impassable',
    ['N2'] => 'offboard=revenue:yellow_40|green_50|brown_60|gray_80;path=a:3,b:_0;path=a:4,b:_0;border=edge:2,type:impassable',
    ['M1'] => 'offboard=revenue:yellow_40|green_50|brown_60|gray_80;path=a:4,b:_0;border=edge:5,type:impassable',
    ['B12'] => 'offboard=revenue:yellow_40|green_60|brown_80|gray_100;path=a:0,b:_0;path=a:1,b:_0',
    ['G1'] => 'offboard=revenue:yellow_40|green_60|brown_80|gray_100;path=a:4,b:_0;path=a:5,b:_0',
  },
}.freeze
