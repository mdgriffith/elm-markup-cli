let glob = require("glob");

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


module.exports = { markupFiles, elmFiles };