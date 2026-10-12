$ErrorActionPreference = 'Stop'
$previewRoot = Join-Path $PSScriptRoot '..\show-web'
Push-Location $previewRoot
try {
    $showPort = if ($env:CARDINAL_SHOW_PORT) { $env:CARDINAL_SHOW_PORT } else { '8778' }
    $existingShow = $null
    try { $existingShow = Invoke-RestMethod -Uri "http://127.0.0.1:$showPort/health" -TimeoutSec 2 } catch {}
    if ($existingShow.app -eq 'cardinal-3d-show-preview') {
        Write-Host "The Show preview is already running. Open http://localhost:$showPort"
        Write-Host 'Keep the original server window open; its performer address remains valid.'
        $visitorAddress="http://localhost:$showPort"
        if($existingShow.publicOrigin){
            $sessionFile=Join-Path $PSScriptRoot '..\.tools\show-room-session.json'
            if(Test-Path -LiteralPath $sessionFile){$savedSession=Get-Content -LiteralPath $sessionFile -Raw|ConvertFrom-Json; if($savedSession.visitor_url -like "$($existingShow.publicOrigin)/*"){$visitorAddress=$savedSession.visitor_url}}
        }
        Start-Process $visitorAddress
        return
    }
    if (!(Test-Path 'node_modules\ws\package.json') -or !(Test-Path 'node_modules\opusscript\package.json') -or !(Test-Path 'node_modules\esbuild\package.json') -or !(Test-Path 'node_modules\opus-decoder\package.json')) {
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $npmCli = Join-Path (Split-Path $nodePath) 'node_modules\npm\bin\npm-cli.js'
        if (Test-Path $npmCli) { & $nodePath $npmCli ci --ignore-scripts }
        else { & npm.cmd ci --ignore-scripts }
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the preview dependencies.' }
    }
    Write-Host 'Open the visitor or performer address shown below. Leave this window open.'
    & node server.mjs
    if ($LASTEXITCODE -ne 0) { throw 'The Show preview could not start. See the message above.' }
} finally { Pop-Location }
