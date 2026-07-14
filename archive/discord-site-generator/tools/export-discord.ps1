param(
    [Alias("Config")]
    [string]$ConfigPath,
    [switch]$NoFetch
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$defaultConfigPath = Join-Path $projectRoot "config.local.json"

function Resolve-ProjectPath {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return (Join-Path $script:projectRoot $Path)
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Copy-Directory {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        return
    }

    Ensure-Directory $Destination
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
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
    param(
        [string]$Text,
        [string]$GuildId,
        [hashtable]$ChannelLabels
    )

    if ([string]::IsNullOrEmpty($Text)) {
        return ""
    }

    $builder = [System.Text.StringBuilder]::new()
    $lastIndex = 0
    $matches = [regex]::Matches($Text, 'https?://\S+')

    foreach ($match in $matches) {
        if ($match.Index -gt $lastIndex) {
            [void]$builder.Append([System.Net.WebUtility]::HtmlEncode($Text.Substring($lastIndex, $match.Index - $lastIndex)))
        }

        $url = $match.Value
        $href = $url
        $trailing = ""

        while ($href.Length -gt 0 -and ".,!?)]、。！？）".Contains($href[$href.Length - 1])) {
            $trailing = $href[$href.Length - 1] + $trailing
            $href = $href.Substring(0, $href.Length - 1)
        }

        if ([string]::IsNullOrEmpty($href)) {
            [void]$builder.Append([System.Net.WebUtility]::HtmlEncode($url))
        } else {
            if ($href -match '^https://(?:www\.)?x\.com/og_ff14/?$') {
                $href = "https://x.com/ff14_recipe"
            } elseif ($href -match '^https://discord\.gg/GAVwZ9Ca/?$') {
                $href = "https://discord.gg/eZP5temK6e"
            }

            $discordChannelMatch = [regex]::Match($href, '^https://discord(?:app)?\.com/channels/(\d+)/(\d+)(?:/\d+)?/?$')
            if ($discordChannelMatch.Success -and -not [string]::IsNullOrWhiteSpace($GuildId) -and $discordChannelMatch.Groups[1].Value -eq $GuildId) {
                $linkedChannelId = $discordChannelMatch.Groups[2].Value
                $channelName = if ($ChannelLabels -and $ChannelLabels.ContainsKey($linkedChannelId)) {
                    [string]$ChannelLabels[$linkedChannelId]
                } else {
                    $linkedChannelId
                }
                $safeHref = [System.Net.WebUtility]::HtmlEncode($href)
                $safeChannelName = [System.Net.WebUtility]::HtmlEncode($channelName)
                $safeTrailing = [System.Net.WebUtility]::HtmlEncode($trailing)
                [void]$builder.Append("<a class=`"discord-channel-link`" href=`"$safeHref`" target=`"_blank`" rel=`"noopener noreferrer`"><span class=`"discord-channel-marker`">#</span> $safeChannelName</a>$safeTrailing")
                $lastIndex = $match.Index + $match.Length
                continue
            }

            $safeHref = [System.Net.WebUtility]::HtmlEncode($href)
            $safeTrailing = [System.Net.WebUtility]::HtmlEncode($trailing)
            [void]$builder.Append("<a href=`"$safeHref`" target=`"_blank`" rel=`"noopener noreferrer`">$safeHref</a>$safeTrailing")
        }

        $lastIndex = $match.Index + $match.Length
    }

    if ($lastIndex -lt $Text.Length) {
        [void]$builder.Append([System.Net.WebUtility]::HtmlEncode($Text.Substring($lastIndex)))
    }

    return ($builder.ToString() -replace "(`r`n|`n|`r)", "<br>")
}

function ConvertTo-ChannelLabelMap {
    param($ConfiguredLabels)

    $labels = @{
        "1516701219828138054" = "シェアコード広場"
    }

    if ($null -ne $ConfiguredLabels) {
        foreach ($property in $ConfiguredLabels.PSObject.Properties) {
            if (-not [string]::IsNullOrWhiteSpace($property.Name) -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
                $labels[[string]$property.Name] = [string]$property.Value
            }
        }
    }

    return $labels
}

function ConvertTo-SiteUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return "https://jogu6.github.io/ffxiv-recipe-about/"
    }

    $trimmed = $Url.Trim()
    if (-not $trimmed.EndsWith("/")) {
        $trimmed = "$trimmed/"
    }

    return $trimmed
}

function ConvertTo-JsonLd {
    param(
        [string]$Title,
        [string]$MetaTitle,
        [string]$Description,
        [string]$Keywords,
        [string]$SiteUrl
    )

    $data = [ordered]@{
        "@context" = "https://schema.org"
        "@graph" = @(
            [ordered]@{
                "@type" = "WebSite"
                "@id" = "$($SiteUrl)#website"
                name = $Title
                alternateName = @(
                    "FF14レシピ素材ツリー",
                    "Final Fantasy XIV Online レシピ素材ツリー",
                    "FFXIV レシピ素材ツリー"
                )
                headline = $MetaTitle
                description = $Description
                keywords = $Keywords
                url = $SiteUrl
                inLanguage = "ja"
                publisher = [ordered]@{
                    "@type" = "Organization"
                    name = "jogu6"
                    url = "https://github.com/jogu6"
                }
            },
            [ordered]@{
                "@type" = "WebApplication"
                "@id" = "$($SiteUrl)#webapp"
                name = "FF14レシピ素材ツリー"
                alternateName = @(
                    "Final Fantasy XIV Online レシピ素材ツリー",
                    "FFXIV レシピ素材ツリー"
                )
                description = $Description
                applicationCategory = "GameApplication"
                operatingSystem = "Web"
                url = "https://jogu6.github.io/ffxiv-recipe/"
                inLanguage = "ja"
                isAccessibleForFree = $true
                offers = [ordered]@{
                    "@type" = "Offer"
                    price = "0"
                    priceCurrency = "JPY"
                }
            }
        )
    }

    return ($data | ConvertTo-Json -Depth 8 -Compress)
}

function ConvertTo-KeywordString {
    param(
        $Value,
        [string[]]$DefaultKeywords
    )

    $keywords = @()
    if ($null -ne $Value) {
        if ($Value -is [array]) {
            $keywords = @($Value | ForEach-Object { [string]$_ })
        } else {
            $keywords = @([string]$Value -split ',')
        }
    }
    $keywords += $DefaultKeywords

    return (($keywords |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique) -join ", ")
}

function Save-RobotsTxt {
    param(
        [string]$Path,
        [string]$SiteUrl
    )

    $content = @(
        "User-agent: *",
        "Allow: /",
        "",
        "Sitemap: $($SiteUrl)sitemap.xml"
    ) -join "`n"

    Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

function Save-SitemapXml {
    param(
        [string]$Path,
        [string]$SiteUrl
    )

    $lastmod = (Get-Date).ToString("yyyy-MM-dd")
    $escapedSiteUrl = [System.Security.SecurityElement]::Escape($SiteUrl)
    $content = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        "    <loc>$escapedSiteUrl</loc>",
        "    <lastmod>$lastmod</lastmod>",
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
        '</urlset>'
    ) -join "`n"

    Set-Content -LiteralPath $Path -Value $content -Encoding UTF8
}

function ConvertFrom-MarkdownNoticeToHtml {
    param([string]$Markdown)

    if ([string]::IsNullOrWhiteSpace($Markdown)) {
        return ""
    }

    $html = [System.Text.StringBuilder]::new()
    $paragraph = [System.Collections.Generic.List[string]]::new()
    $listOpen = $false

    foreach ($line in ($Markdown -split "`r?`n")) {
        $trimmed = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            if ($paragraph.Count -gt 0) {
                [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
                $paragraph.Clear()
            }
            if ($listOpen) {
                [void]$html.AppendLine("</ul>")
                $listOpen = $false
            }
            continue
        }

        if ($trimmed -match '^#\s+') {
            if ($paragraph.Count -gt 0) {
                [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
                $paragraph.Clear()
            }
            if ($listOpen) {
                [void]$html.AppendLine("</ul>")
                $listOpen = $false
            }
            continue
        }

        if ($trimmed -match '^###\s+(.+)$') {
            if ($paragraph.Count -gt 0) {
                [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
                $paragraph.Clear()
            }
            if ($listOpen) {
                [void]$html.AppendLine("</ul>")
                $listOpen = $false
            }
            [void]$html.AppendLine("<h3>$(ConvertTo-HtmlText $Matches[1])</h3>")
            continue
        }

        if ($trimmed -match '^##\s+(.+)$') {
            if ($paragraph.Count -gt 0) {
                [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
                $paragraph.Clear()
            }
            if ($listOpen) {
                [void]$html.AppendLine("</ul>")
                $listOpen = $false
            }
            [void]$html.AppendLine("<h2>$(ConvertTo-HtmlText $Matches[1])</h2>")
            continue
        }

        if ($trimmed -match '^-\s+(.+)$') {
            if ($paragraph.Count -gt 0) {
                [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
                $paragraph.Clear()
            }
            if (-not $listOpen) {
                [void]$html.AppendLine("<ul>")
                $listOpen = $true
            }
            [void]$html.AppendLine("<li>$(ConvertTo-HtmlText $Matches[1])</li>")
            continue
        }

        if ($listOpen) {
            [void]$html.AppendLine("</ul>")
            $listOpen = $false
        }
        $paragraph.Add($trimmed)
    }

    if ($paragraph.Count -gt 0) {
        [void]$html.AppendLine("<p>$(ConvertTo-HtmlText ($paragraph -join " "))</p>")
    }
    if ($listOpen) {
        [void]$html.AppendLine("</ul>")
    }

    return $html.ToString().Trim()
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
        Accept = "application/json"
    }
    $userAgent = "ffxiv-recipe-about (https://github.com/jogu6/ffxiv-recipe-about, 0.2)"
    $messages = @()
    $before = $null

    while ($messages.Count -lt $MaxMessages) {
        $limit = [Math]::Min(100, $MaxMessages - $messages.Count)
        $uri = "https://discord.com/api/v10/channels/$ChannelId/messages?limit=$limit"
        if ($before) {
            $uri = "$uri&before=$before"
        }

        $batch = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -UserAgent $userAgent
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
        [string]$MetaTitle,
        [string]$Description,
        [string]$Keywords,
        [string]$SiteUrl,
        [string]$StructuredData,
        [string]$Root,
        [string]$Nav,
        [string]$Content,
        [string]$LicenseNotice,
        [string]$GeneratedAt
    )

    $html = $Template.
        Replace("{{TITLE}}", [System.Net.WebUtility]::HtmlEncode($Title)).
        Replace("{{META_TITLE}}", [System.Net.WebUtility]::HtmlEncode($MetaTitle)).
        Replace("{{DESCRIPTION}}", [System.Net.WebUtility]::HtmlEncode($Description)).
        Replace("{{KEYWORDS}}", [System.Net.WebUtility]::HtmlEncode($Keywords)).
        Replace("{{SITE_URL}}", [System.Net.WebUtility]::HtmlEncode($SiteUrl)).
        Replace("{{STRUCTURED_DATA}}", $StructuredData).
        Replace("{{ROOT}}", $Root).
        Replace("{{NAV}}", $Nav).
        Replace("{{CONTENT}}", $Content).
        Replace("{{LICENSE_NOTICE}}", $LicenseNotice).
        Replace("{{GENERATED_AT}}", [System.Net.WebUtility]::HtmlEncode($GeneratedAt))

    Set-Content -LiteralPath $Path -Value $html -Encoding UTF8
}

$resolvedConfigPath = if ([string]::IsNullOrWhiteSpace($ConfigPath)) { $defaultConfigPath } else { Resolve-ProjectPath $ConfigPath }
if (-not (Test-Path -LiteralPath $resolvedConfigPath)) {
    throw "Config file not found: $resolvedConfigPath. Copy config.example.json to config.local.json and edit it."
}

$settings = Get-Content -LiteralPath $resolvedConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($settings.botToken)) {
    throw "botToken is required in config."
}

$siteTitle = if ($settings.siteTitle) { [string]$settings.siteTitle } else { "FF14レシピ素材ツリー とは？" }
$siteMetaTitle = if ($settings.siteMetaTitle) { [string]$settings.siteMetaTitle } else { "FF14レシピ素材ツリーとは？ 素材検索・レシピ逆引き・制作支援ツール紹介" }
$siteDescription = if ($settings.siteDescription) { [string]$settings.siteDescription } else { "FF14 / Final Fantasy XIV Online / FFXIV のクラフター制作に必要な素材を、レシピツリー、素材リスト、逆引き、お気に入り共有で確認できるWebツール「FF14レシピ素材ツリー」の紹介ページです。スマホにも対応しています。" }
$siteKeywords = ConvertTo-KeywordString -Value $settings.siteKeywords -DefaultKeywords @(
    "FF14",
    "Final Fantasy XIV Online",
    "Final Fantasy XIV",
    "FFXIV",
    "レシピ",
    "素材",
    "素材ツリー",
    "レシピ検索",
    "素材検索",
    "クラフター",
    "ギャザラー",
    "制作",
    "中間素材",
    "逆引き",
    "お気に入り共有",
    "スマホ対応"
)
$siteUrl = ConvertTo-SiteUrl $(if ($settings.siteUrl) { [string]$settings.siteUrl } else { "https://jogu6.github.io/ffxiv-recipe-about/" })
$guildId = if ($settings.guildId) { [string]$settings.guildId } else { $null }
$channelId = if ($settings.channelId) { [string]$settings.channelId } else { $null }
$channelTitle = if ($settings.channelTitle) { [string]$settings.channelTitle } else { $siteTitle }
$channelLabels = ConvertTo-ChannelLabelMap $settings.channelLabels
$outputDirName = if ($settings.outputDir) { [string]$settings.outputDir } else { "docs" }
$maxMessages = if ($settings.maxMessages) { [int]$settings.maxMessages } else { 100 }
$downloadImages = if ($null -ne $settings.downloadImages) { [bool]$settings.downloadImages } else { $true }

if ([string]::IsNullOrWhiteSpace($channelId)) {
    throw "channelId is required in config."
}

$outputDir = Resolve-ProjectPath $outputDirName
$assetsDir = Join-Path $outputDir "assets"
$imageRoot = Join-Path $assetsDir "images"
$cacheDir = Join-Path $projectRoot "data\cache"
$cachePath = Join-Path $cacheDir "messages.json"

Ensure-Directory $outputDir
Ensure-Directory $assetsDir
Ensure-Directory $imageRoot

Copy-Item -LiteralPath (Join-Path $projectRoot "src\styles.css") -Destination (Join-Path $assetsDir "styles.css") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "src\app.js") -Destination (Join-Path $assetsDir "app.js") -Force
Copy-Directory -Source (Join-Path $projectRoot "src\assets\app-icons") -Destination (Join-Path $assetsDir "app-icons")
$template = Get-Content -LiteralPath (Join-Path $projectRoot "src\site-template.html") -Raw -Encoding UTF8
$licenseNoticePath = Join-Path $projectRoot "src\license-notice.md"
$licenseNotice = if (Test-Path -LiteralPath $licenseNoticePath) {
    ConvertFrom-MarkdownNoticeToHtml (Get-Content -LiteralPath $licenseNoticePath -Raw -Encoding UTF8)
} else {
    ""
}
$structuredData = ConvertTo-JsonLd -Title $siteTitle -MetaTitle $siteMetaTitle -Description $siteDescription -Keywords $siteKeywords -SiteUrl $siteUrl
$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")

$nav = '<a href="index.html">Home</a>'
$channelImageDir = Join-Path $imageRoot $channelId
Ensure-Directory $channelImageDir

if ($NoFetch) {
    if (-not (Test-Path -LiteralPath $cachePath)) {
        throw "Cache file not found: $cachePath. Run without -NoFetch once."
    }

    Write-Host "Using cached messages: $cachePath"
    $messages = Get-Content -LiteralPath $cachePath -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
    Write-Host "Fetching channel: $channelTitle ($channelId)"
    $messages = Get-DiscordMessages -ChannelId $channelId -BotToken $settings.botToken -MaxMessages $maxMessages
    Ensure-Directory $cacheDir
    $messages | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $cachePath -Encoding UTF8
}

$messageHtml = @()
foreach ($message in $messages) {
    $hasText = -not [string]::IsNullOrWhiteSpace($message.content)
    $imageHtml = @()

    foreach ($attachment in @($message.attachments)) {
        if (-not (Test-IsImageAttachment -Attachment $attachment)) {
            continue
        }

        $fileName = ConvertTo-SafeFileName $attachment.filename
        $attachmentId = if ($attachment.id) { [string]$attachment.id } else { [guid]::NewGuid().ToString("N") }
        $localFileName = "$($message.id)-$attachmentId-$fileName"
        $localPath = Join-Path $channelImageDir $localFileName
        $relativeImagePath = "assets/images/$channelId/$localFileName"

        if ($downloadImages -and -not (Test-Path -LiteralPath $localPath)) {
            Write-Host "Downloading image: $fileName"
            Invoke-WebRequest -Uri $attachment.url -OutFile $localPath
        }

        $alt = [System.Net.WebUtility]::HtmlEncode($fileName)
        $src = [System.Net.WebUtility]::HtmlEncode($relativeImagePath)
        $imageHtml += "<figure class=`"image-frame`"><img src=`"$src`" alt=`"$alt`" loading=`"lazy`"><button class=`"zoom-button`" type=`"button`" aria-label=`"画像を拡大`" title=`"画像を拡大`">⌕</button></figure>"
    }

    if (-not $hasText -and $imageHtml.Count -eq 0) {
        continue
    }

    $parts = @('<article class="post">')
    if ($hasText) {
        $parts += "<p>$(ConvertTo-HtmlText -Text $message.content -GuildId $guildId -ChannelLabels $channelLabels)</p>"
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
$indexContent = @(
    "<section class=`"page-heading`"><div class=`"heading-row`"><h1><img class=`"heading-icon`" src=`"assets/app-icons/favicon.png`" alt=`"`">$([System.Net.WebUtility]::HtmlEncode($siteTitle))</h1><button class=`"license-button`" id=`"licenseBtn`" type=`"button`">LICENSE</button></div><a class=`"app-open-button`" href=`"https://jogu6.github.io/ffxiv-recipe/`"><img src=`"assets/app-icons/favicon.png`" alt=`"`">FF14レシピ素材ツールを開く</a></section>",
    "<main class=`"post-list`">",
    $(if ($messageHtml.Count -gt 0) { $messageHtml -join "`n" } else { $emptyText }),
    "</main>"
) -join "`n"

Save-Page -Template $template -Path (Join-Path $outputDir "index.html") -Title $siteTitle -MetaTitle $siteMetaTitle -Description $siteDescription -Keywords $siteKeywords -SiteUrl $siteUrl -StructuredData $structuredData -Root "" -Nav $nav -Content $indexContent -LicenseNotice $licenseNotice -GeneratedAt $generatedAt
Save-RobotsTxt -Path (Join-Path $outputDir "robots.txt") -SiteUrl $siteUrl
Save-SitemapXml -Path (Join-Path $outputDir "sitemap.xml") -SiteUrl $siteUrl

Write-Host "Done. Generated site: $outputDir"


