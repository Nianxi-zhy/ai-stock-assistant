$env:NO_PROXY="*"
$env:HTTP_PROXY=""
$env:HTTPS_PROXY=""
Set-Location "C:\刘天赐\Akshare\ai-stock-assistant\backend"
& "C:\Users\19412\anaconda3\envs\d2l-zh\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
