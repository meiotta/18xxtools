# frozen_string_literal: true
# Exported by 18xxtools — edit freely
# EDITOR_GRID rows=11 cols=17

LAYOUT = :flat

LOCATION_NAMES = {
  'A14' => 'Port Huron',
  'A20' => 'Detroit - Windsor',
  'B13' => 'Sarnia',
  'B19' => 'Chatham',
  'C14' => 'Maudaumin',
  'D17' => 'Glencoe',
  'F9' => 'Goderich',
  'F15' => 'London',
  'F17' => 'St. Thomas',
  'H5' => 'Lake Huron',
  'H15' => 'Woodstock',
  'I12' => 'Kitchener',
  'I14' => 'Drumbo',
  'J11' => 'Guelph',
  'J13' => 'Galt',
  'J15' => 'Brantford',
  'K2' => 'Georgian Bay',
  'K8' => 'Orangeville',
  'L13' => 'Burlington',
  'L15' => 'Hamilton',
  'M4' => 'Barrie',
  'N11' => 'Toronto',
  'N17' => 'Welland',
  'O2' => 'Canadian West',
  'O16' => 'Niagara Falls',
  'O18' => 'Fort Erie',
  'P9' => 'Oshawa',
  'P17' => 'Buffalo',
  'Q8' => 'Lower Canada',
}.freeze

TILES = {
  '1' => 1,
  '2' => 1,
  '3' => 3,
  '4' => 3,
  '5' => 2,
  '6' => 2,
  '7' => 7,
  '8' => 13,
  '9' => 13,
  '14' => 4,
  '15' => 4,
  '16' => 1,
  '17' => 1,
  '18' => 1,
  '19' => 1,
  '20' => 1,
  '23' => 4,
  '24' => 4,
  '25' => 1,
  '26' => 1,
  '27' => 1,
  '28' => 1,
  '29' => 1,
  '39' => 1,
  '40' => 1,
  '41' => 3,
  '42' => 3,
  '43' => 2,
  '44' => 1,
  '45' => 2,
  '46' => 2,
  '47' => 2,
  '55' => 1,
  '56' => 1,
  '57' => 4,
  '58' => 3,
  '59' => 2,
  '63' => 4,
  '64' => 1,
  '65' => 1,
  '66' => 1,
  '67' => 1,
  '68' => 1,
  '69' => 1,
  '70' => 1,
  '120' => 1,
  '121' => 2,
  '122' => 1,
  '123' => 1,
  '124' => 1,
  '125' => { 'count' => 4, 'color' => 'yellow', 'code' => '' },
  '126' => 1,
  '127' => 1,
}.freeze

HEXES = {
  white: {
    %w[
      B15 B17 B21 C16 C18 C20 D13 D15 E12 E14 E16 F11 G8 G10 G14 G16 G18 H9 H13 I6 I10
      I16 I18 J7 K4 K6 K18 L3 L5 L7 L11 L17 M2 M8 M12 N7 O4 O6 O8 O10 P3 P5
    ] => '',
    %w[
      B19 D17 G12 H15 I8 J11 J13 J15 K8 L13 O16 P9
    ] => 'city=revenue:0',
    %w[
      C14 F17 O18
    ] => 'city=revenue:0;icon=image:port,sticky:1',
    ['N3'] => 'city=revenue:0;upgrade=cost:40,terrain:water',
    %w[
      H11 J9 K16 L9 M6 N9
    ] => 'town=revenue:0',
    %w[
      D19 H17 J5 M18
    ] => 'town=revenue:0;icon=image:port,sticky:1',
    %w[
      F13 I14 M10
    ] => 'town=revenue:0;town=revenue:0',
    %w[
      E18 H7 J17
    ] => 'town=revenue:0;town=revenue:0;icon=image:port,sticky:1',
    %w[
      K10 K12 K14 M16 N15
    ] => 'upgrade=cost:40,terrain:mountain',
    %w[
      N19 P7
    ] => 'upgrade=cost:40,terrain:water',
  },
  yellow: {
    %w[
      I12 N17
    ] => 'city=revenue:0;city=revenue:0;label=OO',
    ['L15'] => 'city=revenue:0;city=revenue:0;label=OO;upgrade=cost:40,terrain:mountain',
    ['N11'] => 'city=revenue:30;city=revenue:30;path=a:1,b:_0;path=a:4,b:_1;label=T',
    %w[
      F15 M4
    ] => 'city=revenue:30;path=a:0,b:_0;path=a:4,b:_0;label=B-L',
  },
  gray: {
    ['F9'] => 'town=revenue:yellow_30|brown_50;path=a:0,b:_0;path=a:4,b:_0;path=a:5,b:_0;icon=image:port,sticky:1',
  },
  red: {
    ['A14'] => 'border=edge:4,type:impassable;icon=image:1856/tunnel;icon=image:1856/tunnel',
    ['N1'] => 'offboard=revenue:yellow_20|brown_30;path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1;border=edge:5,type:impassable',
    ['O2'] => 'offboard=revenue:yellow_20|brown_30;path=a:0,b:_0,terminal:1;path=a:1,b:_0,terminal:1;path=a:5,b:_0,terminal:1;border=edge:2,type:impassable',
    ['K2'] => 'offboard=revenue:yellow_20|brown_30;path=a:0,b:_0,terminal:1;path=a:5,b:_0,terminal:1;icon=image:port,sticky:1',
    ['Q8'] => 'offboard=revenue:yellow_20|brown_30;path=a:1,b:_0,terminal:1;path=a:2,b:_0,terminal:1;border=edge:0,type:impassable',
    ['Q10'] => 'offboard=revenue:yellow_20|brown_30;path=a:2,b:_0,terminal:1;border=edge:3,type:impassable',
    ['P17'] => 'offboard=revenue:yellow_30|brown_40;path=a:1,b:_0,terminal:1;path=a:2,b:_0,terminal:1;border=edge:0,type:impassable',
    ['P19'] => 'offboard=revenue:yellow_30|brown_40;path=a:2,b:_0,terminal:1;border=edge:3,type:impassable;icon=image:1856/bridge;icon=image:1856/bridge',
    ['H5'] => 'offboard=revenue:yellow_30|brown_50;path=a:0,b:_0,terminal:1;path=a:5,b:_0,terminal:1;icon=image:port,sticky:1',
    ['B13'] => 'offboard=revenue:yellow_30|brown_50;path=a:0,b:_0;path=a:5,b:_0,terminal:1;border=edge:1,type:impassable',
    ['A20'] => 'offboard=revenue:yellow_30|brown_50;path=a:4,b:_0,terminal:1;path=a:5,b:_0,terminal:1',
  },
  blue: {
    ['N5'] => '',
  },
}.freeze
