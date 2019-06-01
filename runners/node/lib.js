"use strict";



var Compile = require('./compile.js');
let vm = require("vm");
let fs = require("fs");
let fsExtra = require("fs-extra");
let path = require("path");
let child_process = require("child_process");
let which = require("which");
let findUp = require("find-up");
const chalk = require('chalk');
let firstline = require('firstline');
let spawn = require('cross-spawn');
let _ = require('lodash');
let finder = require('./finder.js');
let Generate = require('./generate.js');
let Find = require('./lib/Find.js');

let track = [];

function relativize(tracked) {
  let len = tracked.length;
  let relative = [];
  let prev = null;
  for (var i = 0; i < len; i++) {
    if (prev == null) {
      relative.push({ name: tracked[i].name, time: 0 });
      prev = tracked[i].time;
    } else {
      const data = { name: tracked[i].name, time: (tracked[i].time - prev) / 1000000 }
      prev = tracked[i].time;
      relative.push(data);
    }
  }
  return relative;
}

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

function colorize(message) {
  return bold(message.bold, underline(message.underline, add_color(message.color, message.text)));
}
function bold(add, text) {
  if (add) {
    return chalk.bold(text)
  } else {
    return text
  }
}
function underline(add, text) {
  if (add) {
    return chalk.underline(text)
  } else {
    return text
  }
}

function add_color(colorString, text) {
  switch (colorString) {
    case "yellow":
      return chalk.yellow(text);

    case "red":
      return chalk.red(text);

    case "blue":
      return chalk.blue(text);

    case "green":
      return chalk.green(text);

    case "cyan":
      return chalk.cyan(text);

    default:
      return text;
  }
}

function logError(context, error) {
  var relativePath = path.relative(process.cwd(), context.sourcePath);

  let parserText = add_color("yellow", spaceFront("with " + context.parser));
  let fileText = add_color("cyan", dashFill("-- " + error.title.toUpperCase(), " ./" + relativePath))

  let errorText = fileText + "\n" + parserText + "\n";
  let errorLen = error.message.length;

  for (var i = 0; i < errorLen; i++) {
    errorText = errorText + colorize(error.message[i]);
  }
  return errorText + "\n";
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


// If we're calling this, it's because there was some modification that was made.
//
function findDocumentsInProject(elmPackageJsonPath) {

  const targetFile = path.join(
    elmPackageJsonPath,
    'elm-stuff',
    'generated-code',
    'mdgriffith',
    'elm-markup',
    'interface.json'
  );

  let elmInterface = Find.interfaceIsOutofDate(elmPackageJsonPath, targetFile);

  return new Promise(function (resolve, reject) {
    function finish() {
      if (elmInterface.expired) {
        // /Users/matthewgriffith/elm-markup-cli/example/elm-stuff/generated-code/mdgriffith/elm-markup/
        fsExtra.mkdirpSync(path.dirname(targetFile));
        var proc = spawn(readElmiPath, ["--output=" + targetFile], {
          cwd: elmPackageJsonPath,
          env: process.env

        });
        proc.on('close', function (code) {
          var modules;
          try {
            const jsonStr = fs.readFileSync(targetFile);
            modules = JSON.parse(jsonStr);
          } catch (err) {
            reject('Received invalid JSON from test interface search: ' + err);
          }
          let filteredModules = filter_for_docs(modules)
          return resolve(filteredModules);
        });
      } else {
        var modules;
        try {
          const jsonStr = fs.readFileSync(targetFile);
          modules = JSON.parse(jsonStr);
        } catch (err) {
          reject('Received invalid JSON from test interface search: ' + err);
        }
        let filteredModules = filter_for_docs(modules)
        return resolve(filteredModules);
      }
    }
    return finish();
  });
}


function filter_for_docs(modules) {
  let filtered = _.flatMap(modules, function (mod) {
    var eligible = _.flatMap(_.toPairs(mod.interface.types), function (
      pair
    ) {
      var name = pair[0];
      var annotation = pair[1].annotation;

      if (
        annotation.moduleName &&
        (annotation.moduleName.package === 'mdgriffith/elm-markup' || annotation.moduleName.package === 'author/project') &&
        annotation.moduleName.module === 'Mark' &&
        annotation.name === 'Document'
      ) {
        return name;
      } else {
        return [];
      }
    });

    // Must have at least 1 value of type Document. Otherwise ignore this module.
    if (eligible.length > 0) {
      return [{ name: mod.moduleName, tests: eligible }];
    } else {
      return [];
    }
  });
  return filtered;
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
  // We reroute stdout and stderr to data
  captureStdout(() => { vm.runInThisContext(compiledJs) })

  let script = global["Elm"].Mark.Generated[moduleName].init();
  let errorPorts = script.ports.error;
  var output = [];
  script.output = output;

  errorPorts.subscribe(function (parsed) {
    if (asJson) {
      script.output.push(parsed);
    } else if (parsed.problems.length == 0) {

      const src = parsed.sourcePath.replace(process.cwd() + "/", "");

      console.log('');
      console.log("    " + chalk.green("✓") + " " + src + " successfully parsed by " + parsed.parser);
    } else {
      let errorLen = parsed.problems.length;

      for (var i = 0; i < errorLen; i++) {


        const err = logError(parsed, parsed.problems[i]);
        script.output.push(err);
      }
    }
  });

  return script;

}

function captureStdout(callback) {
  var output = '', old_write = process.stdout.write
  var err = '', old_err = process.stderr.write

  // start capture
  process.stdout.write = function (str, encoding, fd) {
    output += str
  }
  process.stderr.write = function (str, encoding, fd) {
    err += str
  }

  var result = callback()

  // end capture
  process.stdout.write = old_write
  process.stderr.write = old_err

  return { output: output, error: err, result: result }
}


function exists(filepath) {
  try {
    fs.accessSync(filepath);
    return true
  } catch (error) {
    return false
  }
}

function checkExactly(base, elmFiles, sourcePaths, asJson) {

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


  // Compile.compileAll(
  //   elmFiles,
  //   elmJsonDirectory,
  //   false, // verbose
  //   elmExecutable,
  //   // args.report
  //   undefined // report (not json for this case)
  // )
  //   .then(function () {
  //     process.exit(0);
  //   })
  //   .catch(function (err) {
  //     process.exit(1);
  //   });


  if (elmFiles.length != 0) {

    try {

      child_process.execFileSync(
        elmExecutable,
        ["make", "--output=/dev/null"].concat(elmFiles),
        { cwd: elmJsonDirectory, encoding: "utf8" }
      );

    } catch (error) {
      process.exit(1);
    }
  }

  findDocumentsInProject(
    elmJsonDirectory
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

    const interfaceFile = path.join(
      elmJsonDirectory,
      'elm-stuff',
      'generated-code',
      'mdgriffith',
      'elm-markup',
      'interface.json'
    );

    if (exists(compiledRunnerFile) && elmFiles.length == 0 && Find.newerThan(compiledRunnerFile, interfaceFile)) {
    } else {
      // Try to compile Elm file
      try {
        child_process.execFileSync(
          elmExecutable,
          ["make", "--output=" + compiledRunnerFile, generated.file],
          { cwd: generatedCodeDir, encoding: "utf8", stdio: 'pipe' }
        );

      } catch (error) {

        process.exit(1);
      }
    }

    var elmParser = parserVM(compiledRunnerFile, generated.name, asJson);

    const modulesLength = documents.length;
    if (modulesLength == 0) {
      console.log("")
      console.log("    No Mark.Documents found, are you sure it's exposed?")
      console.log("")
    } else {
      for (var i = 0; i < modulesLength; i++) {

        const documentsLength = documents[i].tests.length;
        for (var d = 0; d < documentsLength; d++) {

          const sourcePathCount = sourcePaths.length;
          for (var m = 0; m < sourcePathCount; m++) {

            var source = null;
            try {
              source = fs.readFileSync(sourcePaths[m], "utf8");
            } catch (error) {
              console.log(error.message);
              process.exit(1);
            }

            elmParser.ports.parse.send({
              parser: documents[i].name + "." + documents[i].tests[d],
              sourcePath: sourcePaths[m],
              source: source
            });
          }
        }
      }

      setTimeout(function () {
        if (asJson) {
          let errors = {
            type: "parse-errors",
            errors: elmParser.output
          }
          console.log(JSON.stringify(errors));
        } else {
          console.log(elmParser.output.join("\n"));
        }
      }, 0)
    }
  })
}
function parseAll() {
  // find all .elm files in source directories
  // find all .emu files.
  let cwd = process.cwd();

  const sources = Find.markupFiles(cwd);
  // const elmFiles = Find.elmFiles(cwd);
  const elmFiles = Find.modifiedElmFiles(cwd);
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

module.exports = { parseAll, parseAllJson }
