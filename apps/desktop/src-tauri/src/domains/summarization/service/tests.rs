use super::*;
use url::Url;
use wiremock::matchers::{body_string_contains, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn config_pointing_at(screenpipe: &MockServer) -> ProviderConfig {
    ProviderConfig {
        screenpipe_url: Url::parse(&screenpipe.uri()).unwrap(),
        existing_ollama_url: Url::parse("http://127.0.0.1:1").unwrap(), // unreachable
        bundled_ollama_url: Url::parse("http://127.0.0.1:1").unwrap(),  // unreachable
        bundled_ollama_binary: std::path::PathBuf::from("/nonexistent/ollama"),
    }
}

fn config_with_both(screenpipe: &MockServer, ollama: &MockServer) -> ProviderConfig {
    ProviderConfig {
        screenpipe_url: Url::parse(&screenpipe.uri()).unwrap(),
        existing_ollama_url: Url::parse(&ollama.uri()).unwrap(),
        bundled_ollama_url: Url::parse("http://127.0.0.1:1").unwrap(), // unreachable
        bundled_ollama_binary: std::path::PathBuf::from("/nonexistent/ollama"),
    }
}

async fn stub_apple_intelligence_unavailable(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/ai/status"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "available": false
        })))
        .mount(server)
        .await;
}

async fn stub_apple_intelligence_available(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/ai/status"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "available": true
        })))
        .mount(server)
        .await;
}

#[tokio::test]
async fn resolve_picks_apple_intelligence_when_screenpipe_reports_available() {
    let screenpipe = MockServer::start().await;
    stub_apple_intelligence_available(&screenpipe).await;

    let provider = LlmProvider::resolve(config_pointing_at(&screenpipe), reqwest::Client::new())
        .await
        .expect("resolve should pick Apple Intelligence");
    assert_eq!(provider.tier(), Tier::AppleIntelligence);
}

#[tokio::test]
async fn resolve_falls_through_to_existing_ollama_when_apple_intelligence_unavailable() {
    let screenpipe = MockServer::start().await;
    let ollama = MockServer::start().await;
    stub_apple_intelligence_unavailable(&screenpipe).await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [{ "name": "qwen3.5:0.8b", "size": 942_656_512u64 }]
        })))
        .mount(&ollama)
        .await;

    let provider = LlmProvider::resolve(
        config_with_both(&screenpipe, &ollama),
        reqwest::Client::new(),
    )
    .await
    .expect("resolve should pick existing Ollama");
    assert_eq!(provider.tier(), Tier::ExistingOllama);
}

#[tokio::test]
async fn tier_two_falls_back_to_first_installed_model_under_5gb() {
    let screenpipe = MockServer::start().await;
    let ollama = MockServer::start().await;
    stub_apple_intelligence_unavailable(&screenpipe).await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": []
        })))
        .mount(&ollama)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [
                { "name": "llama3:13b", "size": 13_000_000_000u64 },
                { "name": "phi3:mini",  "size":  2_000_000_000u64 }
            ]
        })))
        .mount(&ollama)
        .await;
    Mock::given(method("POST"))
        .and(path("/api/generate"))
        .and(body_string_contains("\"model\":\"phi3:mini\""))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "response": "summary"
        })))
        .expect(1)
        .mount(&ollama)
        .await;

    let provider = LlmProvider::resolve(
        config_with_both(&screenpipe, &ollama),
        reqwest::Client::new(),
    )
    .await
    .unwrap();
    assert_eq!(provider.tier(), Tier::ExistingOllama);
    provider.summarize("a").await.unwrap();
}

#[tokio::test]
async fn tier_two_returns_unavailable_when_no_small_model_and_bundled_path_unwired() {
    let screenpipe = MockServer::start().await;
    let ollama = MockServer::start().await;
    stub_apple_intelligence_unavailable(&screenpipe).await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": []
        })))
        .mount(&ollama)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [
                { "name": "llama3:70b", "size": 70_000_000_000u64 }
            ]
        })))
        .mount(&ollama)
        .await;

    let result = LlmProvider::resolve(
        config_with_both(&screenpipe, &ollama),
        reqwest::Client::new(),
    )
    .await;
    assert!(matches!(result, Err(ProviderError::Unavailable)));
}

#[tokio::test]
async fn tier_two_summarize_uses_loaded_model_against_api_generate() {
    let screenpipe = MockServer::start().await;
    let ollama = MockServer::start().await;
    stub_apple_intelligence_unavailable(&screenpipe).await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [{ "name": "qwen3.5:0.8b", "size": 942_656_512u64 }]
        })))
        .mount(&ollama)
        .await;
    Mock::given(method("POST"))
        .and(path("/api/generate"))
        .and(body_string_contains("\"model\":\"qwen3.5:0.8b\""))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "response": "summary text"
        })))
        .expect(1)
        .mount(&ollama)
        .await;

    let provider = LlmProvider::resolve(
        config_with_both(&screenpipe, &ollama),
        reqwest::Client::new(),
    )
    .await
    .unwrap();
    let out = provider
        .summarize("activity")
        .await
        .expect("summarize should succeed");
    assert_eq!(out, "summary text");
}

#[tokio::test]
async fn summarize_prompt_includes_privacy_constraints() {
    let screenpipe = MockServer::start().await;
    stub_apple_intelligence_available(&screenpipe).await;
    Mock::given(method("POST"))
        .and(path("/ai/chat/completions"))
        .and(body_string_contains("passwords"))
        .and(body_string_contains("credentials"))
        .and(body_string_contains("financial data"))
        .and(body_string_contains("personal identifiers"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{ "message": { "content": "ok" } }]
        })))
        .expect(1)
        .mount(&screenpipe)
        .await;

    let provider = LlmProvider::resolve(config_pointing_at(&screenpipe), reqwest::Client::new())
        .await
        .unwrap();
    provider
        .summarize("anything")
        .await
        .expect("summarize should succeed");
}

#[tokio::test]
async fn tier_two_uses_existing_ollama_url_not_bundled() {
    // The bundled URL must be a separate field on ProviderConfig and must NOT
    // be consulted on the Tier 2 path. We wire `existing_ollama_url` at our
    // mock server and `bundled_ollama_url` at an unreachable address — if the
    // code accidentally probes the bundled URL during Tier 2 resolution the
    // mock won't see the request and the test fails. ADR-0013.
    let screenpipe = MockServer::start().await;
    let existing_ollama = MockServer::start().await;
    stub_apple_intelligence_unavailable(&screenpipe).await;
    Mock::given(method("GET"))
        .and(path("/api/ps"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [{ "name": "qwen3.5:0.8b", "size": 942_656_512u64 }]
        })))
        .expect(1)
        .mount(&existing_ollama)
        .await;

    let config = ProviderConfig {
        screenpipe_url: Url::parse(&screenpipe.uri()).unwrap(),
        existing_ollama_url: Url::parse(&existing_ollama.uri()).unwrap(),
        bundled_ollama_url: Url::parse("http://127.0.0.1:1").unwrap(),
        bundled_ollama_binary: std::path::PathBuf::from("/nonexistent/ollama"),
    };

    let provider = LlmProvider::resolve(config, reqwest::Client::new())
        .await
        .expect("Tier 2 should resolve via existing_ollama_url");
    assert_eq!(provider.tier(), Tier::ExistingOllama);
}

#[tokio::test]
async fn provider_config_default_has_distinct_existing_and_bundled_urls() {
    let cfg = ProviderConfig::default();
    assert_eq!(cfg.existing_ollama_url.as_str(), "http://localhost:11434/");
    assert_eq!(cfg.bundled_ollama_url.as_str(), "http://localhost:44381/");
}

#[tokio::test]
async fn summarize_via_apple_intelligence_returns_model_text() {
    let screenpipe = MockServer::start().await;
    stub_apple_intelligence_available(&screenpipe).await;
    Mock::given(method("POST"))
        .and(path("/ai/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "choices": [{
                "message": { "content": "user reviewed a PR for 60 seconds" }
            }]
        })))
        .mount(&screenpipe)
        .await;

    let provider = LlmProvider::resolve(config_pointing_at(&screenpipe), reqwest::Client::new())
        .await
        .unwrap();
    let summary = provider
        .summarize("OCR: 'PR #42'\nwindow: GitHub")
        .await
        .unwrap();
    assert_eq!(summary, "user reviewed a PR for 60 seconds");
}
