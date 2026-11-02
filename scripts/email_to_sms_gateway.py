#!/usr/bin/env python3
"""
SmartCity Guardian: Carrier Email-to-SMS Gateway Dispatcher

Transmits real-time disaster alerts and emergency notifications to mobile devices
using telecommunication Carrier Email-to-SMS gateways (e.g. 10digit@carrier.net)
via Python's standard `smtplib` library.

Zero external dependencies required (uses built-in smtplib, email, and ssl).
"""

import sys
import os
import argparse
import smtplib
import ssl
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone

# -----------------------------------------------------------------------------
# Known Carrier Email-to-SMS & MMS Gateway Domains
# -----------------------------------------------------------------------------
CARRIER_GATEWAYS = {
    # Indian Carriers (Legacy & Circle Gateways)
    "airtel": "airtelmail.com",
    "airtel-ap": "airtelap.com",
    "airtel-kk": "airtelkk.com",
    "jio": "jiosms.com",
    "vi": "vodafone.in",
    "idea": "ideacellular.net",
    "bsnl": "bsnl.co.in",
    "bsnl-south": "bplmobile.com",

    # Major Global / US Carriers
    "verizon": "vtext.com",
    "verizon-mms": "vzwpix.com",
    "att": "txt.att.net",
    "att-mms": "mms.att.net",
    "tmobile": "tmomail.net",
    "sprint": "messaging.sprintpcs.com",
    "us-cellular": "email.uscc.net",
    "boost": "myboostmobile.com",
    "cricket": "sms.cricketwireless.net",
    "metro-pcs": "mymetropcs.com",
    "virgin": "vmobl.com",

    # Canadian Carriers
    "rogers": "pcs.rogers.com",
    "bell": "txt.bell.ca",
    "telus": "msg.telus.com",
    "fido": "fido.ca",
}

def extract_10_digits(phone: str) -> str:
    """Sanitizes phone input to standard 10-digit format (e.g. +919876543210 -> 9876543210)."""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0091") and len(digits) >= 14:
        digits = digits[4:]
    elif digits.startswith("91") and len(digits) >= 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) >= 11:
        digits = digits[1:]
    return digits[:10]

def build_gateway_address(phone_input: str, carrier: str) -> str:
    """Constructs carrier-specific email address: <10-digits>@<carrier-gateway> or returns direct address."""
    if "@" in phone_input:
        return phone_input.strip()
    digits = extract_10_digits(phone_input)
    domain = CARRIER_GATEWAYS.get(carrier.lower().strip())
    if not domain:
        # Check if user passed a custom domain directly (e.g. customgateway.com)
        if "." in carrier:
            domain = carrier.strip()
        else:
            raise ValueError(f"Unknown carrier '{carrier}'. Supported: {', '.join(sorted(CARRIER_GATEWAYS.keys()))}")
    return f"{digits}@{domain}"

def send_email_to_sms(
    to_phone: str,
    message: str,
    carrier: str = "airtel",
    smtp_server: str = "smtp.gmail.com",
    smtp_port: int = 587,
    smtp_user: str = None,
    smtp_password: str = None,
    sender_email: str = None,
    subject: str = "SmartCity Alert",
    dry_run: bool = False,
) -> dict:
    """
    Dispatches an emergency SMS by emailing the carrier gateway address.
    """
    if "@" in to_phone:
        gateway_address = to_phone.strip()
        clean_digits = to_phone.split("@")[0]
        display_phone = gateway_address
    else:
        clean_digits = extract_10_digits(to_phone)
        if len(clean_digits) != 10:
            return {
                "success": False,
                "error": f"Invalid phone format: '{to_phone}'. Must resolve to 10 digits.",
                "dispatched_at": datetime.now(timezone.utc).isoformat(),
            }
        gateway_address = build_gateway_address(clean_digits, carrier)
        display_phone = f"+91 {clean_digits}"

    from_addr = sender_email or smtp_user or "alerts@smartcity-guardian.org"

    # Enforce standard SMS 160 character boundary guidance
    char_count = len(message)
    segments = 1 if char_count <= 160 else (char_count // 153 + (1 if char_count % 153 else 0))

    # Format MIME message for carrier SMS gateway
    # Many SMS gateways print the Subject: line before message body
    msg = MIMEText(message, _charset="utf-8")
    msg["From"] = from_addr
    msg["To"] = gateway_address
    msg["Subject"] = subject

    sent_at = datetime.now(timezone.utc).isoformat()

    print("--------------------------------------------------------------------------------")
    print("           SMARTCITY GUARDIAN: CARRIER EMAIL-TO-SMS DISPATCHER                  ")
    print("--------------------------------------------------------------------------------")
    print(f"  Target Recipient    : {display_phone}")
    print(f"  Carrier Gateway     : {carrier} -> {gateway_address}")
    print(f"  Sender Address      : {from_addr}")
    print(f"  Payload Size        : {char_count} chars ({segments} segment{'s' if segments > 1 else ''})")
    print(f"  Message Content     : \"{message}\"")
    print("--------------------------------------------------------------------------------")

    if dry_run:
        print("[DRY-RUN NOTICE] Live transmission was NOT sent (dry-run mode active).")
        print(f"[DRY-RUN NOTICE] Validated envelope format for: {gateway_address}")
        print(f"[DRY-RUN NOTICE] Target relay: {smtp_server}:{smtp_port}")
        return {
            "success": True,
            "dry_run": True,
            "recipient_phone": f"+91{clean_digits}",
            "gateway_address": gateway_address,
            "char_count": char_count,
            "segments": segments,
            "dispatched_at": sent_at,
            "status": "DELIVERED_SIMULATED",
        }

    # Live SMTP Transmission
    if not smtp_user or not smtp_password:
        err_msg = (
            "SMTP credentials (--username, --password) are required for LIVE transmission.\n"
            "Example using Gmail App Password:\n"
            f"  python3 scripts/email_to_sms_gateway.py --phone {clean_digits} --carrier {carrier} \\\n"
            "    --username your_email@gmail.com --password your_16char_app_password"
        )
        print(f"\n❌ [SMTP AUTH ERROR] {err_msg}\n")
        return {
            "success": False,
            "error": err_msg,
            "dispatched_at": sent_at,
        }

    try:
        context = ssl.create_default_context()
        print(f"[SMTP] Connecting to {smtp_server}:{smtp_port}...")

        if smtp_port == 465:
            # SSL
            with smtplib.SMTP_SSL(smtp_server, smtp_port, context=context, timeout=10) as server:
                server.login(smtp_user, smtp_password)
                server.sendmail(from_addr, [gateway_address], msg.as_string())
        else:
            # STARTTLS (Port 587 or 25)
            with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
                server.ehlo()
                if server.has_extn("STARTTLS"):
                    server.starttls(context=context)
                    server.ehlo()
                server.login(smtp_user, smtp_password)
                server.sendmail(from_addr, [gateway_address], msg.as_string())

        print(f"✅ [SUCCESS] Email-to-SMS transmitted to carrier gateway {gateway_address}!")
        return {
            "success": True,
            "recipient_phone": f"+91{clean_digits}",
            "gateway_address": gateway_address,
            "char_count": char_count,
            "segments": segments,
            "dispatched_at": sent_at,
            "status": "DELIVERED",
        }

    except Exception as exc:
        print(f"❌ [SMTP ERROR] Transmission failed: {exc}")
        return {
            "success": False,
            "error": str(exc),
            "recipient_phone": f"+91{clean_digits}",
            "gateway_address": gateway_address,
            "dispatched_at": sent_at,
            "status": "FAILED",
        }

def main():
    parser = argparse.ArgumentParser(description="SmartCity Guardian: Carrier Email-to-SMS Dispatcher")
    parser.add_argument("--phone", default="9876543210", help="Recipient 10-digit mobile number (default: 9876543210)")
    parser.add_argument("--message", default="SMARTCITY ALERT: Flash flood 1.4km away at Silk Board. Detour via Elevated Highway.", help="SMS message payload")
    parser.add_argument("--carrier", default="airtel", help="Carrier name or custom domain (airtel, jio, vi, bsnl, verizon, att, tmobile)")
    parser.add_argument("--smtp-server", default=os.getenv("SMTP_SERVER", "smtp.gmail.com"), help="SMTP Server Host (default: smtp.gmail.com)")
    parser.add_argument("--smtp-port", type=int, default=int(os.getenv("SMTP_PORT", 587)), help="SMTP Server Port (default: 587)")
    parser.add_argument("--username", default=os.getenv("SMTP_USERNAME"), help="SMTP Username / Sender Email")
    parser.add_argument("--password", default=os.getenv("SMTP_PASSWORD"), help="SMTP Password / App Password")
    parser.add_argument("--sender", default=os.getenv("SMTP_SENDER"), help="From: header email address")
    parser.add_argument("--dry-run", action="store_true", help="Format and validate message without dialing live SMTP server")
    parser.add_argument("--list-carriers", action="store_true", help="List all supported carrier email-to-SMS gateways")

    args = parser.parse_args()

    if args.list_carriers:
        print("\nSupported Carrier Email-to-SMS Gateway Domains:")
        print("=" * 60)
        for k, v in sorted(CARRIER_GATEWAYS.items()):
            print(f"  {k.ljust(18)} : @{v}")
        print("=" * 60)
        return

    # Explicitly check dry_run vs missing credentials
    if not args.dry_run and (not args.username or not args.password):
        print("\n⚠️  [SMTP CONFIGURATION REQUIRED FOR LIVE DISPATCH]")
        print("  You did not pass SMTP credentials (--username, --password).")
        print("  Running in DRY-RUN validation mode (no network email sent).\n")
        dry_run = True
    else:
        dry_run = args.dry_run

    result = send_email_to_sms(
        to_phone=args.phone,
        message=args.message,
        carrier=args.carrier,
        smtp_server=args.smtp_server,
        smtp_port=args.smtp_port,
        smtp_user=args.username,
        smtp_password=args.password,
        sender_email=args.sender,
        dry_run=dry_run,
    )

    if result.get("success"):
        sys.exit(0)
    else:
        if result.get("error"):
            print(f"❌ [ERROR] {result['error']}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
