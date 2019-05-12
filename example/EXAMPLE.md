# An Example Usage of external Markup

Our markup files are kept in `notes`, and our elm application is kept in `src`.

Running `elm-markup` in this directory will list any errors that `notes/Note.emu` has.

You can set up a preview server by installing [`elm-live`](https://github.com/wking-io/elm-live) and running:

```shell
elm-live src/Main.elm --open
```

The Elm application will make a GET request for the source of the article, and parse it when it arrives.