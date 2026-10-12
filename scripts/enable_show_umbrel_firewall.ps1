# Run once with administrator privileges. Only Umbrel's Tailscale IP is admitted.
$ErrorActionPreference='Stop'
$ruleName='Cardinal3D-Show-Umbrel-8878'
$showNode=(Get-Command node.exe -ErrorAction Stop).Source
if(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue){Write-Host 'The Show firewall rule already exists.';return}
New-NetFirewallRule -Name $ruleName -DisplayName 'Cardinal 3D Show from Umbrel only' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8878 -RemoteAddress 100.64.0.10 -InterfaceAlias Tailscale -Program $showNode -Profile Any | Out-Null
Write-Host 'Umbrel can now reach the Show service on port 8878 through Tailscale.'
