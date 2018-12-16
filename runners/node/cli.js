#!/usr/bin/env node

"use strict";

const optionDefinitions = [
  { name: 'report', type: String, defaultValue: 'print' }
]


const Mark = require("./lib.js");
const commandLineArgs = require('command-line-args');
const options = commandLineArgs(optionDefinitions);


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

// if (process.argv.length >= 4) {
//   // let parserFileName = process.argv[2];
//   // let sourceFileName = process.argv[3];
//   // run(parserFileName, sourceFileName, process.argv.slice(3));

// } else {
//   console.log("Run as 'elm-markup Main.elm Note.emu'");
// }
