param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PhpExecutable = 'C:\xampp\php\php.exe',
    [string]$At = '',
    [string]$TaskName = 'CPE-Asset-Warehouse-Daily-Snapshot'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$worker = Join-Path $ProjectRoot 'scripts\sync_university_snapshot.php'
if ([string]::IsNullOrWhiteSpace($At)) {
    $At = '02:00'
    $envFile = Join-Path $ProjectRoot '.env'
    if (Test-Path -LiteralPath $envFile -PathType Leaf) {
        $line = Select-String -LiteralPath $envFile -Pattern '^CPE_SNAPSHOT_DAILY_TIME\s*=\s*(.+?)\s*$' | Select-Object -First 1
        if ($line) {
            $At = $line.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
        }
    }
}

if (-not (Test-Path -LiteralPath $PhpExecutable -PathType Leaf)) {
    throw "PHP executable not found: $PhpExecutable"
}
if (-not (Test-Path -LiteralPath $worker -PathType Leaf)) {
    throw "Snapshot worker not found: $worker"
}
if ((Get-TimeZone).Id -ne 'SE Asia Standard Time') {
    throw 'Windows time zone must be SE Asia Standard Time (Asia/Bangkok) before registering the 02:00 task.'
}
if ($At -notmatch '\A(?:[01]\d|2[0-3]):[0-5]\d\z') {
    throw 'Schedule time must use 24-hour HH:mm format.'
}

$mysql = [System.Net.Sockets.TcpClient]::new()
try {
    $connect = $mysql.BeginConnect('127.0.0.1', 3306, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(1500)) {
        throw 'XAMPP MySQL is not listening on 127.0.0.1:3306; the task was not registered.'
    }
    $mysql.EndConnect($connect)
} catch {
    throw 'XAMPP MySQL is not available on 127.0.0.1:3306; the task was not registered.'
} finally {
    $mysql.Dispose()
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "Task '$TaskName' already exists. Inspect it before replacing it."
}

$atTime = [datetime]::ParseExact($At, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$action = New-ScheduledTaskAction `
    -Execute $PhpExecutable `
    -Argument ('"{0}" --scheduled' -f $worker) `
    -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $atTime
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 60)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Imports one University Asset API snapshot per Bangkok calendar day.' | Out-Null

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
