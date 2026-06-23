@echo off
:: War Thunder Live Download Manager - Start Background Process
:: Este script inicia o servidor em background usando um launcher VBScript silencioso.

cd /d "%~dp0"

:: Verificar se o servidor já está ativo na porta 3000 (apenas em estado LISTENING)
netstat -aon | findstr /c:":3000 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [INFO] O servidor ja esta a correr na porta 3000.
    pause
    exit /b
)

echo [INFO] A iniciar o War Thunder Live Download Manager em background...
echo Set objShell = CreateObject("Wscript.Shell") > "%temp%\wt_live_run.vbs"
echo objShell.CurrentDirectory = "%~dp0" >> "%temp%\wt_live_run.vbs"
echo objShell.Run "node server.js", 0, False >> "%temp%\wt_live_run.vbs"
wscript.exe "%temp%\wt_live_run.vbs"
del "%temp%\wt_live_run.vbs"

echo [SUCCESS] Servidor iniciado com sucesso em background.
echo Pode abrir o browser em: http://localhost:3000
timeout /t 3 >nul
