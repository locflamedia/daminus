//! The small judgements grouping is built from: which names are real
//! domains, which domain two names share, which folder is "the project".

use std::net::IpAddr;

/// Folders every site on a server shares: nothing is learned from two items
/// sitting under one of them.
const GENERIC: &[&str] = &[
    "/var",
    "/var/www",
    "/var/www/html",
    "/www",
    "/www/wwwroot",
    "/var/lib",
    "/usr",
    "/usr/local",
    "/usr/share",
    "/usr/share/nginx",
    "/usr/share/nginx/html",
    "/etc",
    "/home",
    "/root",
    "/opt",
    "/srv",
    "/tmp",
    "/data",
    "/app",
    "/mnt",
];

/// Folder names a web root usually has under the project folder.
const WEB_SUBDIRS: &[&str] = &[
    "public",
    "public_html",
    "html",
    "www",
    "htdocs",
    "web",
    "webroot",
    "wwwroot",
    "dist",
    "build",
    "out",
    "static",
    "current",
];

/// Second-level labels under a two-letter country code (`co.uk`, `com.vn`).
const SECOND_LEVEL: &[&str] = &[
    "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go",
];

/// Name endings that only resolve inside a network.
const PRIVATE_SUFFIXES: &[&str] = &[".local", ".internal", ".lan", ".localhost", ".localdomain"];

/// `path` without trailing slashes; `None` unless it is absolute.
pub fn normalize(path: &str) -> Option<String> {
    if !path.starts_with('/') {
        return None;
    }
    let trimmed = path.trim_end_matches('/');
    Some(if trimmed.is_empty() { "/" } else { trimmed }.to_owned())
}

/// Whether many unrelated projects live under `path` (or it is no folder of
/// any project at all).
pub fn is_generic(path: &str) -> bool {
    let p = path.trim_end_matches('/');
    let depth = p.split('/').filter(|s| !s.is_empty()).count();
    depth == 0 || GENERIC.contains(&p) || (depth == 2 && p.starts_with("/home/"))
}

/// The folder a web root, working folder or `.env` belongs to: web folder
/// names (`public`, `dist`, `current`…) are taken off while what is left is
/// still a project folder. `None` when nothing but a shared folder is left.
pub fn project_dir(path: &str) -> Option<String> {
    let mut dir = normalize(path)?;
    while let Some((parent, last)) = dir.rsplit_once('/') {
        if WEB_SUBDIRS.contains(&last) && !is_generic(parent) {
            dir = parent.to_owned();
        } else {
            break;
        }
    }
    (!is_generic(&dir)).then_some(dir)
}

/// Whether one folder is the other or inside it.
pub fn related(a: &str, b: &str) -> bool {
    a == b
        || a.strip_prefix(b).is_some_and(|rest| rest.starts_with('/'))
        || b.strip_prefix(a).is_some_and(|rest| rest.starts_with('/'))
}

/// The folder of a file path.
pub fn parent(path: &str) -> Option<&str> {
    path.rsplit_once('/')
        .map(|(dir, _)| if dir.is_empty() { "/" } else { dir })
}

/// A last path segment.
pub fn base_name(path: &str) -> &str {
    path.rsplit('/').find(|s| !s.is_empty()).unwrap_or("")
}

/// Whether `name` is a public domain a visitor could type: not a wildcard,
/// `_`, an IP address or a name that only resolves inside a network.
pub fn is_public_domain(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    !n.contains('*')
        && n.contains('.')
        && n != "localhost"
        && n.parse::<IpAddr>().is_err()
        && !PRIVATE_SUFFIXES.iter().any(|s| n.ends_with(s))
        && n.split('.').all(|l| !l.is_empty())
}

/// The domain a name belongs to: `www.` taken off, then the last two labels
/// (three under `co.uk`, `com.vn`…).
pub fn apex(name: &str) -> String {
    let n = name.to_ascii_lowercase();
    let n = n.strip_prefix("www.").unwrap_or(&n);
    let labels: Vec<&str> = n.split('.').collect();
    let keep = match labels.as_slice() {
        [.., second, last] if last.len() == 2 && SECOND_LEVEL.contains(second) => 3,
        _ => 2,
    };
    labels[labels.len().saturating_sub(keep)..].join(".")
}

/// The first label of a domain (`shop-x.com` → `shop-x`).
pub fn first_label(domain: &str) -> &str {
    domain.split('.').next().unwrap_or(domain)
}

/// An id from a name: lower-case letters and digits, one `-` between runs.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-');
    if out.is_empty() { "project" } else { out }.to_owned()
}

/// The port of a `proxy_pass` target that stays on this server
/// (`127.0.0.1:3000`, `localhost:8081`, `[::1]:9000`).
pub fn local_proxy_port(proxy: &str) -> Option<u16> {
    let (host, port) = proxy.rsplit_once(':')?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let local = matches!(host, "127.0.0.1" | "localhost" | "::1" | "0.0.0.0");
    if local { port.parse().ok() } else { None }
}

/// Whether a compose service or pm2 app name says "background job".
pub fn is_worker_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [
        "worker",
        "queue",
        "cron",
        "job",
        "scheduler",
        "consumer",
        "horizon",
    ]
    .iter()
    .any(|w| n.contains(w))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_folders_are_the_shared_ones() {
        for g in [
            "/",
            "/srv",
            "/var/www",
            "/var/www/html/",
            "/home",
            "/home/deploy",
            "/root",
            "/opt",
            "/usr/share/nginx/html",
            "/www",
            "/www/wwwroot/",
        ] {
            assert!(is_generic(g), "{g}");
        }
        for p in [
            "/srv/shop",
            "/var/www/shop",
            "/www/wwwroot/shop.example",
            "/home/deploy/shop",
            "/opt/app",
            "/data/x",
        ] {
            assert!(!is_generic(p), "{p}");
        }
    }

    #[test]
    fn project_dir_takes_web_folders_off_without_reaching_a_shared_one() {
        for (path, want) in [
            ("/var/www/shop/public", Some("/var/www/shop")),
            ("/var/www/shop/current/public", Some("/var/www/shop")),
            ("/srv/tiemtra-web/dist/", Some("/srv/tiemtra-web")),
            ("/srv/shop", Some("/srv/shop")),
            ("/srv/mono/web/build", Some("/srv/mono")),
            ("/var/www/html", None),
            ("/var/www", None),
            ("/usr/share/nginx/html", None),
            ("/home/deploy/public_html", Some("/home/deploy/public_html")),
            ("/home/deploy/app/public", Some("/home/deploy/app")),
            ("relative/path", None),
        ] {
            assert_eq!(project_dir(path).as_deref(), want, "{path}");
        }
    }

    #[test]
    fn folders_relate_by_whole_segments() {
        assert!(related("/srv/shop", "/srv/shop"));
        assert!(related("/srv/shop", "/srv/shop/api"));
        assert!(related("/srv/shop/api", "/srv/shop"));
        assert!(!related("/srv/shop", "/srv/shop-api"));
        assert!(!related("/srv/shop-api", "/srv/shop"));
    }

    #[test]
    fn apex_and_public_domain_rules() {
        for (name, want) in [
            ("shop-x.com", "shop-x.com"),
            ("www.shop-x.com", "shop-x.com"),
            ("api.shop-x.com", "shop-x.com"),
            ("a.b.shop-x.com", "shop-x.com"),
            ("khohang.vn", "khohang.vn"),
            ("api.shop.co.uk", "shop.co.uk"),
            ("www.shop.com.vn", "shop.com.vn"),
            ("Shop.COM", "shop.com"),
        ] {
            assert_eq!(apex(name), want, "{name}");
        }
        for ok in ["shop-x.com", "api.shop-x.com", "Shop.COM"] {
            assert!(is_public_domain(ok), "{ok}");
        }
        for no in [
            "_",
            "localhost",
            "*.shop-x.com",
            "203.0.113.5",
            "::1",
            "app.local",
            "db.internal",
            "intranet",
            "a..com",
        ] {
            assert!(!is_public_domain(no), "{no}");
        }
    }

    #[test]
    fn slug_and_names() {
        assert_eq!(slug("Shop X"), "shop-x");
        assert_eq!(slug("--a__b--"), "a-b");
        assert_eq!(slug("***"), "project");
        assert_eq!(first_label("shop-x.com"), "shop-x");
        assert_eq!(base_name("/srv/shop/"), "shop");
        assert_eq!(parent("/srv/shop/.env"), Some("/srv/shop"));
        assert_eq!(parent("/.env"), Some("/"));
        assert!(is_worker_name("tiemtra-cron"));
        assert!(is_worker_name("Queue-Worker"));
        assert!(!is_worker_name("api"));
    }

    #[test]
    fn proxy_ports_count_only_on_this_server() {
        assert_eq!(local_proxy_port("127.0.0.1:3000"), Some(3000));
        assert_eq!(local_proxy_port("localhost:8081"), Some(8081));
        assert_eq!(local_proxy_port("[::1]:9000"), Some(9000));
        assert_eq!(local_proxy_port("10.0.0.5:3000"), None);
        assert_eq!(local_proxy_port("127.0.0.1"), None);
        assert_eq!(local_proxy_port("app"), None);
        assert_eq!(local_proxy_port("unix:/run/x.sock"), None);
    }
}
