# frozen_string_literal: true
# Exported by 18xxtools — edit freely
# EDITOR_GRID rows=7 cols=12

LAYOUT = :flat

LOCATION_NAMES = {
  'A10' => 'Sukumo',
  'B3' => 'Yawatahama',
  'B7' => 'Uwajima',
  'B11' => 'Nakamura',
  'C4' => 'Ohzu',
  'C10' => 'Kubokawa',
  'E2' => 'Matsuyama',
  'F1' => 'Imabari',
  'F3' => 'Saijou',
  'F9' => 'Kouchi',
  'G4' => 'Niihama',
  'G10' => 'Nangoku',
  'G12' => 'Nahari',
  'G14' => 'Muroto',
  'H7' => 'Ikeda',
  'I2' => 'Marugame',
  'I4' => 'Kotohira',
  'I12' => 'Muki',
  'J1' => 'Sakaide & Okayama',
  'J5' => 'Ritsurin Kouen',
  'J9' => 'Komatsujima',
  'J11' => 'Anan',
  'K4' => 'Takamatsu',
  'K8' => 'Tokushima',
  'L7' => 'Naruto & Awaji',
}.freeze

TILES = {
  '3' => 2,
  '5' => 2,
  '6' => 2,
  '7' => 2,
  '8' => 5,
  '9' => 5,
  '12' => 1,
  '13' => 1,
  '14' => 1,
  '15' => 3,
  '16' => 1,
  '19' => 1,
  '20' => 1,
  '23' => 2,
  '24' => 2,
  '25' => 1,
  '26' => 1,
  '27' => 1,
  '28' => 1,
  '29' => 1,
  '39' => 1,
  '40' => 1,
  '41' => 1,
  '42' => 1,
  '45' => 1,
  '46' => 1,
  '47' => 1,
  '57' => 2,
  '58' => 3,
  '205' => 1,
  '206' => 1,
  '437' => 1,
  '438' => 1,
  '439' => 1,
  '440' => 1,
  '448' => 4,
  '465' => 1,
  '466' => 1,
  '492' => 1,
  '611' => 2,
  'Beg23' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'Beg24' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'Beg6' => { 'count' => 2, 'color' => 'yellow', 'code' => '' },
  'Beg7' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'Beg8' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
  'Beg9' => { 'count' => 1, 'color' => 'yellow', 'code' => '' },
}.freeze

HEXES = {
  white: {
    %w[
      B5 C8 D3 D9 E8 H3 I8 I10 J3
    ] => '',
    %w[
      A10 C10 E2 F3 G4 G12 H7 I2 J11 K8
    ] => 'city=revenue:0',
    ['I4'] => 'city=revenue:0;label=H;upgrade=cost:80',
    ['J5'] => 'town=revenue:0',
    %w[
      B11 G10 I12 J9
    ] => 'town=revenue:0;icon=image:port',
    %w[
      A8 B9 C6 D5 D7 E4 E6 F5 F7 G6 G8 H9 H11 H13
    ] => 'upgrade=cost:80,terrain:mountain',
    %w[
      H5 I6
    ] => 'upgrade=cost:80,terrain:mountain|water',
    ['K6'] => 'upgrade=cost:80,terrain:water',
  },
  yellow: {
    ['C4'] => 'city=revenue:20;path=a:2,b:_0',
    ['K4'] => 'city=revenue:30;path=a:0,b:_0;path=a:1,b:_0;path=a:2,b:_0;label=T',
  },
  green: {
    ['F9'] => 'city=revenue:30,slots:2;path=a:2,b:_0;path=a:3,b:_0;path=a:4,b:_0;path=a:5,b:_0;label=K;upgrade=cost:80',
  },
  gray: {
    ['B7'] => 'city=revenue:40,slots:2;path=a:1,b:_0;path=a:3,b:_0;path=a:5,b:_0',
    ['J7'] => 'path=a:1,b:5',
    ['B3'] => 'town=revenue:20;path=a:0,b:_0;path=a:_0,b:5',
    ['G14'] => 'town=revenue:20;path=a:3,b:_0;path=a:_0,b:4',
  },
  red: {
    ['J1'] => 'offboard=revenue:yellow_20|brown_40|gray_80;path=a:0,b:_0;path=a:1,b:_0',
    ['L7'] => 'offboard=revenue:yellow_20|brown_40|gray_80;path=a:1,b:_0;path=a:2,b:_0',
    ['F1'] => 'offboard=revenue:yellow_30|brown_60|gray_100;path=a:0,b:_0;path=a:1,b:_0',
  },
}.freeze
