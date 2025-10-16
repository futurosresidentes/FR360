@echo off
echo ========================================
echo   FR360 - Desarrollo Local
echo ========================================
echo.
echo Verificando configuracion...
node check-env.js
if errorlevel 1 (
    echo.
    echo ERROR: Faltan variables de entorno
    echo Revisa el archivo .env
    pause
    exit /b 1
)

echo.
echo Iniciando servidor local...
echo.
echo URL: http://localhost:3000
echo.
echo Presiona Ctrl+C para detener
echo ========================================
echo.

npm run dev
