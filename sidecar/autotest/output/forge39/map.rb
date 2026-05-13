# frozen_string_literal: true
# Exported by 18xxtools — edit freely
# EDITOR_GRID rows=8 cols=16

module Engine
  module Game
    module GGGame
      module Map
LAYOUT = :pointy
AXES = { x: :number, y: :letter }.freeze

LOCATION_NAMES = {
  'A2' => 'Malmö',
  'A6' => 'Halmstad',
  'A10' => 'Göteborg',
  'A16' => 'Oslo',
  'B5' => 'Hässleholm',
  'B11' => 'Alingsås',
  'B31' => 'Narvik',
  'C2' => 'Ystad',
  'C8' => 'Jönköping',
  'C12' => 'Skövde',
  'C16' => 'Karlstad',
  'C24' => 'Östersund',
  'D5' => 'Kalmar',
  'D11' => 'Katrineholm',
  'D15' => 'Köping',
  'D19' => 'Bergslagen',
  'D21' => 'Sveg',
  'D29' => 'Malmfälten',
  'E8' => 'Norrköping',
  'E12' => 'Västerås',
  'E20' => 'Ånge',
  'F13' => 'Uppsala',
  'F19' => 'Sundsvall',
  'F23' => 'Umeå',
  'G10' => 'Stockholm',
  'G26' => 'Luleå',
  'H9' => 'Stockholms hamn',
}.freeze

TILES = {
  '5' => 4,
  '6' => 4,
  '7' => 'unlimited',
  '8' => 'unlimited',
  '9' => 'unlimited',
  '14' => 4,
  '15' => 4,
  '16' => 2,
  '17' => 1,
  '18' => 1,
  '19' => 2,
  '20' => 2,
  '21' => 1,
  '22' => 1,
  '23' => 3,
  '24' => 3,
  '25' => 2,
  '26' => 1,
  '27' => 1,
  '28' => 1,
  '29' => 1,
  '30' => 1,
  '31' => 1,
  '39' => 1,
  '40' => 1,
  '41' => 2,
  '42' => 2,
  '43' => 2,
  '44' => 1,
  '45' => 2,
  '46' => 2,
  '47' => 2,
  '57' => 5,
  '63' => 2,
  '70' => 1,
  '611' => 2,
  '619' => 3,
  'X1' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X2' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X3' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X4' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X5' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'X6' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
}.freeze

HEXES = {
  white: {
    %w[
      A8 A14 B3 B7 B9 B15 B17 B29 C4 C18 C20 C22 C26 C28 D17 D23 D25 D27 D31 E10 E26
      E28 E30 F15 F17 F21 F27 F29 G14 G28
    ] => '',
    ['C10'] => 'border=edge:0,type:impassable;border=edge:5,type:impassable',
    ['D9'] => 'border=edge:2,type:impassable;border=edge:3,type:impassable',
    %w[
      C24 D21
    ] => 'city=revenue:0',
    ['D11'] => 'city=revenue:0;border=edge:2,type:impassable',
    ['C12'] => 'city=revenue:0;border=edge:2,type:mountain,cost:75;icon=image:18_sj/G-S,sticky:1;icon=image:18_sj/GKB,sticky:1',
    ['B11'] => 'city=revenue:0;border=edge:5,type:mountain,cost:75;icon=image:18_sj/G-S,sticky:1',
    ['E12'] => 'city=revenue:0;icon=image:18_sj/G-S,sticky:1',
    ['C16'] => 'city=revenue:0;icon=image:18_sj/GKB,sticky:1',
    %w[
      E20 F13
    ] => 'city=revenue:0;icon=image:18_sj/L-S,sticky:1',
    ['B5'] => 'city=revenue:0;icon=image:18_sj/M-S,sticky:1',
    ['E8'] => 'city=revenue:0;icon=image:18_sj/M-S,sticky:1;icon=image:18_sj/GKB,sticky:1',
    ['D29'] => 'city=revenue:0;upgrade=cost:75,terrain:mountain;icon=image:18_sj/M,sticky:1',
    ['D13'] => 'icon=image:18_sj/G-S',
    %w[
      E14 E16 E18 E24 F25 G12
    ] => 'icon=image:18_sj/L-S',
    %w[
      A4 C6 D7
    ] => 'icon=image:18_sj/M-S',
    ['C30'] => 'upgrade=cost:150,terrain:mountain',
    ['F9'] => 'upgrade=cost:150,terrain:mountain;icon=image:18_sj/M-S',
    %w[
      A12 B19 B21 B23 B25 B27
    ] => 'upgrade=cost:75,terrain:mountain',
    ['F11'] => 'upgrade=cost:75,terrain:mountain;icon=image:18_sj/G-S',
    ['E22'] => 'upgrade=cost:75,terrain:mountain;icon=image:18_sj/L-S',
  },
  yellow: {
    ['G10'] => 'city=revenue:20;city=revenue:20;city=revenue:20;city=revenue:20;path=a:1,b:_0;path=a:2,b:_1;path=a:3,b:_2;path=a:4,b:_3;label=A',
    ['C8'] => 'city=revenue:20;path=a:1,b:_0;path=a:2,b:_0;border=edge:5,type:impassable;icon=image:18_sj/GKB,sticky:1',
    ['D15'] => 'city=revenue:20;path=a:1,b:_0;path=a:3,b:_0;path=a:5,b:_0',
    ['C2'] => 'city=revenue:20;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;label=Y;icon=image:port,sticky:1',
    ['D19'] => 'city=revenue:20;path=a:5,b:_0;path=a:0,b:_0;icon=image:18_sj/B,sticky:1',
  },
  gray: {
    ['G26'] => 'city=revenue:20,slots:2;path=a:2,b:_0;path=a:3,b:_0;icon=image:port;icon=image:18_sj/m_lower_case,sticky:1',
    ['F19'] => 'city=revenue:20;path=a:2,b:_0;path=a:3,b:_0;icon=image:port',
    ['F23'] => 'city=revenue:20;path=a:2,b:_0;path=a:3,b:_0;icon=image:port;icon=image:port',
    ['D5'] => 'city=revenue:20;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;icon=image:port',
    ['A6'] => 'city=revenue:20;path=a:5,b:_0;path=a:0,b:_0;icon=image:port;icon=image:port',
    ['A16'] => 'city=revenue:yellow_50|green_40|brown_20;path=a:1,b:_0;path=a:5,b:_0;path=a:0,b:_0',
  },
  red: {
    ['A2'] => 'city=revenue:yellow_20|green_40|brown_50;path=a:4,b:_0,terminal:1;path=a:5,b:_0,terminal:1;icon=image:18_sj/V,sticky:1',
    ['A10'] => 'city=revenue:yellow_20|green_40|brown_70;path=a:4,b:_0,terminal:1;path=a:5,b:_0,terminal:1;path=a:0,b:_0,terminal:1;icon=image:18_sj/V,sticky:1;icon=image:18_sj/b_lower_case,sticky:1',
    ['H9'] => 'offboard=revenue:green_30|brown_40;path=a:3,b:_0;icon=image:18_sj/O,sticky:1;icon=image:18_sj/b_lower_case,sticky:1;icon=image:18_sj/S,sticky:1',
    ['B31'] => 'offboard=revenue:yellow_20|green_30|brown_70;path=a:0,b:_0;icon=image:18_sj/N,sticky:1;icon=image:18_sj/m_lower_case,sticky:1',
  },
  blue: {
    %w[
      B13 C14
    ] => '',
    ['G8'] => 'path=a:3,b:4',
    ['B1'] => 'path=a:4,b:5',
  },
}.freeze

      end
    end
  end
end
