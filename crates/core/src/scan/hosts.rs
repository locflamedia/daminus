//! Which hosts a scan leaves out (Settings › Hosts, "Include in scans"). The choice is kept in
//! `projects.json` beside the projects, so the file is read, changed in one place and written
//! back with the stamp it was read with.

use crate::domain::error::{AppError, ErrorCode};
use crate::domain::host::HostAlias;
use crate::domain::project::{HostSettings, ProjectsFile};
use crate::store::{FsStore, PROJECTS_FILE};

/// The hosts switched off, in alias order.
pub fn excluded_hosts(store: &FsStore) -> Result<Vec<HostAlias>, AppError> {
    Ok(excluded(&store.load_projects()?.value))
}

/// Switches `host` on or off for scans and answers with the hosts that are off afterwards. A
/// file written by a newer version is not touched.
pub fn set_host_included(
    store: &FsStore,
    host: &HostAlias,
    include: bool,
) -> Result<Vec<HostAlias>, AppError> {
    let stamped = store.load_projects()?;
    if stamped.read_only {
        return Err(ErrorCode::ConfigFromNewerVersion {
            path: PROJECTS_FILE.to_owned(),
            version: stamped.value.version,
        }
        .into());
    }
    let stamp = stamped.stamp;
    let mut file = stamped.value;
    if file.host_included(host) == include {
        return Ok(excluded(&file));
    }
    file.hosts.insert(host.clone(), HostSettings { include });
    store.save_projects(&file, stamp)?;
    Ok(excluded(&file))
}

fn excluded(file: &ProjectsFile) -> Vec<HostAlias> {
    file.hosts
        .iter()
        .filter(|(_, settings)| !settings.include)
        .map(|(alias, _)| alias.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alias(s: &str) -> HostAlias {
        HostAlias::parse(s).unwrap()
    }

    fn store() -> (tempfile::TempDir, FsStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = FsStore::new(dir.path());
        (dir, store)
    }

    #[test]
    fn a_host_is_on_until_it_is_switched_off_and_back() {
        let (_dir, store) = store();
        assert!(excluded_hosts(&store).unwrap().is_empty());
        let off = set_host_included(&store, &alias("vps-a"), false).unwrap();
        assert_eq!(off, vec![alias("vps-a")]);
        assert_eq!(excluded_hosts(&store).unwrap(), off);
        let on = set_host_included(&store, &alias("vps-a"), true).unwrap();
        assert!(on.is_empty());
        assert!(excluded_hosts(&store).unwrap().is_empty());
    }

    #[test]
    fn switching_a_host_keeps_the_projects_and_the_other_hosts() {
        let (_dir, store) = store();
        set_host_included(&store, &alias("vps-b"), false).unwrap();
        let left = set_host_included(&store, &alias("vps-a"), false).unwrap();
        assert_eq!(left, vec![alias("vps-a"), alias("vps-b")]);
        let file = store.load_projects().unwrap().value;
        assert!(file.projects.is_empty());
        assert!(!file.host_included(&alias("vps-b")));
    }

    #[test]
    fn a_file_from_a_newer_version_is_not_changed() {
        let (dir, store) = store();
        std::fs::write(
            dir.path().join(PROJECTS_FILE),
            r#"{"version":99,"projects":[]}"#,
        )
        .unwrap();
        let before = std::fs::read(dir.path().join(PROJECTS_FILE)).unwrap();
        let err = set_host_included(&store, &alias("vps-a"), false).unwrap_err();
        assert!(matches!(err.code, ErrorCode::ConfigFromNewerVersion { .. }));
        assert_eq!(
            std::fs::read(dir.path().join(PROJECTS_FILE)).unwrap(),
            before
        );
    }
}
