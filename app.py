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
load_dotenv()
# Initialize FastAPI App
app = FastAPI(
    title="Secure Mail Console",
    description="Bulk Email Sending Platform with Gate Protection and Anti-Spam Verification"
)

# Ensure directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Mount Static and Templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Password Gate Request Model
class VerifyPasswordRequest(BaseModel):
    password: str

# Helper to create email messages
def create_mime_message(sender_name, sender_email, recipient, subject, body) -> MIMEMultipart:
    message = MIMEMultipart()
    # E.g., "Sender Name <sender@gmail.com>"
    message["From"] = f"{sender_name} <{sender_email}>"
    message["To"] = recipient
    message["Subject"] = Header(subject, "utf-8")
    
    # Message body
    message.attach(MIMEText(body, "plain", "utf-8"))
    return message

# Verify Cloudflare Turnstile token
async def verify_turnstile(token, remote_ip) -> bool:
    # Always passes testing sitekey/token check:
    if token == "XXXX.DUMMY.TOKEN.XXXX" or token.startswith("1x00000000000000000000AA"):
        return True
    
    secret = os.getenv("CF_SECRET_KEY", "1x0000000000000000000000000000000AA")
    url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                url,
                data={
                    "secret": secret,
                    "response": token,
                    "remoteip": remote_ip
                },
                timeout=10.0
            )
            data = resp.json()
            return data.get("success", False)
        except Exception as e:
            print(f"[Turnstile] Verification exception: {e}")
            # If standard dummy secret is used and we are offline, allow bypass for development
            if secret == "1x0000000000000000000000000000000AA":
                return True
            return False

# Bulk email worker task
async def send_bulk_emails(
    websocket: WebSocket,
    credentials: dict,
    email_details: dict,
    recipients: list,
    session_state: dict
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
    try:
        # Establish connection to Gmail SMTP server
        smtp = aiosmtplib.SMTP(hostname="smtp.gmail.com", port=587, use_tls=False)
        await smtp.connect()
        await smtp.login(sender_email, sender_password)
    except aiosmtplib.SMTPAuthenticationError:
        await websocket.send_json({
            "type": "error",
            "message": "SMTP Authentication failed. Please verify your Gmail address and 16-character App Password."
        })
        if smtp:
            try:
                await smtp.quit()
            except Exception:
                pass
        return
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"SMTP connection error: {str(e)}"
        })
        if smtp:
            try:
                await smtp.quit()
            except Exception:
                pass
        return

    try:
        for idx, recipient in enumerate(recipients):
            # Check for cancellation before processing the email
            if session_state.get("cancelled", False):
                await websocket.send_json({
                    "type": "stopped",
                    "sent": sent,
                    "failed": failed,
                    "remaining": total - idx,
                    "processed": idx,
                    "total": total
                })
                return

            processed = idx + 1
            current_recipient = recipient

            # Update status to "sending to recipient..."
            await websocket.send_json({
                "type": "progress",
                "sent": sent,
                "failed": failed,
                "remaining": total - idx,
                "processed": idx,
                "total": total,
                "current_recipient": current_recipient
            })

            try:
                # Construct MIME message
                msg = create_mime_message(sender_name, sender_email, recipient, subject, body)
                
                # Check SMTP connection state
                if not smtp.is_connected:
                    await smtp.connect()
                    await smtp.login(sender_email, sender_password)

                await smtp.send_message(msg)
                sent += 1
            except Exception as e:
                print(f"[SMTP] Error sending to {recipient}: {e}")
                failed += 1

            # Update stats immediately after send attempt
            await websocket.send_json({
                "type": "progress",
                "sent": sent,
                "failed": failed,
                "remaining": total - processed,
                "processed": processed,
                "total": total,
                "current_recipient": ""
            })

            # Rate-limiting: Wait 1.5 seconds to avoid Gmail blocks
            if idx < total - 1:
                # Sleep in small increments to respond instantly to Stop requests
                for _ in range(15):
                    if session_state.get("cancelled", False):
                        break
                    await asyncio.sleep(0.1)

        # Notify final results
        if session_state.get("cancelled", False):
            await websocket.send_json({
                "type": "stopped",
                "sent": sent,
                "failed": failed,
                "remaining": 0,
                "processed": total,
                "total": total
            })
        else:
            await websocket.send_json({
                "type": "complete",
                "sent": sent,
                "failed": failed,
                "remaining": 0,
                "processed": total,
                "total": total
            })

    finally:
        if smtp:
            try:
                await smtp.quit()
            except Exception:
                pass

# --- HTTP ROUTES ---

@app.get("/")
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/verify-gate")
async def verify_gate(request: VerifyPasswordRequest):
    expected_password = os.getenv("GATE_PASSWORD", "admin123")
    if request.password == expected_password:
        return {"success": True}
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"success": False, "message": "Incorrect password"}
    )

# --- WEBSOCKET ROUTE ---

@app.websocket("/ws/send")
async def websocket_send(websocket: WebSocket):
    await websocket.accept()
    
    session_state = {"cancelled": False}
    sender_task = None
    
    try:
        async for message in websocket.iter_json():
            action = message.get("action")
            
            if action == "start":
                # Guard against starting multiple parallel tasks on same socket
                if sender_task and not sender_task.done():
                    continue
                
                credentials = message.get("credentials", {})
                email_details = message.get("email_details", {})
                recipients = message.get("recipients", [])
                turnstile_token = message.get("turnstile_token")
                
                # Verify spam protection
                client_ip = websocket.client.host if websocket.client else "127.0.0.1"
                turnstile_valid = await verify_turnstile(turnstile_token, client_ip)
                
                if not turnstile_valid:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Spam Protection (Turnstile) verification failed. Please try again."
                    })
                    continue
                
                # Start sending asynchronously
                session_state["cancelled"] = False
                sender_task = asyncio.create_task(
                    send_bulk_emails(
                        websocket=websocket,
                        credentials=credentials,
                        email_details=email_details,
                        recipients=recipients,
                        session_state=session_state
                    )
                )
                
            elif action == "stop":
                if sender_task and not sender_task.done():
                    session_state["cancelled"] = True
                    
    except WebSocketDisconnect:
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Exception: {e}")
    finally:
        # Cancel any active running worker if socket closes
        if sender_task and not sender_task.done():
            session_state["cancelled"] = True
            sender_task.cancel()

# Entry point
if __name__ == "__main__":
    import uvicorn
    # Default to port, reload disabled for stability in OneDrive sync dirs
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
