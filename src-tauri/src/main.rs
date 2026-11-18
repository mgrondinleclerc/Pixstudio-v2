#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const MAX_PROJECT_BYTES: u64 = 50 * 1024 * 1024;
const MAX_IMAGE_FILE_BYTES: u64 = 25 * 1024 * 1024;

fn validate_project_path(path: &Path) -> Result<(), String> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
    {
        Some(extension) if extension == "pixe" => Ok(()),
        _ => Err("Le fichier doit porter l’extension .pixe.".to_string()),
    }
}

#[cfg(windows)]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let from_wide: Vec<u16> = from
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let to_wide: Vec<u16> = to
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let success = unsafe {
        MoveFileExW(
            from_wide.as_ptr(),
            to_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        Err("Le remplacement atomique Windows a échoué.".to_string())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_project(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    validate_project_path(&target)?;
    if bytes.len() as u64 > MAX_PROJECT_BYTES {
        return Err("Le projet dépasse la taille maximale autorisée de 50 Mo.".to_string());
    }
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let filename = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project.pixe");
    let temporary = parent.join(format!(".{filename}.{}.tmp", std::process::id()));

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|error| format!("Création du fichier temporaire impossible : {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("Écriture impossible : {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Synchronisation impossible : {error}"))?;
    drop(file);
    if let Err(error) = replace_file(&temporary, &target) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "Finalisation de la sauvegarde impossible : {error}"
        ));
    }
    Ok(())
}

#[tauri::command]
fn load_project(path: String) -> Result<Vec<u8>, String> {
    let target = PathBuf::from(path);
    validate_project_path(&target)?;
    let metadata =
        fs::metadata(&target).map_err(|error| format!("Lecture impossible : {error}"))?;
    if !metadata.is_file() {
        return Err("Le chemin sélectionné n’est pas un fichier .pixe.".to_string());
    }
    if metadata.len() > MAX_PROJECT_BYTES {
        return Err("Le projet dépasse la taille maximale autorisée de 50 Mo.".to_string());
    }
    fs::read(target).map_err(|error| format!("Lecture impossible : {error}"))
}

#[tauri::command]
fn read_image_file(path: String) -> Result<Vec<u8>, String> {
    let target = PathBuf::from(path);
    let extension = target
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match extension.as_deref() {
        Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | Some("webp") | Some("bmp") => {}
        _ => return Err("Le fichier déposé n’est pas une image prise en charge.".to_string()),
    }
    let metadata =
        fs::metadata(&target).map_err(|error| format!("Lecture impossible : {error}"))?;
    if !metadata.is_file() {
        return Err("Le chemin déposé n’est pas un fichier.".to_string());
    }
    if metadata.len() > MAX_IMAGE_FILE_BYTES {
        return Err("L’image dépasse la taille maximale de 25 Mo.".to_string());
    }
    fs::read(target).map_err(|error| format!("Lecture impossible : {error}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_project,
            load_project,
            read_image_file
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de PixeStudio");
}
