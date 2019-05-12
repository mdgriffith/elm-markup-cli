const glob = require("glob");
const _ = require('lodash');
const fs = require('fs');
let path = require("path");

function markupFiles(directory) {
    return glob.sync('/**/*.emu', {
        root: directory,
        nocase: true,
        ignore: '/**/+(elm-stuff|node_modules)/**',
        nodir: true,
    })
}

function elmFiles(directory) {
    return glob.sync('/**/*.elm', {
        root: directory,
        nocase: true,
        ignore: '/**/+(elm-stuff|node_modules)/**',
        nodir: true,
    })
}

function modifiedElmFiles(directory) {

    let elmFiles = glob.sync('/**/*.elm', {
        root: directory,
        nocase: true,
        stat: true,
        ignore: '/**/+(elm-stuff|node_modules)/**',
        nodir: true,
    })

    let modified = [];
    const elmFilesLength = elmFiles.length;
    for (var e = 0; e < elmFilesLength; e++) {
        const file = elmFiles[e];
        const rel = path.relative(directory, file);

        const elmi = path.join(directory, "elm-stuff", "0.19.0", to_elmi(rel));

        try {
            const interface = fs.statSync(elmi);
            const source = fs.statSync(file);
            if (interface.mtimeMs <= source.mtimeMs) {
                modified.push(file);
            }
        } catch (err) {
            // An ElmI file probably isn't present,
            // so the file has been modified
            modified.push(file);
        }
    }
    return modified;
}



function to_elmi(relative_path) {
    const split = relative_path.split(path.sep);

    let newfile = [];
    const pieces = split.length;
    for (var i = 0; i < pieces; i++) {
        const first = split[i].substr(0, 1)
        if (first == first.toUpperCase()) {
            newfile.push(split[i])
        }
    }

    return newfile.join("-") + "i"
}



function interfaceIsOutofDate(directory, interfaceFile) {

    let interfaceStat;
    try {
        interfaceStat = fs.statSync(interfaceFile);
    } catch (err) {
        return { expired: true }
    }

    let expired = false;

    let elmiFiles = glob.sync('/elm-stuff/**/*.elmi', {
        root: directory,
        nocase: true,
        stat: true,
        ignore: '/elm-stuff/**/+(node_modules|elm-stuff)/**',
        nodir: true,
    })

    const elmiFilesLength = elmiFiles.length;
    for (var i = 0; i < elmiFilesLength; i++) {
        const file = elmiFiles[i];
        const source = fs.statSync(file);

        if (interfaceStat.mtimeMs <= source.mtimeMs) {
            expired = true;
            break;
        }
    }
    return { expired: expired };
}


function newerThan(one, two) {

    try {
        let oneStat = fs.statSync(one);
        let twoStat = fs.statSync(two);

        if (oneStat.mtimeMs >= twoStat.mtimeMs) {
            return true;
        } else {
            return false;
        }

    } catch (err) {
        return false;
    }
}


module.exports = { newerThan, markupFiles, elmFiles, modifiedElmFiles, interfaceIsOutofDate };