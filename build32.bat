@echo off
echo Building 32-bit (ia32) version...
call npx electron-builder --win nsis --ia32 --config.win.signAndEditExecutable=false
echo.
echo Done! Installer is in dist\ folder.
pause
