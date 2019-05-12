#!/usr/bin/env node

"use strict";

const optionDefinitions = [
  { name: 'report', type: String, defaultValue: 'print' },
  { name: 'version', type: Boolean }
]


const Mark = require("./lib.js");
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);

if (options.version) {
  console.log("1.0.0")
} else {

  switch (options.report) {
    case 'json':
      Mark.parseAllJson();
      break;

    case 'print':
      Mark.parseAll();
      break;

    default:
      console.log('--report needs to be either `json` or not be present.')
  }
}