extern crate clap;

use clap::{Arg, App};

fn main() {
    // Process cli arguments
    let matches = App::new("Elm Markup")
        .version("0.1.0")
        .author("Matthew Griffith <mdg.griffith@gmail.com")
        .about("Run for Elm Markup parsers.")
        .arg(Arg::with_name("REPORT")
                 .long("report")
                 .takes_value(true)
                 .possible_values(&["json"])
                 .help("different formats for the error report"))
        .get_matches();
    let as_json = matches.value_of("REPORT").is_some();

    println!("Running as json? {}", as_json);


    // Find all markup files ++ ElmFiles from the project
    // Find project root
    
    // Ensure elm is installed.
    // Ensure project is compiled. (output to dev/null)
    // Find Documents
    //      -> call elmi-to-json if out of date
    //      -> read interface json file
    //          -> extract relevant top level value names
    // 
    // Generate ElmJSON 
    // Generate Runner Elm file
    // Compile Generated Code
    // Start Javascript in VM. (? not sure how to do this in Rust)
    //    -> Send Messagse requesting Parsing
    //    -> receive results
    // Print JSON
    // | print formatted text.


}