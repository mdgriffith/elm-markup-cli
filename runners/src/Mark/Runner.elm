port module Mark.Runner exposing (worker)

import Dict
import Error
import Mark
import Mark.Default
import Platform


type Msg
    = Parse { parserName : String, markupFile : String, source : String }


parseForErrors doc file =
    case Mark.parse doc file.source of
        Ok _ ->
            { parserName = file.parserName, markupFile = file.markupFile, errors = [] }

        Err errors ->
            -- let
            --     _ =
            --         Debug.log "errors" errors
            -- in
            { parserName = file.parserName
            , markupFile = file.markupFile
            , errors = Error.toJson file.source errors
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


port error : { parserName : String, markupFile : String, errors : List Error.Error } -> Cmd msg


port parse : ({ parserName : String, markupFile : String, source : String } -> msg) -> Sub msg


update documents msg model =
    case msg of
        Parse files ->
            ( model
            , error (parseDoc documents files)
            )


parseDoc documents file =
    case Dict.get file.parserName documents of
        Nothing ->
            { parserName = file.parserName, markupFile = file.markupFile, errors = [] }

        Just doc ->
            parseForErrors doc file
