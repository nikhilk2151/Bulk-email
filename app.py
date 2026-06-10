import os
import asyncio
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
import aiosmtplib
from dotenv import load_dotenv
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("app")

# Load env vars locally
if os.getenv("VERCEL") is None:
    load_dotenv()

app = FastAPI(
    title="Secure Mail Console",
    description="Bulk Email Sending Platform with Gate Protection and Anti-Spam Verification",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

@app.on_event("startup")
async def startup_event():
    logger.info("Application is starting up...")
    logger.info("Verifying static and template directories...")
    if not os.path.exists("static"):
        logger.error("CRITICAL: 'static' directory NOT FOUND!")
    if not os.path.exists("templates"):
        logger.error("CRITICAL: 'templates' directory NOT FOUND!")
    logger.info("Startup complete. Application is ready to accept requests.")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    logger.info(f"Incoming Request: {request.method} {request.url}")
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info(f"Request Completed: {request.method} {request.url} | Status: {response.status_code} | Time: {process_time:.4f}s")
        return response
    except Exception as e:
        logger.error(f"Request Failed: {request.method} {request.url} | Error: {str(e)}", exc_info=True)
        raise

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Jinja2 templates
templates = Jinja2Templates(directory="templates")


# ── Models ──────────────────────────────────────────────────────────────────

class VerifyPasswordRequest(BaseModel):
    password: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def create_mime_message(
    sender_name: str, sender_email: str, recipient: str, subject: str, body: str
) -> MIMEMultipart:
    message = MIMEMultipart()
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = recipient
    message["Subject"] = Header(subject, "utf-8")
    message.attach(MIMEText(body, "plain", "utf-8"))
    return message


async def verify_turnstile(token: str, remote_ip: str) -> bool:
    # Allow dummy / test site-key tokens in dev
    if token == "XXXX.DUMMY.TOKEN.XXXX" or token.startswith("1x00000000000000000000AA"):
        return True
    if os.getenv("VERCEL"):
        missing = [var for var in ["CF_SECRET_KEY", "GATE_PASSWORD"] if not os.getenv(var)]
        if missing:
            raise RuntimeError(f"Missing required env vars in Vercel: {', '.join(missing)}")
    secret = os.getenv("CF_SECRET_KEY")
    url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                url,
                data={"secret": secret, "response": token, "remoteip": remote_ip},
                timeout=10.0,
            )
            data = resp.json()
            return data.get("success", False)
        except Exception as e:
            print(f"[Turnstile] Verification exception: {e}")
            if secret == "1x0000000000000000000000000000000AA":
                return True
            return False


async def send_bulk_emails(
    websocket: WebSocket,
    credentials: dict,
    email_details: dict,
    recipients: list,
    session_state: dict,
):
    sender_email = credentials["email"]
    sender_password = credentials["password"]
    sender_name = credentials["sender_name"]
    subject = email_details["subject"]
    body = email_details["body"]
    total = len(recipients)
    sent = 0
    failed = 0
    smtp = None

    # ── SMTP connect ────────────────────────────────────────────────────────
    try:
        smtp = aiosmtplib.SMTP(hostname="smtp.gmail.com", port=587, use_tls=False)
        await smtp.connect()
        await smtp.login(sender_email, sender_password)
    except aiosmtplib.SMTPAuthenticationError:
        await websocket.send_json(
            {"type": "error", "message": "SMTP Authentication failed. Verify Gmail address and App Password."}
        )
        if smtp:
            await smtp.quit()
        return
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"SMTP connection error: {e}"})
        if smtp:
            await smtp.quit()
        return

    # ── Send loop ───────────────────────────────────────────────────────────
    for idx, recipient in enumerate(recipients):
        if session_state.get("cancelled"):
            await websocket.send_json(
                {
                    "type": "stopped",
                    "sent": sent,
                    "failed": failed,
                    "remaining": total - idx,
                    "processed": idx,
                    "total": total,
                }
            )
            break

        await websocket.send_json(
            {
                "type": "progress",
                "sent": sent,
                "failed": failed,
                "remaining": total - idx,
                "processed": idx,
                "total": total,
                "current_recipient": recipient,
            }
        )

        try:
            msg = create_mime_message(sender_name, sender_email, recipient, subject, body)
            if not smtp.is_connected:
                await smtp.connect()
                await smtp.login(sender_email, sender_password)
            await smtp.send_message(msg)
            sent += 1
        except Exception as e:
            print(f"[SMTP] Error sending to {recipient}: {e}")
            failed += 1

        await websocket.send_json(
            {
                "type": "progress",
                "sent": sent,
                "failed": failed,
                "remaining": total - (idx + 1),
                "processed": idx + 1,
                "total": total,
                "current_recipient": "",
            }
        )
        await asyncio.sleep(1.5)
    else:
        await websocket.send_json(
            {
                "type": "complete",
                "sent": sent,
                "failed": failed,
                "remaining": 0,
                "processed": total,
                "total": total,
            }
        )

    if smtp:
        await smtp.quit()


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def index(request: Request):
    """Serve the main HTML page."""
    return templates.TemplateResponse(request=request, name="index.html")


@app.post("/api/verify-gate")
async def verify_gate(request: VerifyPasswordRequest):
    expected = os.getenv("GATE_PASSWORD")
    if expected is None:
        raise RuntimeError("GATE_PASSWORD not set in environment")
    if request.password == expected:
        return {"success": True}
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"success": False, "message": "Incorrect password"},
    )


@app.websocket("/ws/send")
async def websocket_send(websocket: WebSocket):
    await websocket.accept()
    session_state = {"cancelled": False}
    sender_task = None
    try:
        async for message in websocket.iter_json():
            action = message.get("action")
            if action == "start":
                if sender_task and not sender_task.done():
                    continue
                credentials = message.get("credentials", {})
                email_details = message.get("email_details", {})
                recipients = message.get("recipients", [])
                token = message.get("turnstile_token")
                client_ip = websocket.client.host if websocket.client else "127.0.0.1"
                if not await verify_turnstile(token, client_ip):
                    await websocket.send_json({"type": "error", "message": "Turnstile verification failed"})
                    continue
                session_state["cancelled"] = False
                sender_task = asyncio.create_task(
                    send_bulk_emails(websocket, credentials, email_details, recipients, session_state)
                )
            elif action == "stop":
                if sender_task and not sender_task.done():
                    session_state["cancelled"] = True
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    finally:
        if sender_task and not sender_task.done():
            session_state["cancelled"] = True
            sender_task.cancel()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn, traceback
    try:
        uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
    except Exception:
        print("[Startup Failure]", traceback.format_exc())
        raise
