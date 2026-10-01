//! `url.exposed` against local HTTP servers (wiremock).

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::*;

const ENV_FILE: &str = "APP_NAME=Shop\nAPP_KEY=base64:CANARY_app_key_value\nDB_PASSWORD=CANARY_db_pw\n# note\nexport MAIL_HOST=smtp.example\n";

fn check() -> ExposedCheck {
    ExposedCheck::new(Duration::from_secs(5), Duration::from_secs(10))
}

async fn run(url: &str) -> (CheckFact, Option<ProbeError>) {
    check().run(url, &Url::parse(url).unwrap()).await
}

async fn serve(path_: &str, status: u16, body: &str) -> Mock {
    Mock::given(method("GET"))
        .and(path(path_))
        .respond_with(ResponseTemplate::new(status).set_body_string(body))
}

fn keys(f: &CheckFact) -> Vec<String> {
    serde_json::from_value(f.data["matched_keys"].clone()).unwrap()
}

#[tokio::test]
async fn a_site_serving_env_and_git_head_is_exposed_with_key_names_only() {
    let server = MockServer::start().await;
    serve("/.env", 200, ENV_FILE).await.mount(&server).await;
    serve("/.git/HEAD", 200, "ref: refs/heads/main\n")
        .await
        .mount(&server)
        .await;
    let url = format!("{}/shop?token=s3cret", server.uri());
    let (f, err) = run(&url).await;
    assert_eq!(err, None);
    assert_eq!(
        (f.check.as_str(), f.target.as_str()),
        ("url.exposed", url.as_str())
    );
    assert_eq!(f.value, Some(2.0));
    assert_eq!(f.data["exposed"], true);
    assert_eq!(
        keys(&f),
        [
            "/.env:APP_NAME",
            "/.env:APP_KEY",
            "/.env:DB_PASSWORD",
            "/.env:MAIL_HOST",
            "/.git/HEAD:ref"
        ]
    );
    // The fact holds names, never a value or any of the body.
    let text = serde_json::to_string(&f).unwrap();
    assert!(!text.contains("CANARY"), "{text}");
    assert!(!text.contains("smtp.example"), "{text}");
    // Only the two keys of the fact's data exist.
    let mut names: Vec<&str> = f
        .data
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    names.sort_unstable();
    assert_eq!(names, ["exposed", "matched_keys"]);
    // The query of the configured URL is not sent along.
    for r in server.received_requests().await.unwrap() {
        assert_eq!(r.url.query(), None, "{}", r.url);
    }
}

#[tokio::test]
async fn one_exposed_file_counts_once_and_a_bare_commit_hash_is_a_head() {
    let server = MockServer::start().await;
    serve("/.git/HEAD", 200, &format!("{}\n", "a".repeat(40)))
        .await
        .mount(&server)
        .await;
    serve("/.env", 404, "not found").await.mount(&server).await;
    let (f, _) = run(&server.uri()).await;
    assert_eq!(f.value, Some(1.0));
    assert_eq!(keys(&f), ["/.git/HEAD:sha"]);
}

#[tokio::test]
async fn a_site_that_serves_nothing_there_is_clean() {
    let server = MockServer::start().await;
    let (f, err) = run(&server.uri()).await; // wiremock answers 404
    assert_eq!(err, None);
    assert_eq!(f.value, Some(0.0));
    assert_eq!(f.data["exposed"], false);
    assert_eq!(keys(&f), Vec::<String>::new());
    assert_eq!(f.unknown, None);
}

/// A single-page app answers 200 with its index for every path; so does a
/// custom error page. Neither is the file.
#[tokio::test]
async fn a_200_that_does_not_look_like_the_file_is_clean() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("<!doctype html><html><body>APP_KEY=not a dotenv</body></html>"),
        )
        .mount(&server)
        .await;
    let (f, _) = run(&server.uri()).await;
    assert_eq!(f.value, Some(0.0), "{f:?}");

    let server = MockServer::start().await;
    serve("/.env", 200, "Welcome to nginx!\nrefs/heads\n")
        .await
        .mount(&server)
        .await;
    serve("/.git/HEAD", 200, "ref: nonsense\n")
        .await
        .mount(&server)
        .await;
    let (f, _) = run(&server.uri()).await;
    assert_eq!(f.value, Some(0.0), "{f:?}");
}

#[tokio::test]
async fn at_most_four_kib_of_a_body_is_read() {
    // A 1 MiB body whose first line is the file; and a dotenv whose keys only
    // start after the first 4 KiB, which are therefore not seen.
    let server = MockServer::start().await;
    let early = format!("ref: refs/heads/main\n{}", "pad\n".repeat(300_000));
    serve("/.git/HEAD", 200, &early).await.mount(&server).await;
    let late = format!("{}APP_KEY=x\n", "pad\n".repeat(2_000));
    serve("/.env", 200, &late).await.mount(&server).await;
    let (f, _) = run(&server.uri()).await;
    assert_eq!(keys(&f), ["/.git/HEAD:ref"]);
    assert_eq!(f.value, Some(1.0));
}

#[tokio::test]
async fn a_redirect_on_the_same_host_is_followed() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.env"))
        .respond_with(ResponseTemplate::new(301).insert_header("location", "/files/dotenv"))
        .mount(&server)
        .await;
    serve("/files/dotenv", 200, ENV_FILE)
        .await
        .mount(&server)
        .await;
    let (f, _) = run(&server.uri()).await;
    assert_eq!(f.value, Some(1.0));
    assert_eq!(keys(&f)[0], "/.env:APP_NAME");
}

/// `127.0.0.1` and `localhost` are different hosts: a redirect from one to
/// the other leaves the site, so the file behind it is not asked for.
#[tokio::test]
async fn a_redirect_to_another_host_is_not_followed() {
    let elsewhere = MockServer::start().await;
    serve("/.env", 200, ENV_FILE).await.mount(&elsewhere).await;
    serve("/.git/HEAD", 200, "ref: refs/heads/main\n")
        .await
        .mount(&elsewhere)
        .await;
    let other_port = elsewhere.address().port();

    let site = MockServer::start().await;
    for file in ["/.env", "/.git/HEAD"] {
        Mock::given(method("GET"))
            .and(path(file))
            .respond_with(
                ResponseTemplate::new(302)
                    .insert_header("location", format!("http://localhost:{other_port}{file}")),
            )
            .mount(&site)
            .await;
    }
    let (f, err) = run(&site.uri()).await;
    // The real site was never read, so it is not reported clean.
    assert_eq!(err, None);
    assert_eq!(f.value, None, "{f:?}");
    assert_eq!(f.unknown, Some(UnknownReason::Unsupported), "{f:?}");
    assert_eq!(f.data, json!({"error": "redirect_other_host"}));
    assert_eq!(
        elsewhere.received_requests().await.unwrap().len(),
        0,
        "the other host was contacted"
    );
}

/// A file that is exposed stays a finding even when the other one redirected away.
#[tokio::test]
async fn a_finding_stands_when_the_other_file_redirects_away() {
    let site = MockServer::start().await;
    serve("/.env", 200, ENV_FILE).await.mount(&site).await;
    Mock::given(method("GET"))
        .and(path("/.git/HEAD"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "http://localhost:1/x"))
        .mount(&site)
        .await;
    let (f, _) = run(&site.uri()).await;
    assert_eq!(f.value, Some(1.0), "{f:?}");
    assert_eq!(f.unknown, None);
}

#[tokio::test]
async fn a_redirect_loop_stops() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "/.env"))
        .mount(&server)
        .await;
    let (f, err) = run(&server.uri()).await;
    // After five redirects the answer is the redirect itself: no file read.
    assert_eq!(err, None);
    assert_eq!(f.unknown, Some(UnknownReason::Unsupported), "{f:?}");
    assert_eq!(f.data, json!({"error": "redirects"}));
    assert_eq!(
        server.received_requests().await.unwrap().len(),
        2 * MAX_REDIRECTS
    );
}

#[tokio::test]
async fn failures_are_unknown_unless_something_was_found() {
    let port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        l.local_addr().unwrap().port()
    };
    let (f, err) = run(&format!("http://127.0.0.1:{port}")).await;
    assert_eq!(err, Some(ProbeError::Refused));
    assert_eq!(f.unknown, Some(UnknownReason::Unreachable));
    assert_eq!(f.value, None);

    let slow = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(3)))
        .mount(&slow)
        .await;
    let url = slow.uri();
    let quick = ExposedCheck::new(Duration::from_secs(1), Duration::from_millis(300));
    let (f, err) = quick.run(&url, &Url::parse(&url).unwrap()).await;
    assert_eq!(err, Some(ProbeError::Timeout));
    assert_eq!(f.unknown, Some(UnknownReason::Timeout));

    // One file exposed, the other request failing: the finding stands.
    let partly = MockServer::start().await;
    serve("/.env", 200, ENV_FILE).await.mount(&partly).await;
    Mock::given(method("GET"))
        .and(path("/.git/HEAD"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(3)))
        .mount(&partly)
        .await;
    let url = partly.uri();
    let (f, err) = quick.run(&url, &Url::parse(&url).unwrap()).await;
    assert_eq!(err, None);
    assert_eq!(f.value, Some(1.0));
    assert_eq!(f.unknown, None);
}

#[test]
fn dotenv_keys_table() {
    let cases: &[(&str, &[&str])] = &[
        ("A_B=1\nlower=2\nX=3\n9X=4\n", &["A_B", "lower"]),
        ("  export DB_HOST = x\nDB_HOST=y\n", &["DB_HOST"]),
        ("\u{feff}APP_KEY=x\n", &["APP_KEY"]),
        ("\u{feff}<html>\nAPP_KEY=x\n", &[]),
        (
            "db_password = x\nspring.datasource.url=y\n_PRIVATE=1\n",
            &["db_password", "spring.datasource.url", "_PRIVATE"],
        ),
        ("a=b\n", &[]),
        ("# DB_PASSWORD=x\n", &[]),
        ("<html>\nAPP_KEY=x\n", &[]),
        ("APP_KEY=x\n<b>bold</b>\n", &["APP_KEY"]),
        ("APP_KEY=x\0\n", &[]),
        ("", &[]),
        ("KEY WITH SPACE=1\nAPP-KEY=2\n", &[]),
    ];
    for (body, want) in cases {
        assert_eq!(env_keys(body), *want, "{body:?}");
    }
    let many: String = (0..40).map(|i| format!("KEY_{i}=1\n")).collect();
    assert_eq!(env_keys(&many).len(), MAX_KEYS);
}

#[test]
fn git_head_table() {
    let sha = "0123456789abcdef0123456789abcdef01234567";
    assert_eq!(git_head("ref: refs/heads/main\n"), Some("ref"));
    assert_eq!(git_head(&format!("{sha}\n")), Some("sha"));
    assert_eq!(git_head(&"f".repeat(64)), Some("sha"));
    for no in [
        "",
        "ref: x",
        "<html>",
        "not-hex-0123456789abcdef0123456789abcdef012",
        "abc",
    ] {
        assert_eq!(git_head(no), None, "{no:?}");
    }
}
