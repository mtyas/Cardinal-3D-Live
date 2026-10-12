param([string]$PublicOrigin='https://live.example.org')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot
$privateDirectory=Join-Path $projectRoot '.tools'
if(!(Test-Path -LiteralPath $privateDirectory)){New-Item -ItemType Directory -Path $privateDirectory|Out-Null}
$configPath=Join-Path $projectRoot '.tools\show-hosting.json'
if(!(Test-Path -LiteralPath $configPath)){
 $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
 $inviteBytes=New-Object byte[] 24; $rng.GetBytes($inviteBytes); $rng.Dispose()
 $inviteKey=([BitConverter]::ToString($inviteBytes)).Replace('-','').ToLowerInvariant()
 $configJson=@{public_origin=$PublicOrigin;bind='0.0.0.0';port=8878;proxy_address='100.64.0.10';invite_token=$inviteKey}|ConvertTo-Json
 [System.IO.File]::WriteAllText($configPath,$configJson,(New-Object System.Text.UTF8Encoding($false)))
}
$env:CARDINAL_SHOW_HOSTING_CONFIG=$configPath
$env:CARDINAL_SHOW_PORT='8878'
$env:CARDINAL_SHOW_SESSION_PATH=Join-Path $projectRoot '.tools\show-room-session.json'
& (Join-Path $PSScriptRoot 'run_show_preview.ps1')
