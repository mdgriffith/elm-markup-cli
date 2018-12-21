port module Mark.Runner exposing (worker)

import Dict
import Error
import Mark
import Mark.Default
import Platform


type Msg
    = Parse { parser : String, sourcePath : String, source : String }


parseForErrors doc file =
    case Mark.parse doc file.source of
        Ok _ ->
            { parser = file.parser
            , sourcePath = file.sourcePath
            , problems = []
            }

        Err errors ->
            -- let
            --     _ =
            --         Debug.log "errors" errors
            -- in
            { parser = file.parser
            , sourcePath = file.sourcePath
            , problems = Error.toJson file.source errors
            }


worker documents =
    Platform.worker
        { init =
            \() ->
                ( (), Cmd.none )
        , update = update documents
        , subscriptions =
            \model ->
                parse Parse
        }


port error : { parser : String, sourcePath : String, problems : List Error.Error } -> Cmd msg


port parse : ({ parser : String, sourcePath : String, source : String } -> msg) -> Sub msg


update documents msg model =
    case msg of
        Parse files ->
            ( model
            , error (parseDoc documents files)
            )


parseDoc documents file =
    case Dict.get file.parser documents of
        Nothing ->
            { parser = file.parser, sourcePath = file.sourcePath, problems = [] }

        Just doc ->
            parseForErrors doc file
