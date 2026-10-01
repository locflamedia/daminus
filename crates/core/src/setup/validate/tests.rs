use serde_json::json;

use super::*;
use crate::probe::UrlWarning;

fn project(v: serde_json::Value) -> Project {
    serde_json::from_value(v).unwrap()
}

fn alias(s: &str) -> HostAlias {
    HostAlias::parse(s).unwrap()
}

fn codes(issues: &[ProjectIssue]) -> Vec<(String, IssueField, IssueCode)> {
    issues
        .iter()
        .map(|i| (i.project.clone(), i.field, i.code))
        .collect()
}

fn good() -> Project {
    project(json!({
        "id": "shop", "name": "Shop", "urls": ["https://shop-x.com"],
        "components": [{"role": "fe", "host": "vps-a", "kind": "path", "path": "/srv/shop"}]
    }))
}

#[test]
fn a_good_project_has_no_issues() {
    assert!(validate(&[good()], None).is_empty());
    assert!(validate(&[good()], Some(&[alias("vps-a")])).is_empty());
    assert!(!has_errors(&[]));
}

#[test]
fn ids_names_and_emptiness() {
    let mut empty_id = good();
    empty_id.id = String::new();
    let mut bad_id = good();
    bad_id.id = "-rm -rf".into();
    let mut blank_name = good();
    blank_name.name = "  ".into();
    let nothing =
        project(json!({"id": "nothing", "name": "Nothing", "urls": [" "], "components": []}));
    let issues = validate(&[empty_id, bad_id, blank_name, nothing], None);
    assert_eq!(
        codes(&issues),
        [
            ("".into(), IssueField::Id, IssueCode::Empty),
            ("-rm -rf".into(), IssueField::Id, IssueCode::BadId),
            ("shop".into(), IssueField::Name, IssueCode::Empty),
            ("nothing".into(), IssueField::Project, IssueCode::Empty),
        ]
    );
    assert!(has_errors(&issues));
    assert!(issues.iter().all(|i| i.level == IssueLevel::Error));
}

#[test]
fn a_taken_id_is_an_error() {
    let issues = validate(&[good(), good()], None);
    assert_eq!(
        codes(&issues),
        [("shop".into(), IssueField::Id, IssueCode::DuplicateId)]
    );
    assert!(has_errors(&issues));
}

#[test]
fn urls_that_are_not_http_are_errors() {
    let mut p = good();
    p.urls = vec![
        "shop-x.com".into(),
        "ftp://shop-x.com".into(),
        "javascript:alert(1)".into(),
        "https://".into(),
        "https://ok.example.com".into(),
    ];
    let issues = validate(&[p], None);
    assert_eq!(
        codes(&issues)
            .iter()
            .map(|(_, f, c)| (*f, *c))
            .collect::<Vec<_>>(),
        [
            (IssueField::Url { index: 0 }, IssueCode::UrlInvalid),
            (IssueField::Url { index: 1 }, IssueCode::UrlInvalid),
            (IssueField::Url { index: 2 }, IssueCode::UrlInvalid),
            (IssueField::Url { index: 3 }, IssueCode::UrlInvalid),
        ]
    );
    assert!(is_probeable_url(" https://ok.example.com/path?x=1 "));
}

/// The debt from the URL checks: a URL that only this Mac can reach is a
/// warning, never a reason to refuse the save.
#[test]
fn urls_only_this_mac_can_reach_are_warned_about_not_refused() {
    let mut p = good();
    p.urls = vec![
        "http://localhost:3000".into(),
        "http://10.0.0.5".into(),
        "https://192.168.1.20:8443/health".into(),
        "http://169.254.10.1".into(),
        "https://intranet".into(),
        "http://app.internal".into(),
        "https://shop-x.com".into(),
    ];
    let issues = validate(&[p], None);
    let got: Vec<(IssueField, IssueCode)> = issues.iter().map(|i| (i.field, i.code)).collect();
    assert_eq!(
        got,
        [
            (
                IssueField::Url { index: 0 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::Loopback
                }
            ),
            (
                IssueField::Url { index: 1 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::PrivateNetwork
                }
            ),
            (
                IssueField::Url { index: 2 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::PrivateNetwork
                }
            ),
            (
                IssueField::Url { index: 3 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::LinkLocal
                }
            ),
            (
                IssueField::Url { index: 4 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::PrivateNetwork
                }
            ),
            (
                IssueField::Url { index: 5 },
                IssueCode::UrlLocalOnly {
                    warning: UrlWarning::PrivateNetwork
                }
            ),
        ]
    );
    assert!(issues.iter().all(|i| i.level == IssueLevel::Warning));
    assert!(!has_errors(&issues));
}

#[test]
fn repeated_urls_and_components_and_unknown_hosts_are_warnings() {
    let mut p = good();
    p.urls = vec!["https://shop-x.com".into(), " https://shop-x.com ".into()];
    let c = p.components[0].clone();
    p.components.push(c);
    p.components.push(
        serde_json::from_value(
            json!({"role": "be", "host": "vps-z", "kind": "compose", "project": "shop"}),
        )
        .unwrap(),
    );
    let issues = validate(&[p], Some(&[alias("vps-a")]));
    let got: Vec<(IssueField, IssueCode)> = issues.iter().map(|i| (i.field, i.code)).collect();
    assert_eq!(
        got,
        [
            (IssueField::Url { index: 1 }, IssueCode::UrlDuplicate),
            (
                IssueField::Component { index: 1 },
                IssueCode::ComponentDuplicate
            ),
            (IssueField::Component { index: 2 }, IssueCode::UnknownHost),
        ]
    );
    assert!(!has_errors(&issues));
}

#[test]
fn normalizing_trims_and_drops_empty_and_repeated_urls() {
    let mut p = good();
    p.name = "  Shop  ".into();
    p.urls = vec![
        " https://shop-x.com ".into(),
        "".into(),
        "https://shop-x.com".into(),
        "https://api.shop-x.com".into(),
    ];
    let n = normalized(p);
    assert_eq!(n.name, "Shop");
    assert_eq!(n.urls, ["https://shop-x.com", "https://api.shop-x.com"]);
}

#[test]
fn issues_survive_json_for_the_ui() {
    let mut p = good();
    p.urls = vec!["http://localhost:3000".into()];
    let issues = validate(&[p], None);
    let json = serde_json::to_value(&issues).unwrap();
    assert_eq!(
        json,
        json!([{
            "project": "shop",
            "field": {"kind": "url", "index": 0},
            "level": "warning",
            "code": {"kind": "url_local_only", "warning": "loopback"}
        }])
    );
    assert_eq!(
        serde_json::from_value::<Vec<ProjectIssue>>(json).unwrap(),
        issues
    );
}
