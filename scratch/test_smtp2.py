import asyncio
import aiosmtplib

async def main():
    smtp = aiosmtplib.SMTP(hostname="smtp.gmail.com", port=587, use_tls=False)
    try:
        print("Connecting...")
        await smtp.connect()
        print("Connected. Attempting login with dummy credentials...")
        await smtp.login("test@gmail.com", "wrongpassword")
    except Exception as e:
        print(f"Login outcome: {type(e).__name__} - {e}")
    finally:
        try:
            await smtp.quit()
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
