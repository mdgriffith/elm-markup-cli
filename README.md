# Elm Markup CLI

Check your elm-markup files (`*.emu`) for errors using any [elm-markup](https://package.elm-lang.org/packages/mdgriffith/elm-markup/latest/) documents you have defined in your elm code.

## Installation

```shell
npm install -g elm-markup
```

## Usage

```shell
# Find exposed `Mark.Document` and use them to parse .emu files.
# Print errors to the console by default.
elm-markup

# print version of Elm Markup CLI
elm-markup --version

# --report 
# Change the report format.
# options
#  console (default) - print in a human readable format.
#  json - encode every error in json and log to stdout 
elm-markup --report=json
```


## Previewing Documents

This packge doesn't handle previewing what a document would look like because that's probably better handled by your elm application and a tool like [`elm-live`](https://github.com/wking-io/elm-live)