@echo off
title PPE Monitoring Launcher

set "ROOT=%~dp0"
set "VENV=%ROOT%.venv\Scripts\activate.bat"

echo.
echo  ============================================================
echo    PPE Monitoring System  v2.0
echo    YOLOv8 + Spring Boot + React
echo  ============================================================
echo.

:: ---- Check Java -----------------------------------------------
echo  [1/3] Checking Java...
where java >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Java not found in PATH.
    echo          Please install Java 17+ and set JAVA_HOME.
    echo.
    pause
    exit /b 1
)
echo         OK
echo.

:: ---- Check Python venv ----------------------------------------
echo  [2/3] Checking Python venv...
if not exist "%VENV%" (
    echo.
    echo  [ERROR] .venv not found.
    echo  Run these commands first:
    echo.
    echo    cd "%ROOT%detector"
    echo    python -m venv "%ROOT%.venv"
    echo    "%ROOT%.venv\Scriptsctivate"
    echo    pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)
echo         OK
echo.

:: ---- Check MySQL ----------------------------------------------
echo  [3/3] Checking MySQL port 3306...
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient;try{$c.Connect('localhost',3306);Write-Host '        OK';$c.Close()}catch{Write-Host '  [WARNING] MySQL not responding - check if it is running'}" 2>nul
echo.

:: ---- Launch services ------------------------------------------
echo  ============================================================
echo   Starting services...
echo  ============================================================
echo.

echo  [Service 1/3] Spring Boot backend  (port 8080)
start "Spring Boot - PPE Backend" cmd /k "cd /d "%ROOT%ppe" && call gradlew.bat bootRun"
echo                Startup takes 15-30 seconds.
echo.
timeout /t 5 /nobreak > nul

echo  [Service 2/3] FastAPI detector     (port 8000)
start "FastAPI - PPE Detector" cmd /k "cd /d %ROOT%detector && call %VENV% && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo.
timeout /t 2 /nobreak > nul

echo  [Service 3/3] React frontend       (port 5173)
start "React - PPE Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"
echo.

:: ---- Done -----------------------------------------------------
echo  ============================================================
echo   All services launched in separate windows.
echo  ============================================================
echo.
echo   Frontend  :  http://localhost:5173
echo   Backend   :  http://localhost:8080
echo   Detector  :  http://localhost:8000/status
echo.
echo   Login     :  safety-admin / admin1234
echo.
echo   Wait for Spring Boot to finish loading before opening
echo   the frontend.  Check each service window for errors.
echo.
echo  ============================================================
echo.
pause > nul
