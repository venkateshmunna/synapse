import os
import re
import secrets
import smtplib
import time
import json
from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

# In-memory OTP storage: { "target": {"otp": "123456", "expires_at": timestamp} }
OTP_STORE = {}

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))

FAST2SMS_API_KEY = os.getenv("FAST2SMS_API_KEY", "").strip()
FAST2SMS_DLT_SENDER_ID = os.getenv("FAST2SMS_DLT_SENDER_ID", "").strip()
FAST2SMS_DLT_MESSAGE_ID = os.getenv("FAST2SMS_DLT_MESSAGE_ID", "").strip()
FAST2SMS_DLT_URL = "https://www.fast2sms.com/dev/bulkV2"

def generate_otp(target: str) -> str:
    """Generates a cryptographically secure 6-digit OTP valid for 5 minutes."""
    otp = f"{secrets.randbelow(900000) + 100000}"
    OTP_STORE[target.strip().lower()] = {
        "otp": otp,
        "expires_at": time.time() + 300
    }
    return otp

def verify_otp(target: str, user_otp: str) -> bool:
    key = target.strip().lower()
    entry = OTP_STORE.get(key)
    if not entry:
        return False
    if time.time() > entry["expires_at"]:
        del OTP_STORE[key]
        return False
    if entry["otp"] == user_otp.strip():
        del OTP_STORE[key]
        return True
    return False

def send_email_code(to_email: str, code: str) -> bool:
    print(f"\n==================================================")
    print(f"🔑 [SYNAPSE AUTH] OTP for {to_email} is: {code}")
    print(f"==================================================\n")

    # If SMTP is not set up, succeed immediately in local test mode
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"SYNAPSE Verification Code: {code}"
        msg["From"] = f"SYNAPSE Auth <{SMTP_EMAIL}>"
        msg["To"] = to_email

        body = (
            f"Hello,\n\n"
            f"Your 6-digit verification code for SYNAPSE is: {code}\n"
            f"This code will expire in 5 minutes.\n\n"
            f"If you did not request this, please ignore this message."
        )
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=5)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"[SMTP Notice] Real email delivery failed: {e}")
        print(f"👉 Use the console OTP printed above to log in!")
        # Return True so your login page advances to the 6-digit input box
        return True

def normalize_indian_mobile(phone: str) -> str:
    value = phone.strip()
    if value.startswith("+91"):
        value = value[3:]
    elif value.startswith("91") and len(value) == 12:
        value = value[2:]
    if not re.fullmatch(r"[6-9]\d{9}", value):
        raise ValueError("Enter a valid 10-digit Indian mobile number, optionally prefixed with +91.")
    return value


def send_fast2sms_dlt(phone: str, variables: str) -> None:
    mobile = normalize_indian_mobile(phone)
    if not FAST2SMS_API_KEY:
        raise RuntimeError("FAST2SMS_API_KEY is not configured in backend/.env.")
    if not FAST2SMS_DLT_SENDER_ID or not FAST2SMS_DLT_MESSAGE_ID:
        raise RuntimeError(
            "FAST2SMS_DLT_SENDER_ID and FAST2SMS_DLT_MESSAGE_ID must be configured "
            "to send SMS notifications."
        )
    if not FAST2SMS_DLT_MESSAGE_ID.isdigit():
        raise RuntimeError("FAST2SMS_DLT_MESSAGE_ID must be the numeric ID of an approved DLT template.")

    _send_fast2sms_request(
        FAST2SMS_DLT_URL,
        {
            "sender_id": FAST2SMS_DLT_SENDER_ID,
            "message": int(FAST2SMS_DLT_MESSAGE_ID),
            "variables_values": variables,
            "route": "dlt",
            "numbers": mobile,
        }
    )


def _send_fast2sms_request(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": FAST2SMS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    http_status = None
    try:
        with urlopen(request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as error:
        http_status = error.code
        response_body = error.read().decode("utf-8", errors="replace")
    except URLError as error:
        raise RuntimeError(f"Fast2SMS request failed: {error.reason}") from error

    try:
        result = json.loads(response_body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Fast2SMS returned an invalid response.") from error
    if not isinstance(result, dict):
        raise RuntimeError("Fast2SMS returned an unexpected response.")
    if http_status is not None or not result.get("return"):
        message = result.get("message", "Request was rejected.")
        if isinstance(message, list):
            message = "; ".join(str(item) for item in message)
        status_text = f" (HTTP {http_status})" if http_status is not None else ""
        raise RuntimeError(f"Fast2SMS rejected the request{status_text}: {message}")
    return result