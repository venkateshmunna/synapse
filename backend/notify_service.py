import logging
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from otp_service import send_fast2sms_dlt

load_dotenv()

logger = logging.getLogger(__name__)

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))

def notify_debate_completion(recipient: str, motion: str, synthesis: str):
    """Sends notification to email or phone when synthesis finishes."""
    if not recipient:
        return

    recipient = recipient.strip()
    if "@" in recipient:
        # Email Notification
        if not SMTP_EMAIL or not SMTP_PASSWORD:
            print(f"[LOCAL TEST] Debate notification for {recipient}: '{motion[:30]}...' finalized.")
            return
        try:
            msg = MIMEMultipart()
            msg["Subject"] = f"SYNAPSE Debate Complete: {motion[:40]}..."
            msg["From"] = f"SYNAPSE Alerts <{SMTP_EMAIL}>"
            msg["To"] = recipient

            body = (
                f"Your debate round has concluded and the Judge model has generated a final answer!\n\n"
                f"Motion: {motion}\n\n"
                f"Synthesized Resolution:\n{synthesis}\n\n"
                f"View the complete multi-round breakdown directly in the SYNAPSE app."
            )
            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, recipient, msg.as_string())
            server.quit()
        except Exception as e:
            print(f"Failed to send completion email: {e}")
    else:
        try:
            safe_motion = motion[:40].replace("|", " ")
            safe_synthesis = synthesis[:120].replace("|", " ")
            variables = f"{safe_motion}|{safe_synthesis}"
            send_fast2sms_dlt(recipient, variables)
        except Exception as e:
            logger.exception("Fast2SMS debate-completion notification failed: %s", e)