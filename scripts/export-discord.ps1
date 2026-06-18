param(
    [string]$Config = ".\config.local.json"
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return (Join-Path (Get-Location) $Path)
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function ConvertTo-SafeFileName {
    param([string]$Name)

    $invalid = [System.IO.Path]::GetInvalidFileNameChars()
    $safe = -join ($Name.ToCharArray() | ForEach-Object {
        if ($invalid -contains $_) { "_" } else { $_ }
    })

    if ([string]::IsNullOrWhiteSpace($safe)) {
        return "image"
    }

    return $safe
}

function ConvertTo-HtmlText {
    param([string]$Text)

    if ([string]::IsNullOrEmpty($Text)) {
        return ""
    }

    $encoded = [System.Net.WebUtility]::HtmlEncode($Text)
    return ($encoded -replace "(`r`n|`n|`r)", "<br>")
}

function Test-IsImageAttachment {
    param($Attachment)

    if ($Attachment.content_type -and $Attachment.content_type -like "image/*") {
        return $true
    }

    return ($Attachment.filename -match '\.(apng|avif|gif|jpe?g|png|webp)$')
}

function Get-DiscordMessages {
    param(
        [string]$ChannelId,
        [string]$BotToken,
        [int]$MaxMessages
    )

    $headers = @{
        Authorization = "Bot $BotToken"
    }
    $messages = @()
    $before = $null

    while ($messages.Count -lt $MaxMessages) {
        $limit = [Math]::Min(100, $MaxMessages - $messages.Count)
        $uri = "https://discord.com/api/v10/channels/$ChannelId/messages?limit=$limit"
        if ($before) {
            $uri = "$uri&before=$before"
        }

        $batch = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
        if (-not $batch -or $batch.Count -eq 0) {
            break
        }

        $messages += $batch
        $before = $batch[-1].id

        if ($batch.Count -lt $limit) {
            break
        }
    }

    [array]::Reverse($messages)
    return $messages
}

function Save-Page {
    param(
        [string]$Template,
        [string]$Path,
        [string]$Title,
        [string]$Root,
        [string]$Nav,
        [string]$Content,
        [string]$GeneratedAt
    )

    $html = $Template.
        Replace("{{TITLE}}", [System.Net.WebUtility]::HtmlEncode($Title)).
        Replace("{{ROOT}}", $Root).
        Replace("{{NAV}}", $Nav).
        Replace("{{CONTENT}}", $Content).
        Replace("{{GENERATED_AT}}", [System.Net.WebUtility]::HtmlEncode($GeneratedAt))

    Set-Content -LiteralPath $Path -Value $html -Encoding UTF8
}

$configPath = Resolve-ProjectPath $Config
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Config file not found: $configPath. Copy src/config.example.json to config.local.json and edit it."
}

$projectRoot = Get-Location
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($config.botToken)) {
    throw "botToken is required in config."
}

if (-not $config.channels -or $config.channels.Count -eq 0) {
    throw "At least one channel is required in config.channels."
}

$siteTitle = if ($config.siteTitle) { [string]$config.siteTitle } else { "FFXIV Recipe About" }
$outputDirName = if ($config.outputDir) { [string]$config.outputDir } else { "docs" }
$maxMessages = if ($config.maxMessages) { [int]$config.maxMessages } else { 100 }
$downloadImages = if ($null -ne $config.downloadImages) { [bool]$config.downloadImages } else { $true }

$outputDir = Resolve-ProjectPath $outputDirName
$assetsDir = Join-Path $outputDir "assets"
$imageRoot = Join-Path $assetsDir "images"
$channelPagesDir = Join-Path $outputDir "channels"

Ensure-Directory $outputDir
Ensure-Directory $assetsDir
Ensure-Directory $imageRoot
Ensure-Directory $channelPagesDir

Copy-Item -LiteralPath (Join-Path $projectRoot "src\styles.css") -Destination (Join-Path $assetsDir "styles.css") -Force
$template = Get-Content -LiteralPath (Join-Path $projectRoot "src\site-template.html") -Raw -Encoding UTF8
$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")

$navItems = @('<a href="{{ROOT}}index.html">Home</a>')
foreach ($channel in $config.channels) {
    $title = [System.Net.WebUtility]::HtmlEncode([string]$channel.title)
    $slug = [System.Net.WebUtility]::UrlEncode([string]$channel.slug)
    $navItems += "<a href=`"{{ROOT}}channels/$slug.html`">$title</a>"
}
$navTemplate = $navItems -join "`n"

$indexCards = @()

foreach ($channel in $config.channels) {
    if ([string]::IsNullOrWhiteSpace($channel.id)) {
        throw "channel.id is required."
    }
    if ([string]::IsNullOrWhiteSpace($channel.slug)) {
        throw "channel.slug is required."
    }

    $channelTitle = if ($channel.title) { [string]$channel.title } else { [string]$channel.slug }
    $channelSlug = [string]$channel.slug
    $channelImageDir = Join-Path $imageRoot $channel.id
    Ensure-Directory $channelImageDir

    Write-Host "Fetching channel: $channelTitle ($($channel.id))"
    $messages = Get-DiscordMessages -ChannelId $channel.id -BotToken $config.botToken -MaxMessages $maxMessages

    $messageHtml = @()
    foreach ($message in $messages) {
        $hasText = -not [string]::IsNullOrWhiteSpace($message.content)
        $imageHtml = @()

        foreach ($attachment in @($message.attachments)) {
            if (-not (Test-IsImageAttachment -Attachment $attachment)) {
                continue
            }

            $fileName = ConvertTo-SafeFileName $attachment.filename
            $localFileName = "$($message.id)-$fileName"
            $localPath = Join-Path $channelImageDir $localFileName
            $relativeImagePath = "../assets/images/$($channel.id)/$localFileName"

            if ($downloadImages -and -not (Test-Path -LiteralPath $localPath)) {
                Write-Host "Downloading image: $fileName"
                Invoke-WebRequest -Uri $attachment.url -OutFile $localPath
            }

            $alt = [System.Net.WebUtility]::HtmlEncode($fileName)
            $src = [System.Net.WebUtility]::HtmlEncode($relativeImagePath)
            $imageHtml += "<figure><img src=`"$src`" alt=`"$alt`" loading=`"lazy`"></figure>"
        }

        if (-not $hasText -and $imageHtml.Count -eq 0) {
            continue
        }

        $parts = @('<article class="post">')
        if ($hasText) {
            $parts += "<p>$(ConvertTo-HtmlText $message.content)</p>"
        }
        if ($imageHtml.Count -gt 0) {
            $parts += '<div class="image-grid">'
            $parts += $imageHtml
            $parts += '</div>'
        }
        $parts += '</article>'
        $messageHtml += ($parts -join "`n")
    }

    $emptyText = "<p class=`"empty`">表示できる投稿がありません。</p>"
    $body = @(
        "<section class=`"page-heading`"><h1>$([System.Net.WebUtility]::HtmlEncode($channelTitle))</h1></section>",
        "<main class=`"post-list`">",
        $(if ($messageHtml.Count -gt 0) { $messageHtml -join "`n" } else { $emptyText }),
        "</main>"
    ) -join "`n"

    $pagePath = Join-Path $channelPagesDir "$channelSlug.html"
    Save-Page -Template $template -Path $pagePath -Title "$channelTitle - $siteTitle" -Root "../" -Nav ($navTemplate.Replace("{{ROOT}}", "../")) -Content $body -GeneratedAt $generatedAt

    $count = $messageHtml.Count
    $indexCards += "<a class=`"channel-card`" href=`"channels/$([System.Net.WebUtility]::UrlEncode($channelSlug)).html`"><span>$([System.Net.WebUtility]::HtmlEncode($channelTitle))</span><small>$count posts</small></a>"
}

$indexContent = @(
    "<section class=`"page-heading`"><h1>$([System.Net.WebUtility]::HtmlEncode($siteTitle))</h1></section>",
    "<main class=`"channel-list`">",
    $($indexCards -join "`n"),
    "</main>"
) -join "`n"

Save-Page -Template $template -Path (Join-Path $outputDir "index.html") -Title $siteTitle -Root "" -Nav ($navTemplate.Replace("{{ROOT}}", "")) -Content $indexContent -GeneratedAt $generatedAt

Write-Host "Done. Generated site: $outputDir"
