//! Checking the projects the user edited before they are saved to
//! `projects.json`.
//!
//! Names and paths inside components were already checked when the project
//! was read (`ComponentKind` refuses what could not be passed to a server
//! script safely), so what is left is what only the whole set can show: an
//! id that is taken, an empty project, a URL that is not a URL, and a URL
//! that only means something on this Mac (`probe::url_warning`).

use std::collections::BTreeSet;

use reqwest::Url;
use serde::{Deserialize, Serialize};

use crate::domain::host::HostAlias;
use crate::domain::project::{Project, is_plain_name};
use crate::probe::{UrlWarning, url_warning};

/// How serious an issue is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum IssueLevel {
    /// The project cannot be saved like this.
    Error,
    /// It can be saved; the user is told.
    Warning,
}

/// Which part of the project an issue is about.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum IssueField {
    Id,
    Name,
    /// Entry `index` of `urls`.
    Url {
        index: u32,
    },
    /// Entry `index` of `components`.
    Component {
        index: u32,
    },
    /// The project as a whole.
    Project,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub enum IssueCode {
    /// A name or id is empty, or the project has neither a URL nor a component.
    Empty,
    /// The id is not letters, digits, `.`, `_` and `-`, starting with a letter or digit.
    BadId,
    /// Another project in this save has the same id.
    DuplicateId,
    /// The URL is not an `http` or `https` address.
    UrlInvalid,
    /// The URL points at something only this Mac can reach (loopback, private
    /// network, link-local): the checks run from here and would measure this
    /// Mac's own view. It is still saved and probed if the user keeps it.
    UrlLocalOnly { warning: UrlWarning },
    /// The same URL twice in one project.
    UrlDuplicate,
    /// The component is listed twice.
    ComponentDuplicate,
    /// The component's host is not in `~/.ssh/config`.
    UnknownHost,
}

impl IssueCode {
    pub fn level(&self) -> IssueLevel {
        match self {
            IssueCode::Empty
            | IssueCode::BadId
            | IssueCode::DuplicateId
            | IssueCode::UrlInvalid => IssueLevel::Error,
            IssueCode::UrlLocalOnly { .. }
            | IssueCode::UrlDuplicate
            | IssueCode::ComponentDuplicate
            | IssueCode::UnknownHost => IssueLevel::Warning,
        }
    }
}

/// One thing to tell the user about a project.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct ProjectIssue {
    /// The project's id (what the user typed, so possibly empty or taken).
    pub project: String,
    pub field: IssueField,
    pub level: IssueLevel,
    pub code: IssueCode,
}

fn issue(project: &str, field: IssueField, code: IssueCode) -> ProjectIssue {
    ProjectIssue {
        project: project.to_owned(),
        field,
        level: code.level(),
        code,
    }
}

fn index(i: usize) -> u32 {
    u32::try_from(i).unwrap_or(u32::MAX)
}

/// Whether `url` is an `http` or `https` address with a host.
pub fn is_probeable_url(url: &str) -> bool {
    Url::parse(url.trim())
        .ok()
        .is_some_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
}

/// Everything wrong or doubtful about `projects`, in project order. `known`
/// is the hosts of `~/.ssh/config`; `None` skips the host check (there is no
/// config to compare with).
pub fn validate(projects: &[Project], known: Option<&[HostAlias]>) -> Vec<ProjectIssue> {
    let mut out = Vec::new();
    let mut ids = BTreeSet::new();
    for p in projects {
        let id = p.id.as_str();
        if id.is_empty() {
            out.push(issue(id, IssueField::Id, IssueCode::Empty));
        } else if !is_plain_name(id) {
            out.push(issue(id, IssueField::Id, IssueCode::BadId));
        } else if !ids.insert(id.to_owned()) {
            out.push(issue(id, IssueField::Id, IssueCode::DuplicateId));
        }
        if p.name.trim().is_empty() {
            out.push(issue(id, IssueField::Name, IssueCode::Empty));
        }
        if p.urls.iter().all(|u| u.trim().is_empty()) && p.components.is_empty() {
            out.push(issue(id, IssueField::Project, IssueCode::Empty));
        }
        let mut seen_urls = BTreeSet::new();
        for (i, url) in p.urls.iter().enumerate() {
            let field = IssueField::Url { index: index(i) };
            let url = url.trim();
            if url.is_empty() {
                continue;
            }
            if !is_probeable_url(url) {
                out.push(issue(id, field, IssueCode::UrlInvalid));
                continue;
            }
            if !seen_urls.insert(url.to_owned()) {
                out.push(issue(id, field, IssueCode::UrlDuplicate));
            }
            if let Some(warning) = url_warning(url) {
                out.push(issue(id, field, IssueCode::UrlLocalOnly { warning }));
            }
        }
        for (i, c) in p.components.iter().enumerate() {
            let field = IssueField::Component { index: index(i) };
            if p.components[..i].contains(c) {
                out.push(issue(id, field, IssueCode::ComponentDuplicate));
            }
            if known.is_some_and(|k| !k.contains(&c.host)) {
                out.push(issue(id, field, IssueCode::UnknownHost));
            }
        }
    }
    out
}

/// Whether any issue stops a save.
pub fn has_errors(issues: &[ProjectIssue]) -> bool {
    issues.iter().any(|i| i.level == IssueLevel::Error)
}

/// The project as it is saved: URLs trimmed, empty and repeated ones dropped,
/// the name trimmed.
pub fn normalized(mut project: Project) -> Project {
    project.name = project.name.trim().to_owned();
    let mut seen = BTreeSet::new();
    project.urls = project
        .urls
        .iter()
        .map(|u| u.trim().to_owned())
        .filter(|u| !u.is_empty() && seen.insert(u.clone()))
        .collect();
    project
}

#[cfg(test)]
mod tests;
