// @flow

const path = require('path'),
    spawn = require('cross-spawn'),
    fs = require('fs-extra'),
    _ = require('lodash'),
    Murmur = require('murmur-hash-js'),
    Version = require('./version.js')

function prepareCompiledJsFile(pipeFilename /*:string*/, dest /*:string*/) {
    return Promise.all([
        readUtf8(path.join(__dirname, '..', 'templates', 'before.js')),
        readUtf8(dest),
        readUtf8(path.join(__dirname, '..', 'templates', 'after.js')),
    ]).then(([before, content, after]) => {
        return new Promise((resolve, reject) => {
            const finalContent = [
                before,
                'var Elm = (function(module) { ',
                content,
                'return this.Elm;',
                '})({});',
                'var pipeFilename = ' + JSON.stringify(pipeFilename) + ';',
                after,
            ].join('\n');
            return fs.writeFile(dest, finalContent, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
}

function readUtf8(filepath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filepath, { encoding: 'utf8' }, (err, contents) => {
            if (err) {
                reject(err);
            } else {
                resolve(contents);
            }
        });
    });
}

function generateElmJson(
    projectRootDir /*:string*/,
    // testRootDir /*:string*/,
    pathToElmBinary /*:string*/,
    // filePaths /*:Array<string>*/,
    // hasBeenGivenCustomGlobs /*:boolean*/
) {
    const generatedCodeDir = path.resolve(
        path.join(
            projectRootDir,
            'elm-stuff',
            'generated-code',
            'mdgriffith',
            'elm-markup'
        )
    );
    const elmJsonPath = path.resolve(path.join(projectRootDir, 'elm.json'));
    const generatedSrc = path.join(generatedCodeDir, 'src');

    var projectElmJson = {};

    try {
        projectElmJson = fs.readJsonSync(elmJsonPath);
    } catch (err) {
        console.error('Error reading elm.json: ' + err);
        process.exit(1);
    }
    var isPackageProject = projectElmJson.type === 'package';

    // if we were given file globs, we don't need to check the tests/ directory exists
    // this is only for elm applications, which people may need to introduce slowly into their apps
    // for packages, we stick with the existing behaviour and assume tests are in tests/ so do the check always
    // if (hasBeenGivenCustomGlobs === false || isPackageProject === true) {
    //     if (!fs.existsSync(testRootDir)) {
    //         console.error(
    //             'Error: ' +
    //             testRootDir +
    //             ' does not exist. Please create a tests/ directory in your project root!'
    //         );
    //         process.exit(1);
    //     }

    //     if (!fs.lstatSync(testRootDir).isDirectory()) {
    //         console.error(
    //             'Error: ' +
    //             testRootDir +
    //             ' exists, but it is not a directory. Please create a tests/ directory in your project root!'
    //         );
    //         process.exit(1);
    //     }
    // }

    fs.mkdirpSync(generatedCodeDir);
    fs.mkdirpSync(generatedSrc);

    var testElmJson = {
        type: 'application',
        'source-directories': [], // these are added below
        'elm-version': '0.19.0',
        dependencies: {
            direct: {},
            indirect: {},
        },
        'test-dependencies': {
            direct: {},
            indirect: {},
        },
    };

    var nodeTestRunnerElmJsonPath = path.resolve(
        path.join(__dirname, 'elm.json')
    );
    var nodeTestRunnerElmJson = fs.readJsonSync(nodeTestRunnerElmJsonPath);

    addDirectDependencies(
        nodeTestRunnerElmJson['dependencies']['direct'],
        isPackageProject,
        testElmJson
    );
    addIndirectDependencies(
        nodeTestRunnerElmJson['dependencies']['indirect'],
        testElmJson
    );

    if (isPackageProject) {
        addDirectDependencies(
            projectElmJson['dependencies'],
            isPackageProject,
            testElmJson
        );
        // addDirectDependencies(
        //     projectElmJson['test-dependencies'],
        //     isPackageProject,
        //     testElmJson
        // );
        // package projects don't explicitly list their transitive dependencies,
        // to we have to figure out what they are.  We write the elm.json that
        // we have so far, and run elm to see what it thinks is missing.
        fs.writeFileSync(
            path.join(generatedCodeDir, 'elm.json'),
            JSON.stringify(testElmJson, null, 4)
        );
        var missingDeps = askElmForMissingTransitiveDependencies(
            pathToElmBinary,
            generatedCodeDir
        );
        addIndirectDependencies(missingDeps, testElmJson);
    } else {
        addDirectDependencies(
            projectElmJson['dependencies']['direct'],
            isPackageProject,
            testElmJson
        );
        addIndirectDependencies(
            projectElmJson['dependencies']['indirect'],
            testElmJson
        );
        // addDirectDependencies(
        //     projectElmJson['test-dependencies']['direct'],
        //     isPackageProject,
        //     testElmJson
        // );
        // addIndirectDependencies(
        //     projectElmJson['test-dependencies']['indirect'],
        //     testElmJson
        // );
    }

    // Make all the source-directories absolute, and introduce a new one.
    var projectSourceDirs;
    if (isPackageProject) {
        projectSourceDirs = ['./src'];
    } else {
        projectSourceDirs = projectElmJson['source-directories'];
    }
    var sourceDirs = projectSourceDirs
        .map(function (src) {
            return path.resolve(path.join(projectRootDir, src));
        })
    // .concat([testRootDir]);

    testElmJson['source-directories'] = [
        // Include elm-stuff/generated-sources - since we'll be generating sources in there.
        generatedSrc,

        // NOTE: we must include node-test-runner's Elm source as a source-directory
        // instead of adding it as a dependency so that it can include port modules
        path.resolve(path.join(__dirname, '..', 'src')),
    ].concat(sourceDirs);

    // When running node-test-runner's own test suite, the node-test-runner/src folder
    // will get added twice: once because it's the source-directory of the packge being tested,
    // and once because elm-test will always add it.
    // To prevent elm from being confused, we need to remove the duplicate when this happens.
    testElmJson['source-directories'] = testElmJson['source-directories'].filter(
        function (value, index, self) {
            return self.indexOf(value) === index;
        }
    );

    // Generate the new elm.json
    fs.writeFileSync(
        path.join(generatedCodeDir, 'elm.json'),
        JSON.stringify(testElmJson, null, 4)
    );

    return [generatedCodeDir, generatedSrc, sourceDirs];
}

function addDirectDependencies(
    deps /*:Object*/,
    isPackageProject /*:boolean*/,
    testElmJson /*:Object*/
) {
    Object.keys(deps).forEach(function (name) {
        var version = deps[name];
        if (isPackageProject) {
            // Use the lowest version in the range.
            // NOTE: technically this doesn't work if someone does something weird like:
            //
            // "2.0.0 < v < 3.0.0"
            //
            // ...but we're choosing not to support that right now.
            version = version.split(' ')[0];
        }
        if (testElmJson['dependencies']['direct'].hasOwnProperty(name)) {
            var existingVersion = testElmJson['dependencies']['direct'][name];

            // If we have a clash, choose the higher of the two versions.
            // This may not work! It's entirely possible that the result won't
            // compile. We're going to try it and see what happens.
            version = Version.getHigherVersion(version, existingVersion);
        }
        testElmJson['dependencies']['direct'][name] = version;
    });
}

function addIndirectDependencies(deps, testElmJson /*:Object*/) {
    Object.keys(deps).forEach(function (name) {
        if (testElmJson['dependencies']['direct'].hasOwnProperty(name)) {
            // already a normal dep
        } else {
            var version = deps[name];

            if (testElmJson['dependencies']['indirect'].hasOwnProperty(name)) {
                var existingVersion = testElmJson['dependencies']['indirect'][name];

                // If we have a clash, choose the higher of the two versions.
                // This may not work! It's entirely possible that the result won't
                // compile. We're going to try it and see what happens.
                version = Version.getHigherVersion(version, existingVersion);
            }

            testElmJson['dependencies']['indirect'][name] = version;
        }
    });
}
function askElmForMissingTransitiveDependencies(
    pathToElmBinary,
    pathToElmProject
) {
    var result = spawn.sync(pathToElmBinary, ['make', '--report=json'], {
        silent: true,
        env: process.env,
        cwd: pathToElmProject,
    });

    if (result.stderr == null) {
        console.error(
            'No output received from elm make when searching for indirect dependencies.'
        );
        process.exit(1);
    }

    // TODO: hopefully the next Elm 0.19 beta will print the JSON to stdout instead
    var output = result.stderr.toString();

    // TODO: hopefully the next Elm 0.19 beta will not have this message (only occurs on linux) mixed in with the JSON output
    output = output.replace(
        /^elm:.*no version information available \(required by elm\)\n/,
        ''
    );

    var report = JSON.parse(output);
    if (report.type === 'error' && report.title === 'NO INPUT') {
        // all transtive dependencies are listed already (elm is complaining that we didn't tell it which .elm file to build, which happens after the dependency validations)
        return {};
    } else if (
        report.type === 'error' &&
        report.title === 'MISSING DEPENDENCIES'
    ) {
        var missingDeps = {};
        // parse the missing dependencies and versions from the error report
        report.message[1].string.replace(/"([^"]*)": "([^"]*)"/g, function (
            _,
            name,
            version
        ) {
            missingDeps[name] = version;
        });
        return missingDeps;
    } else {
        console.error(
            "elm-test internal error: got an unexpected result from 'elm make' when validating transitive dependencies.  Please report this at https://github.com/rtfeldman/node-test-runner/issues"
        );
        process.exit(1);
        return {}; // This makes flow happy because it doesn't know process.exit will stop everything
    }
}

function generateMainModule(
    // testFilePaths /*:Array<string>*/,
    tests /*:Array<Object>*/,
    generatedSrc /*:string*/
) {
    // Building things like:
    //
    // import MyTests
    //
    // MyTests.suite
    const imports = _.map(tests, function (test) {
        return 'import ' + test.name;
    });

    const documents = _.map(tests, function (doc) {
        return _.map(doc.tests, function (fn) {
            const fullName = doc.name + "." + fn
            return '("' + fullName + '", ' + fullName + ')';
        })

    });

    // if (documents.length === 0) {
    //     const errorMessage =
    //         testFilePaths.length > 0
    //             ? 'I couldn\'t find any exposed values of type Test in files matching "' +
    //             testFilePaths.toString() +
    //             '"\n\nMaybe try running elm-test with no arguments?'
    //             : "I couldn't find any exposed values of type Test in any *.elm files in the tests/ directory of your project's root directory.\n\nTo generate some initial tests to get things going, run elm-test init";

    //     console.error(errorMessage);
    //     process.exit(1);
    // }

    // const renderedDocs = _.map(tests)



    const runnerFileBody = [
        imports.join('\n'),
        'import Dict',
        'import Mark.Runner',
        '',
        'documents =',
        '    Dict.fromList [',
        '       ' + _.flatten(documents).join(', '),
        // '        (' + '"Main.myDocument"' + ',' + 'Main.myDocument' + ')',
        '        ]',
        '',
        'main = Mark.Runner.worker documents'


    ].join('\n');

    // Generate a filename that incorporates the hash of file contents.
    // This way, if you run e.g. `elm-test Foo.elm` and then `elm-test Bar.elm`
    // and then re-run `elm-test Foo.elm` we still have a cached `Main` for
    // `Foo.elm` (assuming none of its necessary imports have changed - and
    // why would they?) so we don't have to recompile it.
    const salt = Murmur.murmur3(runnerFileBody);
    const moduleName = 'Main' + salt;
    const mainPath = path.join(generatedSrc, 'Mark', 'Generated');
    const mainFile = path.join(mainPath, moduleName + '.elm');
    // We'll be putting the generated Main in something like this:
    //
    // my-project-name/elm-stuff/generated-code/elm-community/elm-test/src/Test/Generated/Main123456.elm
    const testFileContents = [
        'module Mark.Generated.' + moduleName + ' exposing (main)',
        runnerFileBody,
    ].join('\n\n');

    // Make sure src/Test/Generated/ exists so we can write the file there.
    fs.mkdirpSync(mainPath);


    fs.writeFileSync(mainFile, testFileContents);

    // Always write the file, in order to update its timestamp. This is important,
    // because if we run `elm-make Main123456.elm` and that file's timestamp did
    // not change, elm-make will short-circuit and not recompile *anything* - even
    // if some of Main's dependencies (such as an individual test file) changed.
    fs.writeFileSync(mainFile, testFileContents);

    return { file: mainFile, name: moduleName };
}

module.exports = { prepareCompiledJsFile, generateElmJson, generateMainModule };
