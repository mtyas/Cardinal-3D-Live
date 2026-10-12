$ErrorActionPreference='Stop'
$firewallScript=Join-Path $PSScriptRoot 'enable_show_umbrel_firewall.ps1'
Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$firewallScript+'"'))
