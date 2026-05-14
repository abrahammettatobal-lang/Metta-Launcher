use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const MS_CLIENT_ID: &str = "00000000402b5328";
const MS_SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeStart {
  pub device_code: String,
  pub user_code: String,
  pub verification_uri: String,
  pub expires_in: i64,
  pub interval: i64,
}

#[derive(Debug, Serialize, Deserialize)]
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
  pub expires_at_epoch_ms: Option<i64>,
}

pub async fn microsoft_start_device_flow(client: &Client) -> Result<DeviceCodeStart, String> {
  let body = format!(
    "client_id={}&scope={}",
    urlencoding::encode(MS_CLIENT_ID),
    urlencoding::encode(MS_SCOPE)
  );
  let res = client
    .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !res.status().is_success() {
    let t = res.text().await.unwrap_or_default();
    return Err(format!("No se pudo iniciar el flujo de dispositivo: {t}"));
  }
  let parsed: DeviceCodeResponse = res.json().await.map_err(|e| e.to_string())?;
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

pub async fn microsoft_poll_device_code(
  client: &Client,
  device_code: &str,
) -> Result<MicrosoftAuthOutcome, String> {
  let body = format!(
    "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id={}&device_code={}",
    urlencoding::encode(MS_CLIENT_ID),
    urlencoding::encode(device_code)
  );
  let res = client
    .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
    .header("Content-Type", "application/x-www-form-urlencoded")
    .body(body)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if res.status().is_success() {
    let token: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
    let ms_access = token
      .access_token
      .ok_or_else(|| "Respuesta de token incompleta.".to_string())?;
    let session = xbox_minecraft_chain(client, &ms_access).await?;
    let username = session.username.clone();
    let uuid_string = session.uuid.clone();
    let account_id = Uuid::new_v4().to_string();
    let secrets = StoredAccountSecrets {
      minecraft_access_token: session.access_token,
      refresh_token: token.refresh_token,
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
      let msg = err
        .error_description
        .unwrap_or_else(|| err.error.clone());
      Ok(MicrosoftAuthOutcome::Error { message: msg })
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
    .map_err(|e| e.to_string())?;
  if !xbl_res.status().is_success() {
    let t = xbl_res.text().await.unwrap_or_default();
    return Err(format!("Xbox Live (paso 1) falló: {t}"));
  }
  let xbl_json: serde_json::Value = xbl_res.json().await.map_err(|e| e.to_string())?;
  let xbl_token = xbl_json["Token"]
    .as_str()
    .ok_or_else(|| "Token de Xbox no recibido.".to_string())?
    .to_string();
  let uhs = xbl_json["DisplayClaims"]["xui"][0]["uhs"]
    .as_str()
    .ok_or_else(|| "uhs no recibido.".to_string())?
    .to_string();

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
    .map_err(|e| e.to_string())?;
  if !xsts_res.status().is_success() {
    let t = xsts_res.text().await.unwrap_or_default();
    return Err(format!(
      "XSTS falló (¿cuenta sin licencia de Minecraft Java?): {t}"
    ));
  }
  let xsts_json: serde_json::Value = xsts_res.json().await.map_err(|e| e.to_string())?;
  let xsts_token = xsts_json["Token"]
    .as_str()
    .ok_or_else(|| "Token XSTS no recibido.".to_string())?
    .to_string();

  let identity_token = format!("XBL3.0 x={};{}", uhs, xsts_token);
  let mc_login_body = json!({ "identityToken": identity_token });
  let mc_res = client
    .post("https://api.minecraftservices.com/authentication/login_with_xbox")
    .json(&mc_login_body)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !mc_res.status().is_success() {
    let t = mc_res.text().await.unwrap_or_default();
    return Err(format!("Minecraft Services login falló: {t}"));
  }
  let mc_login: serde_json::Value = mc_res.json().await.map_err(|e| e.to_string())?;
  let mc_access = mc_login["access_token"]
    .as_str()
    .ok_or_else(|| "access_token de Minecraft no recibido.".to_string())?
    .to_string();

  let profile_res = client
    .get("https://api.minecraftservices.com/minecraft/profile")
    .bearer_auth(&mc_access)
    .send()
    .await
    .map_err(|e| e.to_string())?;
  if !profile_res.status().is_success() {
    let t = profile_res.text().await.unwrap_or_default();
    return Err(format!("No se pudo obtener el perfil de Minecraft: {t}"));
  }
  let profile: serde_json::Value = profile_res.json().await.map_err(|e| e.to_string())?;
  let username = profile["name"]
    .as_str()
    .ok_or_else(|| "Nombre de perfil no recibido.".to_string())?
    .to_string();
  let uuid = profile["id"]
    .as_str()
    .ok_or_else(|| "UUID de perfil no recibido.".to_string())?
    .to_string();

  Ok(MinecraftSession {
    access_token: mc_access,
    uuid,
    username,
    user_type: "msa".into(),
    expires_at_epoch_ms: None,
  })
}

pub fn offline_session(username: &str) -> MinecraftSession {
  let uuid = offline_uuid(username);
  MinecraftSession {
    access_token: "-".into(),
    uuid: uuid.to_string(),
    username: username.to_string(),
    user_type: "legacy".into(),
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

#[derive(Debug, Serialize, Deserialize)]
pub struct StoredAccountSecrets {
  pub minecraft_access_token: String,
  #[serde(default)]
  pub refresh_token: Option<String>,
}

pub fn keyring_store_minecraft(
  account_id: &str,
  secrets: &StoredAccountSecrets,
) -> Result<(), String> {
  let entry = Entry::new("com.metta.launcher", &format!("minecraft:{account_id}"))
    .map_err(|e| e.to_string())?;
  let json = serde_json::to_string(secrets).map_err(|e| e.to_string())?;
  entry.set_password(&json).map_err(|e| e.to_string())
}

pub fn keyring_get_minecraft(
  account_id: &str,
) -> Result<Option<StoredAccountSecrets>, String> {
  let entry = Entry::new("com.metta.launcher", &format!("minecraft:{account_id}"))
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
  let entry = Entry::new("com.metta.launcher", &format!("minecraft:{account_id}"))
    .map_err(|e| e.to_string())?;
  match entry.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}
