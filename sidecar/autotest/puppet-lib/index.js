// erin/puppet-lib/index.js — Public entry point for the Puppeteer step library.
//
// Re-exports every step module + the runner assembler. Two access patterns:
//
//   1. Flat — destructure individual functions:
//        const { selectMap, addTrain, runPermutation } = require('./puppet-lib');
//        await selectMap(page, { gameName: '1889' });
//
//   2. Namespaced — keep the module grouping:
//        const lib = require('./puppet-lib');
//        await lib.map.selectMap(page, { gameName: '1889' });
//        await lib.companies.buildMajor(page, { sym: 'AA', ... });
//        const { entitiesRb, gameRb } = await lib.runPermutation(config);

'use strict';

const map        = require('./map');
const companies  = require('./companies');
const trains     = require('./trains');
const mechanics  = require('./mechanics');
const market     = require('./market');
const rounds     = require('./rounds');
const runner     = require('./runner');

module.exports = {
  // Namespaced access
  map, companies, trains, mechanics, market, rounds, runner,

  // Flat re-exports — every function from every step module
  ...map,
  ...companies,
  ...trains,
  ...mechanics,
  ...market,
  ...rounds,

  // Runner assembler
  runPermutation:        runner.runPermutation,
  closeSharedBrowser:    runner.closeSharedBrowser,
};
