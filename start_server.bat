@echo off
title Secure Mail Console Server
cd /d "%~dp0"
echo ========================================================
echo   Secure Mail Console - Bulk Email Platform
echo   Running at http://localhost:8000
echo ========================================================
"C:\Users\user121\AppData\Local\Programs\Python\Python312\python.exe" app.py
pause
