@echo off
setlocal
title MeetApp Launcher

echo =========================================
echo       INICIANDO MEETAPP (MODO PORTABLE)
echo =========================================

REM 1. Buscar Node.js local (Carpeta 'portable_node' junto a este script)
if exist "%~dp0portable_node\node.exe" (
    echo [INFO] Encontrado Node.js portable local.
    set "PATH=%~dp0portable_node;%PATH%"
) else (
    echo [INFO] No se encontro 'portable_node' local. Buscando instalación global...
)

REM 2. Verificar si tenemos Node disponible
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se ha encontrado Node.js ni global ni en la carpeta 'portable_node'.
    echo [AYUDA] Para usar el modo portable:
    echo    1. Descarga el ZIP de Node.js (Windows Binary) desde nodejs.org
    echo    2. Extrae el contenido en una carpeta llamada 'portable_node' junto a este archivo.
    echo    3. Vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b
)

echo [OK] Node.js detectado:
node -v

echo.
echo [1/2] Instalando dependencias (si faltan)...
call npm install

echo.
echo [2/2] Iniciando aplicacion...
echo La aplicación se abrirá en http://localhost:3000
echo (Cierra esta ventana para detener el servidor)
echo.

REM Iniciar Next.js
call npm run dev

pause
