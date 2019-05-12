port module Mark.Runner exposing (worker)

import Dict
import Mark
import Mark.Error
import Platform


type Msg
    = Parse { parser : String, sourcePath : String, source : String }


parseForErrors doc file =
    case Mark.parse doc file.source of
        Mark.Success _ ->
            { parser = file.parser
            , sourcePath = file.sourcePath
            , problems = []
            }

        Mark.Almost { errors } ->
            { parser = file.parser
            , sourcePath = file.sourcePath
            , problems = List.map Mark.Error.toDetails errors
            }

        Mark.Failure errors ->
            { parser = file.parser
            , sourcePath = file.sourcePath
            , problems = List.map Mark.Error.toDetails errors
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


port error : { parser : String, sourcePath : String, problems : List Mark.Error.Details } -> Cmd msg


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
