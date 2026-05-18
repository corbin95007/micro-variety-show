param(
  [string]$WorkbookPath = (Join-Path $PSScriptRoot '..\..\plan\题库.xlsx'),
  [string]$EnvPath = (Join-Path $PSScriptRoot '..\.env'),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Resolve-ExistingPath([string]$PathValue) {
  return (Resolve-Path -LiteralPath $PathValue).Path
}

function Read-EnvFile([string]$PathValue) {
  $values = @{}

  foreach ($line in Get-Content -LiteralPath $PathValue) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $parts = $trimmed -split '=', 2
    if ($parts.Count -ne 2) {
      continue
    }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }

  return $values
}

function ConvertTo-NullableText($Value) {
  if ($null -eq $Value) {
    return $null
  }

  $text = [string]$Value
  $text = $text.Trim()
  if ($text -eq '') {
    return $null
  }

  return $text
}

function ConvertTo-NumberOrNull($Value) {
  $text = ConvertTo-NullableText $Value
  if ($null -eq $text) {
    return $null
  }

  $match = [regex]::Match($text, '[+-]?\d+')
  if (-not $match.Success) {
    throw "无法解析数值: $text"
  }

  return [int]$match.Value
}

function Get-WeightOrDefault($DimensionValue, $WeightValue) {
  if (-not $DimensionValue) {
    return $null
  }

  $parsedWeight = ConvertTo-NumberOrNull $WeightValue
  if ($null -eq $parsedWeight) {
    return 1
  }

  return $parsedWeight
}

function Get-ColumnIndex([string]$CellReference) {
  $letters = ($CellReference -replace '\d', '').ToUpperInvariant()
  $index = 0

  foreach ($letter in $letters.ToCharArray()) {
    $index = ($index * 26) + ([int][char]$letter - [int][char]'A' + 1)
  }

  return $index
}

function New-WorkbookContext([string]$PathValue) {
  $workbookStream = [System.IO.FileStream]::new(
    $PathValue,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite
  )
  $zip = [System.IO.Compression.ZipArchive]::new($workbookStream, [System.IO.Compression.ZipArchiveMode]::Read, $false)

  function Get-EntryText([string]$EntryPath) {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq $EntryPath } | Select-Object -First 1
    if (-not $entry) {
      return $null
    }

    $stream = $entry.Open()
    try {
      $reader = [System.IO.StreamReader]::new($stream)
      try {
        return $reader.ReadToEnd()
      } finally {
        $reader.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
  }

  $sharedStrings = @()
  $sharedXmlText = Get-EntryText 'xl/sharedStrings.xml'
  if ($sharedXmlText) {
    $sharedXml = [xml]$sharedXmlText
    $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
    $sharedNs.AddNamespace('d', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

    foreach ($si in $sharedXml.SelectNodes('//d:sst/d:si', $sharedNs)) {
      $parts = $si.SelectNodes('.//d:t', $sharedNs) | ForEach-Object { $_.InnerText }
      $sharedStrings += ($parts -join '')
    }
  }

  $workbookXml = [xml](Get-EntryText 'xl/workbook.xml')
  $relsXml = [xml](Get-EntryText 'xl/_rels/workbook.xml.rels')

  $workbookNs = [System.Xml.XmlNamespaceManager]::new($workbookXml.NameTable)
  $workbookNs.AddNamespace('d', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

  $relsNs = [System.Xml.XmlNamespaceManager]::new($relsXml.NameTable)
  $relsNs.AddNamespace('d', 'http://schemas.openxmlformats.org/package/2006/relationships')

  $relationshipMap = @{}
  foreach ($rel in $relsXml.SelectNodes('//d:Relationships/d:Relationship', $relsNs)) {
    $relationshipMap[$rel.Id] = $rel.Target
  }

  return [pscustomobject]@{
    Zip = $zip
    WorkbookStream = $workbookStream
    SharedStrings = $sharedStrings
    WorkbookXml = $workbookXml
    WorkbookNs = $workbookNs
    RelationshipMap = $relationshipMap
  }
}

function Read-CellValue($Cell, $SheetNs, $SharedStrings) {
  $type = $Cell.GetAttribute('t')

  if ($type -eq 'inlineStr') {
    $parts = $Cell.SelectNodes('.//d:is/d:t', $SheetNs) | ForEach-Object { $_.InnerText }
    return ($parts -join '')
  }

  $valueNode = $Cell.SelectSingleNode('./d:v', $SheetNs)
  if (-not $valueNode) {
    return $null
  }

  $rawValue = $valueNode.InnerText
  if ($type -eq 's') {
    $index = [int]$rawValue
    if ($index -ge 0 -and $index -lt $SharedStrings.Count) {
      return $SharedStrings[$index]
    }
  }

  return $rawValue
}

function Read-SheetRows($Context, [string]$SheetName, [int]$ColumnCount) {
  $sheetNode = $Context.WorkbookXml.SelectNodes('//d:sheets/d:sheet', $Context.WorkbookNs) |
    Where-Object { $_.GetAttribute('name') -eq $SheetName } |
    Select-Object -First 1

  if (-not $sheetNode) {
    throw "未找到工作表: $SheetName"
  }

  $relationshipId = $sheetNode.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
  $target = $Context.RelationshipMap[$relationshipId]
  if (-not $target) {
    throw "工作表缺少关系定义: $SheetName"
  }

  $sheetPath = 'xl/' + $target.Replace('../', '')
  $entry = $Context.Zip.Entries | Where-Object { $_.FullName -eq $sheetPath } | Select-Object -First 1
  if (-not $entry) {
    throw "未找到工作表 XML: $sheetPath"
  }

  $stream = $entry.Open()
  try {
    $reader = [System.IO.StreamReader]::new($stream)
    try {
      $sheetXml = [xml]$reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  $sheetNs = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
  $sheetNs.AddNamespace('d', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')

  $rows = [System.Collections.ArrayList]::new()
  foreach ($rowNode in $sheetXml.SelectNodes('//d:sheetData/d:row', $sheetNs)) {
    $cells = @{}

    foreach ($cell in $rowNode.SelectNodes('./d:c', $sheetNs)) {
      $columnIndex = Get-ColumnIndex $cell.GetAttribute('r')
      if ($columnIndex -le $ColumnCount) {
        $cells[$columnIndex - 1] = Read-CellValue $cell $sheetNs $Context.SharedStrings
      }
    }

    [void]$rows.Add([pscustomobject]@{
      Cells = $cells
      ColumnCount = $ColumnCount
    })
  }

  return [pscustomobject]@{
    Rows = $rows
  }
}

function Get-HeaderMap {
  param($HeaderRow)

  $headers = @{}

  for ($i = 0; $i -lt $HeaderRow.ColumnCount; $i++) {
    $header = ConvertTo-NullableText $HeaderRow.Cells[$i]
    if ($header) {
      $headers[$header] = $i
    }
  }

  return $headers
}

function Get-RequiredColumn($HeaderMap, [string[]]$Names, [string]$SheetName) {
  foreach ($name in $Names) {
    if ($HeaderMap.ContainsKey($name)) {
      return $HeaderMap[$name]
    }
  }

  throw "工作表 $SheetName 缺少必需列: $($Names -join ' / ')"
}

function Get-OptionalColumn($HeaderMap, [string[]]$Names) {
  foreach ($name in $Names) {
    if ($HeaderMap.ContainsKey($name)) {
      return $HeaderMap[$name]
    }
  }

  return $null
}

function Get-RowValue($Row, $ColumnIndex) {
  if ($null -eq $ColumnIndex) {
    return $null
  }

  if ($ColumnIndex -lt 0 -or $ColumnIndex -ge $Row.ColumnCount) {
    return $null
  }

  return $Row.Cells[$ColumnIndex]
}

function Get-QuestionRecords($Context) {
  $rows = (Read-SheetRows $Context '题库与发分表' 12).Rows
  if ($rows.Count -eq 0) {
    return @()
  }

  $headers = Get-HeaderMap -HeaderRow ($rows[0])
  $sortOrderColumn = Get-RequiredColumn -HeaderMap $headers -Names @('题目编号', '序号') -SheetName '题库与发分表'
  $questionTextColumn = Get-RequiredColumn -HeaderMap $headers -Names @('题目', '题目文本') -SheetName '题库与发分表'
  $dimension1Column = Get-RequiredColumn -HeaderMap $headers -Names @('影响维度1', '维度1') -SheetName '题库与发分表'
  $weight1Column = Get-RequiredColumn -HeaderMap $headers -Names @('维度1权重', '权重1') -SheetName '题库与发分表'
  $dimension2Column = Get-OptionalColumn -HeaderMap $headers -Names @('影响维度2', '维度2')
  $weight2Column = Get-OptionalColumn -HeaderMap $headers -Names @('维度2权重', '权重2')
  $stronglyAgreeColumn = Get-RequiredColumn -HeaderMap $headers -Names @('【极度赞同】触发标签', '极度赞同触发标签') -SheetName '题库与发分表'
  $agreeColumn = Get-RequiredColumn -HeaderMap $headers -Names @('【部分赞同】触发标签', '部分赞同触发标签') -SheetName '题库与发分表'
  $neutralColumn = Get-RequiredColumn -HeaderMap $headers -Names @('【中立】触发标签', '中立触发标签') -SheetName '题库与发分表'
  $disagreeColumn = Get-RequiredColumn -HeaderMap $headers -Names @('【部分不赞同】触发标签', '部分不赞同触发标签') -SheetName '题库与发分表'
  $stronglyDisagreeColumn = Get-RequiredColumn -HeaderMap $headers -Names @('【极度不赞同】触发标签', '极度不赞同触发标签') -SheetName '题库与发分表'

  $records = @()

  for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $sortOrder = ConvertTo-NumberOrNull (Get-RowValue $row $sortOrderColumn)
    $questionText = ConvertTo-NullableText (Get-RowValue $row $questionTextColumn)

    if ($null -eq $sortOrder -or $null -eq $questionText) {
      continue
    }

    $dimension1 = ConvertTo-NullableText (Get-RowValue $row $dimension1Column)
    $dimension2 = ConvertTo-NullableText (Get-RowValue $row $dimension2Column)

    $records += [ordered]@{
      question_text = $questionText
      sort_order = $sortOrder
      dimension1 = $dimension1
      weight1 = Get-WeightOrDefault $dimension1 (Get-RowValue $row $weight1Column)
      dimension2 = $dimension2
      weight2 = Get-WeightOrDefault $dimension2 (Get-RowValue $row $weight2Column)
      tag_strongly_agree = ConvertTo-NullableText (Get-RowValue $row $stronglyAgreeColumn)
      tag_agree = ConvertTo-NullableText (Get-RowValue $row $agreeColumn)
      tag_neutral = ConvertTo-NullableText (Get-RowValue $row $neutralColumn)
      tag_disagree = ConvertTo-NullableText (Get-RowValue $row $disagreeColumn)
      tag_strongly_disagree = ConvertTo-NullableText (Get-RowValue $row $stronglyDisagreeColumn)
    }
  }

  return $records
}

function Get-TagThresholds($Context) {
  $rows = (Read-SheetRows $Context '标签结算核对表' 4).Rows
  if ($rows.Count -eq 0) {
    return @{}
  }

  $headers = Get-HeaderMap -HeaderRow ($rows[0])
  $tagNameColumn = Get-RequiredColumn -HeaderMap $headers -Names @('最终标签名', '标签名') -SheetName '标签结算核对表'
  $minScoreColumn = Get-RequiredColumn -HeaderMap $headers -Names @('触发该标签的最低要求分数', '最低要求分数', '最低分数') -SheetName '标签结算核对表'
  $records = @{}

  for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $tagName = ConvertTo-NullableText (Get-RowValue $row $tagNameColumn)
    $minScore = ConvertTo-NumberOrNull (Get-RowValue $row $minScoreColumn)

    if ($tagName -and $null -ne $minScore) {
      $records[$tagName] = $minScore
    }
  }

  return $records
}

function Invoke-SupabaseRequest([string]$Method, [string]$Uri, $Headers, $Body = $null) {
  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    UserAgent = 'codex-question-bank-import/1.0'
  }

  if ($null -ne $Body) {
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $params.ContentType = 'application/json; charset=utf-8'
  }

  return Invoke-RestMethod @params
}

$resolvedWorkbookPath = Resolve-ExistingPath $WorkbookPath
$resolvedEnvPath = Resolve-ExistingPath $EnvPath
$context = New-WorkbookContext $resolvedWorkbookPath

try {
  $questions = Get-QuestionRecords $context
  $thresholds = Get-TagThresholds $context

  Write-Output ("已解析题目 {0} 条" -f $questions.Count)
  Write-Output ("标签阈值: {0}" -f (($thresholds.GetEnumerator() | Sort-Object Name | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value }) -join ', '))

  if ($DryRun) {
    $questions | Select-Object -First 3 | ConvertTo-Json -Depth 5
    return
  }

  $envValues = Read-EnvFile $resolvedEnvPath
  $supabaseUrl = $envValues['SUPABASE_URL']
  $serviceRoleKey = $envValues['SUPABASE_SERVICE_ROLE_KEY']

  if (-not $supabaseUrl -or -not $serviceRoleKey) {
    throw '.env 中缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY'
  }

  $restBase = $supabaseUrl.TrimEnd('/') + '/rest/v1'
  $headers = @{
    apikey = $serviceRoleKey
  }

  Invoke-SupabaseRequest 'Delete' ($restBase + '/tests?id=gte.0') $headers | Out-Null
  $insertHeaders = $headers.Clone()
  $insertHeaders['Prefer'] = 'return=representation'
  $inserted = Invoke-SupabaseRequest 'Post' ($restBase + '/tests') $insertHeaders (($questions | ConvertTo-Json -Depth 5 -Compress))

  Write-Output ("已导入题目 {0} 条到 tests 表" -f @($inserted).Count)
} finally {
  if ($context -and $context.Zip) {
    $context.Zip.Dispose()
  }
  if ($context -and $context.WorkbookStream) {
    $context.WorkbookStream.Dispose()
  }
}
