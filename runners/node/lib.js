"use strict";

let majorVersion = 4;
let minorVersion = 2;

let vm = require("vm");
let fs = require("fs");
let path = require("path");
let child_process = require("child_process");
let which = require("which");
let findUp = require("find-up");
let tmp = require("tmp");
let rimraf = require("rimraf");
let os = require("os");
const chalk = require('chalk');
let firstline = require('firstline');
let spawn = require('cross-spawn');
let _ = require('lodash');
let finder = require('./finder.js');
let Generate = require('./Generate.js');
let Find = require('./lib/Find.js');
let glob = require('glob');

function resolvePath(components) {
  if (components.length == 0) {
    throw { code: "ENOENT", message: "Empty path given" };
  }

  let result = path.resolve(components[0]);
  for (var i = 1; i < components.length; i++) {
    let childPath = path.resolve(result, components[i]);
    if (path.relative(result, childPath).startsWith("..")) {
      throw {
        code: "EACCES",
        message: components[i] + " is not a proper relative path"
      };
    }
    result = childPath;
  }
  return result;
}

function listEntities(request, responsePort, statsPredicate) {
  try {
    let directoryPath = resolvePath(request.value);
    let results = fs.readdirSync(directoryPath).filter(function (entity) {
      return statsPredicate(fs.statSync(path.resolve(directoryPath, entity)));
    });
    responsePort.send(results);
  } catch (error) {
    responsePort.send({ code: error.code, message: error.message });
  }
}

function colorize(colorString, text) {
  switch (colorString) {
    case "yellow":
      return chalk.yellow(text);

    case "red":
      return chalk.red(text);

    case "blue":
      return chalk.blue(text);

    case "green":
      return chalk.green(text);

    case "underline":
      return chalk.underline(text);

    case "cyan":
      return chalk.cyan(text);

    default:
      return text;
  }
}

function logError(context, error) {

  var relativePath = path.relative(process.cwd(), context.markupFile);

  let parserText = colorize("yellow", spaceFront("with " + context.parserName));
  let fileText = colorize("cyan", dashFill("-- " + error.name.toUpperCase(), " ./" + relativePath))

  let errorText = fileText + "\n" + parserText;
  let errorLen = error.text.length;

  for (var i = 0; i < errorLen; i++) {
    errorText = errorText + colorize(error.text[i].color, error.text[i].text);
  }
  return errorText;
}

function spaceFront(val) {
  let remaining = 80 - val.length;
  return " ".repeat(remaining) + val;
}

function dashFill(start, end) {
  let remaining = 80 - (start.length + 1 + end.length)
  return start + " " + "-".repeat(remaining) + end;
}


var readElmiPath = require('elmi-to-json').paths['elmi-to-json'];


function findDocumentsInProject(elmPackageJsonPath) {
  return new Promise(function (resolve, reject) {
    function finish() {

      var proc = spawn(readElmiPath, [], {
        cwd: elmPackageJsonPath,
        env: process.env,
      });
      var jsonStr = '';
      var stderrStr = '';


      proc.stdout.on('data', function (data) {
        jsonStr += data;
      });

      proc.stderr.on('data', function (data) {
        stderrStr += data;
      });

      proc.on('close', function (code) {
        if (stderrStr !== '') {
          reject(stderrStr);
        } else if (code !== 0) {
          reject('Finding test interfaces failed, exiting with code ' + code);
        }
        var modules;

        try {
          modules = JSON.parse(jsonStr);
        } catch (err) {
          reject('Received invalid JSON from test interface search: ' + err);
        }

        var filteredModules = _.flatMap(modules, function (mod) {
          var eligible = _.flatMap(_.toPairs(mod.interface.types), function (
            pair
          ) {
            var name = pair[0];
            var annotation = pair[1].annotation;
            if (
              annotation.moduleName &&
              annotation.moduleName.package === 'mdgriffith/elm-markup' &&
              annotation.moduleName.module === 'Mark' &&
              annotation.name === 'Document'
            ) {
              return name;
            } else {
              return [];
            }
          });

          // Must have at least 1 value of type Test. Otherwise ignore this module.
          if (eligible.length > 0) {
            return [{ name: mod.moduleName, tests: eligible }];
          } else {
            return [];
          }
        });

        return resolve(filteredModules);
      });
    }

    return finish();
  });
}


function findDocumentsOld(
  elmPackageJsonPath /*: string*/,
  testFilePaths /*: Array<string>*/,
  sourceDirs /*: Array<string>*/,
) /*:Promise<Array<Object>>*/ {
  return new Promise(function (resolve, reject) {
    function finish() {

      var proc = spawn(readElmiPath, [], {
        cwd: elmPackageJsonPath,
        env: process.env,
      });
      var jsonStr = '';
      var stderrStr = '';


      proc.stdout.on('data', function (data) {
        jsonStr += data;
      });

      proc.stderr.on('data', function (data) {
        stderrStr += data;
      });

      proc.on('close', function (code) {
        if (stderrStr !== '') {
          reject(stderrStr);
        } else if (code !== 0) {
          reject('Finding test interfaces failed, exiting with code ' + code);
        }
        var modules;

        try {
          modules = JSON.parse(jsonStr);
        } catch (err) {
          reject('Received invalid JSON from test interface search: ' + err);
        }

        var filteredModules = _.flatMap(modules, function (mod) {
          var eligible = _.flatMap(_.toPairs(mod.interface.types), function (
            pair
          ) {
            var name = pair[0];
            var annotation = pair[1].annotation;
            if (
              annotation.moduleName &&
              annotation.moduleName.package === 'mdgriffith/elm-markup' &&
              annotation.moduleName.module === 'Mark' &&
              annotation.name === 'Document'
            ) {
              return name;
            } else {
              return [];
            }
          });

          // Must have at least 1 value of type Test. Otherwise ignore this module.
          if (eligible.length > 0) {
            return [{ name: mod.moduleName, tests: eligible }];
          } else {
            return [];
          }
        });

        return verifyModules(testFilePaths)
          .then(function () {
            return Promise.all(
              _.map(
                _.flatMap(
                  filteredModules,
                  toPathsAndModules(testFilePaths, sourceDirs)
                ),
                filterExposing
              )
            )
              .then(resolve)
              .catch(reject);
          })
          .catch(reject);
      });
    }

    return finish();
  });
}


function moduleFromTestName(testName) {
  return testName.split('.').reverse();
}

function moduleFromFilePath(filePathArg) {
  var parsed = path.parse(path.normalize(filePathArg));
  var basename = path.basename(parsed.base, '.elm');

  // Turn these into module name checks to be performed, in order.
  // e.g. 'tests/All/Passing.elm' ===> ['Passing', 'All', 'tests']
  // This way, if we're given 'All.Passing' as a module name, we can also
  // flip it into ['Passing', 'All'], and see if the first N elements line up.
  return _.compact(parsed.dir.split(path.sep).concat([basename])).reverse();
}

// Check for modules where the name doesn't match the filename.
// elm-make won't get a chance to detect this; they'll be filtered out first.
function verifyModules(filePaths) {
  return Promise.all(
    _.map(filePaths, function (filePath) {
      return firstline(filePath).then(function (line) {
        var matches = line.match(/^(?:(?:port|effect)\s+)?module\s+(\S+)\s*/);

        if (matches) {
          var moduleName = matches[1];
          var testModulePaths = moduleFromTestName(moduleName);
          var modulePath = moduleFromFilePath(filePath);

          // A module path matches if it lines up completely with a known one.
          if (
            !testModulePaths.every(function (testModulePath, index) {
              return testModulePath === modulePath[index];
            })
          ) {
            return Promise.reject(
              filePath +
              ' has a module declaration of "' +
              moduleName +
              '" - which does not match its filename!'
            );
          }
        } else {
          return Promise.reject(
            filePath +
            ' has an invalid module declaration. Check the first line of the file and make sure it has a valid module declaration there!'
          );
        }
      });
    })
  );
}


function toPathsAndModules(
  testFilePaths /*:Array<string>*/,
  testSourceDirs /*:Array<string>*/
) {
  var paths = testFilePaths.map(function (filePath) {
    return { filePath: filePath, module: moduleFromFilePath(filePath) };
  });

  // Each module must correspond to a file path, by way of a source directory.
  // This filters out stale modules left over from previous builds, for example
  // what happened in https://github.com/rtfeldman/node-test-runner/issues/122
  return function (testModule) {
    var moduleAsFilename = testModule.name.replace(/[\.]/g, path.sep) + '.elm';

    // for early return purposes, use old-school `for` loops
    for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      var currentPath = paths[pathIndex];

      for (
        var testSourceDirIndex = 0;
        testSourceDirIndex < testSourceDirs.length;
        testSourceDirIndex++
      ) {
        var testSourceDir = testSourceDirs[testSourceDirIndex];

        if (
          currentPath.filePath === path.join(testSourceDir, moduleAsFilename)
        ) {
          return [
            {
              name: testModule.name,
              tests: testModule.tests,
              path: currentPath.filePath,
            },
          ];
        }
      }
    }

    return [];
  };
}


function filterExposing(pathAndModule) {
  return new Promise(function (resolve, reject) {
    return finder
      .readExposing(pathAndModule.path)
      .then(function (exposedValues) {
        var newTests =
          exposedValues.length === 1 && exposedValues[0] === '..'
            ? // null exposedValues means "the module was exposing (..), so keep everything"
            pathAndModule.tests
            : // Only keep the tests that were exposed.
            _.intersection(exposedValues, pathAndModule.tests);

        if (newTests.length < pathAndModule.tests.length) {
          return reject(
            '\n`' +
            pathAndModule.name +
            '` is a module with top-level Test values which it does not expose:\n\n' +
            _.difference(pathAndModule.tests, newTests)
              .map(function (test) {
                return test + ' : Test';
              })
              .join('\n') +
            '\n\nThese tests will not get run. Please either expose them or move them out of the top level.'
          );
        } else {
          return resolve({ name: pathAndModule.name, tests: newTests });
        }
      })
      .catch(reject);
  });
}

function parserVM(absolutePath, moduleName, asJson) {
  // Set up browser-like context in which to run compiled Elm code
  global.XMLHttpRequest = require("xhr2");
  global.setTimeout = require("timers").setTimeout;

  // Read compiled JS from file
  var compiledJs = null;
  try {
    compiledJs = fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }

  // Run Elm code to create the 'Elm' object
  vm.runInThisContext(compiledJs);

  let script = global["Elm"].Mark.Generated[moduleName].init();
  let errorPorts = script.ports.error;
  var output = [];
  script.output = output;

  errorPorts.subscribe(function (parsed) {
    if (parsed.errors.length == 0) {
      console.log('');
      console.log("    " + chalk.green("✓") + " Successfully parsed markup!");
      console.log('');
    } else {
      if (asJson) {
        script.output.push(parsed);

      } else {
        let errorLen = parsed.errors.length;

        for (var i = 0; i < errorLen; i++) {
          const err = logError(parsed, parsed.errors[i]);
          script.output.push(err);
          // console.log(err);
        }

      }
    }
  });

  return script;

}

function checkExactly(base, elmFiles, markupFiles, asJson) {

  // Find path to corresponding elm.json
  let elmJsonPath = findUp.sync("elm.json", { cwd: base });
  if (elmJsonPath == null) {
    console.log(
      "Could not find elm.json in parent directory of " + base
    );
    process.exit(1);
  }
  let elmJsonDirectory = path.dirname(elmJsonPath);

  // Find Elm executable
  let cwd = process.cwd();
  // Switch to elm.json directory to find Elm executable
  process.chdir(elmJsonDirectory);
  let elmExecutable = which.sync("elm");
  // Switch back to original working directory
  process.chdir(cwd);
  if (elmExecutable == null) {
    console.log(
      "Could not find Elm executable in " + elmJsonDirectory + " or PATH"
    );
    process.exit(1);
  }

  // Create temporary JS file for Elm compiler output
  let outputJsFile = null;
  try {
    outputJsFile = tmp.fileSync({ postfix: ".js" }).name;
  } catch (error) {
    console.log("Could not create temporary JavaScript file");
  }

  // Try to compile Elm file
  try {
    child_process.execFileSync(
      elmExecutable,
      ["make", "--optimize", "--output=" + outputJsFile].concat(elmFiles),
      { cwd: elmJsonDirectory, encoding: "utf8" }
    );
  } catch (error) {
    process.exit(1);
  }
  findDocumentsInProject(
    elmJsonDirectory//, [absolutePath], [directory]
  ).then(function (documents) {


    const returnValues = Generate.generateElmJson(
      elmJsonDirectory,
      elmExecutable
    );

    const generatedCodeDir = returnValues[0];
    const generatedSrc = returnValues[1];
    const sourceDirs = returnValues[2];

    const generated = Generate.generateMainModule(
      documents,
      generatedSrc
    );

    const compiledRunnerFile = path.join(generatedCodeDir, "runParser.js")

    // Try to compile Elm file
    try {
      child_process.execFileSync(
        elmExecutable,
        ["make", "--optimize", "--output=" + compiledRunnerFile, generated.file],
        { cwd: generatedCodeDir, encoding: "utf8" }
      );
    } catch (error) {
      process.exit(1);
    }

    var elmParser = parserVM(compiledRunnerFile, generated.name, asJson);

    const modulesLength = documents.length;
    for (var i = 0; i < modulesLength; i++) {

      const documentsLength = documents[i].tests.length;
      for (var d = 0; d < documentsLength; d++) {

        const markupFileCount = markupFiles.length;
        for (var m = 0; m < markupFileCount; m++) {

          var source = null;
          try {
            source = fs.readFileSync(markupFiles[m], "utf8");
          } catch (error) {
            console.log(error.message);
            process.exit(1);
          }

          elmParser.ports.parse.send({
            parserName: documents[i].name + "." + documents[i].tests[d],
            markupFile: markupFiles[m],
            source: source
          });
        }
      }
    }

    setTimeout(function () {
      if (asJson) {
        console.log(JSON.stringify(elmParser.output));
      } else {
        console.log(elmParser.output.join("\n"));
      }
    }, 0)

  })

}
function parseAll() {
  // find all elm files in source directories
  // find all .emu files.
  let cwd = process.cwd();
  const sources = Find.markupFiles(cwd);
  const elmFiles = Find.elmFiles(cwd);
  const relativeElmFiles = _.map(elmFiles, function (file) { return path.relative(cwd, file); })
  checkExactly(cwd, relativeElmFiles, sources, false);
}
function parseAllJson() {
  // find all elm files in source directories
  // find all .emu files.
  let cwd = process.cwd();
  const sources = Find.markupFiles(cwd);
  const elmFiles = Find.elmFiles(cwd);
  const relativeElmFiles = _.map(elmFiles, function (file) { return path.relative(cwd, file); })
  checkExactly(cwd, relativeElmFiles, sources, true);
}

// module.exports = function (inputFileName, sourceFileName, commandLineArgs) {
module.exports = { parseAll, parseAllJson }
