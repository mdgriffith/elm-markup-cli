#!/usr/bin/env node

"use strict";

var path = require('path')

const optionDefinitions = [
  { name: 'report', type: String, defaultValue: 'console' },
  { name: 'version', type: Boolean }
]


const Mark = require("./lib.js");
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);

if (options.version) {
  console.log(require(path.join(__dirname, '..', '..', 'package.json')).version);
} else {
  switch (options.report) {
    case 'json':
      Mark.parseAllJson();
      break;

    case 'console':
      Mark.parseAll();
      break;

    default:
      console.log('--report needs to be either `json` or not be present.')
  }
}