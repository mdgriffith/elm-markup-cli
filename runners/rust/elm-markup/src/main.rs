mod mark;
extern crate clap;

use clap::{App, Arg};
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    // Process cli arguments
    let matches = App::new("Elm Markup")
        .version("0.1.0")
        .author("Matthew Griffith <mdg.griffith@gmail.com")
        .about("Run for Elm Markup parsers.")
        .arg(
            Arg::with_name("REPORT")
                .long("report")
                .takes_value(true)
                .possible_values(&["json"])
                .help("different formats for the error report"),
        ).get_matches();
    let as_json = matches.value_of("REPORT").is_some();

    // println!("Running as json? {}", as_json);

    // Is there a project here?
    // Ensure elm is installed.

    // Ensure project is compiled.
    let compiled = Command::new("elm")
        .arg("make")
        .arg("--output=/dev/null")
        .arg("elmSrc/Main.elm")
        .output();

    match compiled {
        Ok(output) => {
            println!(
                "{}",
                String::from_utf8(output.stderr).expect("Failed to Decode Output")
            );
            if output.status.success() == false {
                ::std::process::exit(1);
            }
        }
        Err(err) => {
            println!("{}", err);
            ::std::process::exit(1);
        }
    }

    let interface_path = "elm-stuff/generated-code/interface.json";
    let generated_dir = "elm-stuff/generated-code/";

    let summary_path = "elm-stuff/0.19.0/summary.dat";

    // if interface.json is older than elm-stuff /0.19.0/summary.dat, generate new interface
    // if Path::new(interface_path).exists() {
    //     if more_recent_than(interface_path, summary_path) {
    //         println!("Extracting interface");
    //         prepare_interface(generated_dir, interface_path);
    //     } else {
    //         println!("interface is up to date");
    //     }
    // } else {
    //     println!("interface doen't exist");
    //     prepare_interface(generated_dir, interface_path);
    // }

    // Instead of Checking just the summary.dat,

    prepare_interface(generated_dir, interface_path);

    // Find all markup files ++ ElmFiles from the project
    // mark::find::markup();

    // Find Documents
    //      -> call elmi-to-json if out of date (maybe it's just if summary.dat is out of date)
    //      -> read interface json file
    //          -> extract relevant top level value names

    // Generate ElmJSON
    // Copy Runner Elm file

    // Compile Generated Code
    // Start Javascript in VM. (? not sure how to do this in Rust)
    //    -> Send Messagse requesting Parsing
    //    -> receive results

    //
    // Print JSON
    // | print formatted text.
}

fn prepare_interface(generated_dir: &str, interface_path: &str) {
    fs::create_dir_all(generated_dir);

    let compiled_interface_command = Command::new("elmi-to-json")
        .arg(format!("--output={}", interface_path))
        .output();

    match compiled_interface_command {
        Ok(output) => {
            println!(
                "{}",
                String::from_utf8(output.stdout).expect("Failed to Decode Output")
            );
            println!(
                "{}",
                String::from_utf8(output.stderr).expect("Failed to Decode Output")
            );
            if output.status.success() == false {
                ::std::process::exit(1);
            }
        }
        Err(err) => {
            println!("{}", err);
            ::std::process::exit(1);
        }
    }
}
fn more_recent_than(one_path: &str, two_path: &str) -> bool {
    let one_meta_result = fs::metadata(one_path);
    let two_meta_result = fs::metadata(two_path);

    match (one_meta_result, two_meta_result) {
        (Ok(one_meta), Ok(two_meta)) => {
            match (one_meta.modified(), two_meta.modified()) {
                (Ok(one_mod), Ok(two_mod)) => {
                    // println!("Summary modified at {:?}", summary_meta.modified());
                    match one_mod.duration_since(two_mod) {
                        Ok(_dur) => {
                            // one was created/modified after two
                            // two ... one
                            true
                        }
                        Err(_err) => {
                            // two was created after one
                            false
                        }
                    }
                }
                // getting modified date failed for some reason,
                _ => false,
            }
        }
        _ => {
            // one or two doesn't exist
            false
        }
    }
}
