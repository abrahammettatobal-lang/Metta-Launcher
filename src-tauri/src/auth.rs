use crate::db::Db;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const DEFAULT_MS_CLIENT_ID: &str = "00000000402b5328";
const MS_TENANT: &str = "common";
const MS_SCOPE: &str = "XboxLive.signin offline_access";
const KEYRING_SERVICE: &str = "com.metta.launcher";

fn ms_client_id(db: &Db) -> String {
  match db.setting_get("microsoftClientId") {
    Ok(Some(v)) if !v.trim().is_empty() => v,
    _ => DEFAULT_MS_CLIENT_ID.to_string(),
  }
}

fn endpoint(path: &str) -> String {
  format!("https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/{path}")
}

pub fn format_uuid(raw: &str) -> String {
  let s: String = raw.chars().filter(|c| *c != '-').collect();
  if s.len() != 32 {
    return raw.to_string();
  }
  format!(
    "{}-{}-{}-{}-{}",
    &s[0..8],
    &s[8..12],
    &s[12..16],
    &s[16..20],
    &s[20..32]
  )
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeStart {
  pub device_code: String,
  pub user_code: String,
  pub verification_uri: String,
  pub expires_in: i64,
  pub interval: i64,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
  device_code: String,
  user_code: String,
  verification_uri: String,
  expires_in: i64,
  interval: i64,
}

#[derive(Debug, Deserialize)]
struct PollErrorBody {
  error: String,
  error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
  access_token: Option<String>,
  refresh_token: Option<String>,
  expires_in: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftSession {
  pub access_token: String,
  pub uuid: String,
  pub username: String,
  pub user_type: String,
  pub xuid: Option<String>,
  pub expires_at_epoch_ms: Option<i64>,
}

pub async fn microsoft_start_device_flow(
  client: &Client,
  db: &Db,
) -> Result<DeviceCodeStart, String> {
  let client_id = ms_client_id(db);
  let body = format!(
    "client_id={}&scope={}",
    urlencoding::encode(&client_id),
    urlencoding::encode(MS_SCOPE)
  );
  let res = client
    .post(endpoint("devicecode"))
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if !res.status().is_success() {
    return Err("No se pudo conectar con Microsoft.".to_string());
  }
  let parsed: DeviceCodeResponse = res
    .json()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  Ok(DeviceCodeStart {
    device_code: parsed.device_code,
    user_code: parsed.user_code,
    verification_uri: parsed.verification_uri,
    expires_in: parsed.expires_in,
    interval: parsed.interval.max(5),
  })
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum MicrosoftAuthOutcome {
  Pending,
  Success {
    account_id: String,
    username: String,
    uuid: String,
  },
  Error { message: String },
}

fn map_poll_error(error: &str, description: Option<String>) -> String {
  match error {
    "authorization_declined" => "El inicio de sesión fue cancelado.".into(),
    "expired_token" | "bad_verification_code" => "El código expiró. Vuelve a intentarlo.".into(),
    "authorization_pending" | "slow_down" => return String::new(),
    _ => description.unwrap_or_else(|| "No se pudo conectar con Microsoft.".into()),
  }
}

pub async fn microsoft_poll_device_code(
  client: &Client,
  db: &Db,
  device_code: &str,
) -> Result<MicrosoftAuthOutcome, String> {
  let client_id = ms_client_id(db);
  let body = format!(
    "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id={}&device_code={}",
    urlencoding::encode(&client_id),
    urlencoding::encode(device_code)
  );
  let res = client
    .post(endpoint("token"))
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if res.status().is_success() {
    let token: TokenResponse = res
      .json()
      .await
      .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
    let ms_access = token
      .access_token
      .ok_or_else(|| "No se pudo conectar con Microsoft.".to_string())?;
    let ms_expires = token.expires_in.map(|s| chrono::Utc::now().timestamp_millis() + s * 1000);
    let session = xbox_minecraft_chain(client, &ms_access).await?;
    let username = session.username.clone();
    let uuid_string = format_uuid(&session.uuid);
    let account_id = Uuid::new_v4().to_string();
    let secrets = StoredAccountSecrets {
      minecraft_access_token: session.access_token.clone(),
      refresh_token: token.refresh_token,
      ms_expires_at_epoch_ms: ms_expires,
      mc_expires_at_epoch_ms: session.expires_at_epoch_ms,
      xuid: session.xuid.clone(),
    };
    keyring_store_minecraft(&account_id, &secrets)?;
    return Ok(MicrosoftAuthOutcome::Success {
      account_id,
      username,
      uuid: uuid_string,
    });
  }
  let err: PollErrorBody = res.json().await.unwrap_or(PollErrorBody {
    error: "unknown_error".into(),
    error_description: None,
  });
  match err.error.as_str() {
    "authorization_pending" | "slow_down" => Ok(MicrosoftAuthOutcome::Pending),
    "authorization_declined" | "expired_token" | "bad_verification_code" => {
      Ok(MicrosoftAuthOutcome::Error {
        message: map_poll_error(&err.error, err.error_description),
      })
    }
    _ => Ok(MicrosoftAuthOutcome::Pending),
  }
}

async fn xbox_minecraft_chain(
  client: &Client,
  ms_access_token: &str,
) -> Result<MinecraftSession, String> {
  let rps_ticket = format!("d={}", ms_access_token);
  let xbl_body = json!({
    "Properties": {
      "AuthMethod": "RPS",
      "SiteName": "user.auth.xboxlive.com",
      "RpsTicket": rps_ticket
    },
    "RelyingParty": "http://auth.xboxlive.com",
    "TokenType": "JWT"
  });
  let xbl_res = client
    .post("https://user.auth.xboxlive.com/user/authenticate")
    .json(&xbl_body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if !xbl_res.status().is_success() {
    return Err("No se pudo conectar con Microsoft.".to_string());
  }
  let xbl_json: serde_json::Value = xbl_res
    .json()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  let xbl_token = xbl_json["Token"]
    .as_str()
    .ok_or_else(|| "No se pudo conectar con Microsoft.".to_string())?
    .to_string();
  let uhs = xbl_json["DisplayClaims"]["xui"][0]["uhs"]
    .as_str()
    .ok_or_else(|| "No se pudo conectar con Microsoft.".to_string())?
    .to_string();
  let xuid = xbl_json["DisplayClaims"]["xui"][0]["xid"]
    .as_str()
    .map(|s| s.to_string());

  let xsts_body = json!({
    "Properties": {
      "SandboxId": "RETAIL",
      "UserTokens": [xbl_token]
    },
    "RelyingParty": "rp://api.minecraftservices.com/",
    "TokenType": "JWT"
  });
  let xsts_res = client
    .post("https://xsts.auth.xboxlive.com/xsts/authorize")
    .json(&xsts_body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if !xsts_res.status().is_success() {
    let body = xsts_res.text().await.unwrap_or_default();
    if body.contains("2148916233") || body.contains("2148916238") {
      return Err("La cuenta no tiene Minecraft Java.".to_string());
    }
    return Err("La cuenta no tiene Minecraft Java.".to_string());
  }
  let xsts_json: serde_json::Value = xsts_res
    .json()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  let xsts_token = xsts_json["Token"]
    .as_str()
    .ok_or_else(|| "No se pudo conectar con Microsoft.".to_string())?
    .to_string();

  let identity_token = format!("XBL3.0 x={};{}", uhs, xsts_token);
  let mc_login_body = json!({ "identityToken": identity_token });
  let mc_res = client
    .post("https://api.minecraftservices.com/authentication/login_with_xbox")
    .json(&mc_login_body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if !mc_res.status().is_success() {
    return Err("La cuenta no tiene Minecraft Java.".to_string());
  }
  let mc_login: serde_json::Value = mc_res
    .json()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  let mc_access = mc_login["access_token"]
    .as_str()
    .ok_or_else(|| "No se pudo conectar con Microsoft.".to_string())?
    .to_string();
  let mc_expires_in = mc_login["expires_in"].as_i64();
  let mc_expires = mc_expires_in.map(|s| chrono::Utc::now().timestamp_millis() + s * 1000);

  let profile_res = client
    .get("https://api.minecraftservices.com/minecraft/profile")
    .bearer_auth(&mc_access)
    .send()
    .await
    .map_err(|_| "No se pudo obtener perfil de Minecraft.".to_string())?;
  if !profile_res.status().is_success() {
    return Err("No se pudo obtener perfil de Minecraft.".to_string());
  }
  let profile: serde_json::Value = profile_res
    .json()
    .await
    .map_err(|_| "No se pudo obtener perfil de Minecraft.".to_string())?;
  let username = profile["name"]
    .as_str()
    .ok_or_else(|| "No se pudo obtener perfil de Minecraft.".to_string())?
    .to_string();
  let uuid = profile["id"]
    .as_str()
    .ok_or_else(|| "No se pudo obtener perfil de Minecraft.".to_string())?
    .to_string();

  Ok(MinecraftSession {
    access_token: mc_access,
    uuid,
    username,
    user_type: "msa".into(),
    xuid,
    expires_at_epoch_ms: mc_expires,
  })
}

pub async fn refresh_microsoft_session(
  client: &Client,
  db: &Db,
  account_id: &str,
) -> Result<StoredAccountSecrets, String> {
  let mut secrets = keyring_get_minecraft(account_id)?
    .ok_or_else(|| "No hay credenciales guardadas para esta cuenta.".to_string())?;
  let refresh = secrets
    .refresh_token
    .as_ref()
    .ok_or_else(|| "El token expiró. Vuelve a iniciar sesión.".to_string())?;

  let client_id = ms_client_id(db);
  let body = format!(
    "grant_type=refresh_token&client_id={}&refresh_token={}",
    urlencoding::encode(&client_id),
    urlencoding::encode(refresh)
  );
  let res = client
    .post(endpoint("token"))
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)
    .send()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  if !res.status().is_success() {
    return Err("El token expiró. Vuelve a iniciar sesión.".to_string());
  }
  let token: TokenResponse = res
    .json()
    .await
    .map_err(|_| "No se pudo conectar con Microsoft.".to_string())?;
  let ms_access = token
    .access_token
    .ok_or_else(|| "El token expiró. Vuelve a iniciar sesión.".to_string())?;
  let ms_expires = token.expires_in.map(|s| chrono::Utc::now().timestamp_millis() + s * 1000);
  let session = xbox_minecraft_chain(client, &ms_access).await?;
  secrets.minecraft_access_token = session.access_token;
  secrets.mc_expires_at_epoch_ms = session.expires_at_epoch_ms;
  secrets.ms_expires_at_epoch_ms = ms_expires;
  secrets.xuid = session.xuid;
  if token.refresh_token.is_some() {
    secrets.refresh_token = token.refresh_token;
  }
  keyring_store_minecraft(account_id, &secrets)?;
  Ok(secrets)
}

pub async fn ensure_valid_secrets(
  client: &Client,
  db: &Db,
  account_id: &str,
) -> Result<StoredAccountSecrets, String> {
  let secrets = keyring_get_minecraft(account_id)?
    .ok_or_else(|| "No hay credenciales de Microsoft guardadas para esta cuenta.".to_string())?;

  let now = chrono::Utc::now().timestamp_millis();
  let mc_expired = secrets
    .mc_expires_at_epoch_ms
    .map(|t| now >= t - 60_000)
    .unwrap_or(false);

  if !mc_expired {
    let check = client
      .get("https://api.minecraftservices.com/minecraft/profile")
      .bearer_auth(&secrets.minecraft_access_token)
      .send()
      .await;
    if let Ok(r) = check {
      if r.status().is_success() {
        return Ok(secrets);
      }
    }
  }

  refresh_microsoft_session(client, db, account_id).await
}

pub fn offline_session(username: &str) -> MinecraftSession {
  let uuid = offline_uuid(username);
  MinecraftSession {
    access_token: "-".into(),
    uuid: uuid.to_string(),
    username: username.to_string(),
    user_type: "legacy".into(),
    xuid: None,
    expires_at_epoch_ms: None,
  }
}

pub fn offline_uuid(username: &str) -> Uuid {
  let digest = md5::compute(format!("OfflinePlayer:{username}").as_bytes());
  let mut b: [u8; 16] = (*digest).into();
  b[6] = (b[6] & 0x0f) | 0x30;
  b[8] = (b[8] & 0x3f) | 0x80;
  Uuid::from_bytes(b)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccountSecrets {
  pub minecraft_access_token: String,
  #[serde(default)]
  pub refresh_token: Option<String>,
  #[serde(default)]
  pub ms_expires_at_epoch_ms: Option<i64>,
  #[serde(default)]
  pub mc_expires_at_epoch_ms: Option<i64>,
  #[serde(default)]
  pub xuid: Option<String>,
}

pub fn keyring_store_minecraft(
  account_id: &str,
  secrets: &StoredAccountSecrets,
) -> Result<(), String> {
  let entry = Entry::new(KEYRING_SERVICE, &format!("minecraft:{account_id}"))
    .map_err(|e| e.to_string())?;
  let json = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
  entry.set_password(&json).map_err(|e| e.to_string())
}

pub fn keyring_get_minecraft(
  account_id: &str,
) -> Result<Option<StoredAccountSecrets>, String> {
  let entry = Entry::new(KEYRING_SERVICE, &format!("minecraft:{account_id}"))
    .map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(pw) => {
      let v: StoredAccountSecrets = serde_json::from_str(&pw).map_err(|e| e.to_string())?;
      Ok(Some(v))
    }
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

pub fn keyring_delete_minecraft(account_id: &str) -> Result<(), String> {
  let entry = Entry::new(KEYRING_SERVICE, &format!("minecraft:{account_id}"))
    .map_err(|e| e.to_string())?;
  match entry.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}
