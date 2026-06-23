@echo off
:: War Thunder Live Download Manager - Stop Background Process
:: Este script encontra o processo a correr na porta 3000 e termina-o.

cd /d "%~dp0"

echo [INFO] A procurar o processo ativo na porta 3000...
set PID=
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /c:":3000 " ^| findstr "LISTENING"') do (
    set PID=%%a
)

if "%PID%"=="" (
    echo [WARNING] Nenhum processo ativo foi encontrado a correr na porta 3000.
    pause
    exit /b
)

echo [INFO] A terminar o processo com PID %PID%...
taskkill /f /pid %PID% >nul 2>&1

if %errorlevel% equ 0 (
    echo [SUCCESS] Servidor parado com sucesso.
) else (
    echo [ERROR] Nao foi possivel parar o servidor. Tente executar como Administrador.
)

timeout /t 3 >nul
