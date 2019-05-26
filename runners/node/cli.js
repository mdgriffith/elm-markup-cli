#!/usr/bin/env node

"use strict";

var path = require('path')
const process = require('process');
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const Mark = require("./lib.js");
const optionDefinitions = [
  { name: 'report', type: String, defaultValue: 'console' },
  { name: 'version', type: Boolean }
]

function log_help() {
  const usage = commandLineUsage([
    {
      header: 'Elm Markup',
      content: 'Find and parse *.emu files using any exposed `Mark.Document` you have in your Elm project.'
    },
    {
      header: 'Options',
      optionList: optionDefinitions
    },
    {
      content: 'Read more: {underline https://github.com/mdgriffith/elm-markup-cli}'
    }
  ])
  console.log(usage)
}


var options = null
try {
  options = commandLineArgs(optionDefinitions);
}
catch (err) {
  log_help()
  process.exit()
}

if (options.help) {
  log_help()
}
else if (options.version) {
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

