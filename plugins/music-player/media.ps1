# Mecord Music Player helper: reads/controls the Windows "now playing" session (Spotify, browsers, media players).
# Protocol: one JSON request per stdin line {id,method,args}; one JSON response per stdout line {id,result|error}.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    $task.Result
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Reply($id, $obj, $err) {
    $o = if ($err) { @{ id = $id; error = "$err" } } else { @{ id = $id; result = $obj } }
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
}

while ($null -ne ($line = [Console]::In.ReadLine())) {
    $req = $null
    try {
        $req = $line | ConvertFrom-Json
        $s = $mgr.GetCurrentSession()
        switch ($req.method) {
            'now' {
                if ($null -eq $s) { Reply $req.id $null $null; break }
                $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                $info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
                Reply $req.id @{
                    title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; app = $s.SourceAppUserModelId
                    playing = ($info.PlaybackStatus.ToString() -eq 'Playing')
                    position = [int]$tl.Position.TotalSeconds; duration = [int]$tl.EndTime.TotalSeconds
                } $null
            }
            'toggle' { if ($s) { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }; Reply $req.id $true $null }
            'next'   { if ($s) { [void](Await ($s.TrySkipNextAsync()) ([bool])) };       Reply $req.id $true $null }
            'prev'   { if ($s) { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) };   Reply $req.id $true $null }
            default  { Reply $req.id $null "unknown method $($req.method)" }
        }
    } catch {
        Reply $(if ($req) { $req.id } else { 0 }) $null $_.Exception.Message
    }
}
