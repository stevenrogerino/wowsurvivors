# make3d setup for Windows + NVIDIA. Run via setup.bat.
#
# Installs everything make3d needs into %LOCALAPPDATA%\make3d (a short path,
# clear of Windows' 260-character limit and of this repo, so updating the repo
# never disturbs it), plus two system tools for the texture step, then
# downloads the AI models once so make3d runs offline afterwards. Safe to run again: finished steps are skipped, so after
# a failure, fix what it says and run it again.
#
#   setup.bat                          everything (models: hunyuan, hunyuan-mv)
#   setup.bat -Models hunyuan-mini     also/only other models
#   setup.bat -NoTexture               skip the texture step's GPU kernel
param(
  [string]$Models = 'hunyuan,hunyuan-mv',
  [switch]$NoTexture
)

# Continue, not Stop: Windows PowerShell 5.1 turns any stderr output from a
# program into a fatal error under Stop. Every step checks its own result.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is 10x slower with the progress bar
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Join-Path $env:LOCALAPPDATA 'make3d'
$Vendor = Join-Path $Root 'vendor'
$Venv = Join-Path $Root '.venv'
$Py = Join-Path $Venv 'Scripts\python.exe'
$HunyuanCommit = 'f8db63096c8282cb27354314d896feba5ba6ff8a'   # keep in step with backends.py
$HunyuanDir = Join-Path $Vendor 'Hunyuan3D-2'
New-Item -ItemType Directory -Force -Path $Vendor | Out-Null
Write-Host "Installing make3d into $Root" 
Start-Transcript -Path (Join-Path $Root 'setup.log') -Append | Out-Null

function Step($n, $msg) { Write-Host ""; Write-Host "[$n/8] $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "  $msg" }
function Fail($msg) {
  Write-Host ""
  Write-Host "SETUP STOPPED: $msg" -ForegroundColor Red
  Write-Host "Details are in $Root\setup.log. Fix the problem above and run setup.bat again." -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}
# Call right after running a program: stops setup if it failed. (Programs are
# called directly - never through a helper - so PowerShell passes arguments
# like --python through untouched.)
function Check([string]$what) {
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)." }
}
function Download($url, $to) {
  Info "downloading $url"
  try { Invoke-WebRequest -Uri $url -OutFile $to -UseBasicParsing -ErrorAction Stop } catch { Fail "could not download $url ($_)" }
}
function Unzip($zip, $to) {
  try { Expand-Archive -Path $zip -DestinationPath $to -Force -ErrorAction Stop } catch { Fail "could not unpack $zip ($_)" }
}

# ---------------------------------------------------------------- 1. GPU
Step 1 'Checking the graphics card'
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $smi) { Fail 'No NVIDIA driver found (nvidia-smi is missing). Install the latest Game Ready or Studio driver from nvidia.com.' }
$gpu = (& nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader | Select-Object -First 1)
Info $gpu
$cap = ($gpu -split ',')[-1].Trim()                    # e.g. 12.0 for an RTX 50-series card
$memMB = [int](($gpu -split ',')[1] -replace '[^0-9]', '')
if ($memMB -lt 8000) { Write-Host "  Warning: under 8 GB of video memory. Use make3d --low-vram and --quality draft." -ForegroundColor Yellow }

# ---------------------------------------------------------------- 2. uv + Python
Step 2 'Python (a private copy, managed by uv)'
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
  Info 'installing uv'
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
  $uv = Get-Command uv -ErrorAction SilentlyContinue
  if (-not $uv) { Fail 'uv did not install. See https://docs.astral.sh/uv/ and install it by hand.' }
}
if (-not (Test-Path $Py)) { uv venv --python 3.11 $Venv; Check 'Creating the Python environment' }
Info (& $Py --version)

# ---------------------------------------------------------------- 3. PyTorch
Step 3 'PyTorch for CUDA 12.8 (needed by RTX 50-series cards)'
uv pip install --python $Py 'torch==2.7.1' 'torchvision==0.22.1' --index-url https://download.pytorch.org/whl/cu128
Check 'Installing PyTorch'
& $Py -c "import torch,sys; ok=torch.cuda.is_available(); print('  PyTorch', torch.__version__, '- GPU:', torch.cuda.get_device_name(0) if ok else 'NOT VISIBLE'); sys.exit(0 if ok else 1)"
if ($LASTEXITCODE -ne 0) { Fail 'PyTorch cannot see the GPU. Update the NVIDIA driver (it must support CUDA 12.8) and run setup again.' }

# ---------------------------------------------------------------- 4. Hunyuan3D code + libraries
Step 4 'Hunyuan3D-2 code and libraries'
if (-not (Test-Path (Join-Path $HunyuanDir 'setup.py'))) {
  $zip = Join-Path $Vendor 'hunyuan.zip'
  Download "https://github.com/Tencent/Hunyuan3D-2/archive/$HunyuanCommit.zip" $zip
  Unzip $zip $Vendor
  if (Test-Path $HunyuanDir) { Remove-Item -Recurse -Force $HunyuanDir }
  Rename-Item -Path (Join-Path $Vendor "Hunyuan3D-2-$HunyuanCommit") -NewName 'Hunyuan3D-2' -ErrorAction Stop
  Remove-Item $zip
}
uv pip install --python $Py -r (Join-Path $Here 'requirements-windows.lock')
Check 'Installing libraries'
uv pip install --python $Py --no-deps -e $HunyuanDir
Check 'Installing Hunyuan3D'

# ---------------------------------------------------------------- 5. Texture kernel
Step 5 'Texture step: building its GPU kernel'
# Texture is optional: if this part fails, say why and carry on, so make3d
# still works (untextured) and the models still get downloaded.
function Build-TextureKernel {
  # Program output goes to Out-Host: inside a function it would otherwise
  # become part of the return value, which here means "the problem".
  # a) Microsoft C++ Build Tools
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  $vsPath = $null
  if (Test-Path $vswhere) { $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
  if (-not $vsPath) {
    # Microsoft's own installer, fetched directly: winget is missing on some
    # Windows installs. Windows asks for permission (a Yes/No prompt).
    Info 'installing Visual Studio 2022 Build Tools (C++), about 5 GB - this takes a while'
    Info 'Windows will ask for permission: click Yes.'
    $vsExe = Join-Path $Vendor 'vs_BuildTools.exe'
    try { Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile $vsExe -UseBasicParsing -ErrorAction Stop }
    catch { return "could not download the Visual Studio Build Tools installer ($_)" }
    $p = Start-Process -FilePath $vsExe -Verb RunAs -Wait -PassThru -ArgumentList '--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    Remove-Item $vsExe -ErrorAction SilentlyContinue
    if ($p -and $p.ExitCode -eq 3010) { Info 'installed (Windows wants a restart; that can wait until setup is done)' }
    elseif ($p -and $p.ExitCode -ne 0) { Info "the installer returned code $($p.ExitCode)" }
    if (Test-Path $vswhere) { $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
    if (-not $vsPath) { return 'Visual Studio Build Tools did not install. Install "Build Tools for Visual Studio 2022" with "Desktop development with C++" from visualstudio.microsoft.com, or run setup.bat -NoTexture.' }
  }
  $vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
  Info "C++ tools: $vsPath"

  # b) NVIDIA CUDA Toolkit 12.8 (must match PyTorch's CUDA version)
  $cudaHome = $env:CUDA_PATH_V12_8
  if (-not $cudaHome -or -not (Test-Path (Join-Path $cudaHome 'bin\nvcc.exe'))) {
    $cudaHome = 'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8'
  }
  if (-not (Test-Path (Join-Path $cudaHome 'bin\nvcc.exe'))) {
    Info 'installing the NVIDIA CUDA Toolkit 12.8, about 3 GB - this takes a while'
    Info 'Windows will ask for permission: click Yes.'
    # NVIDIA's installer, fetched directly (winget is missing on some PCs).
    $exe = Join-Path $Vendor 'cuda_12.8.1_windows_network.exe'
    try { Invoke-WebRequest -Uri 'https://developer.download.nvidia.com/compute/cuda/12.8.1/network_installers/cuda_12.8.1_windows_network.exe' -OutFile $exe -UseBasicParsing -ErrorAction Stop }
    catch { return "could not download the CUDA Toolkit installer ($_)" }
    Info 'running the CUDA installer silently'
    Start-Process -FilePath $exe -Verb RunAs -Wait -ArgumentList '-s'
    Remove-Item $exe -ErrorAction SilentlyContinue
    if (-not (Test-Path (Join-Path $cudaHome 'bin\nvcc.exe'))) { return 'CUDA Toolkit 12.8 did not install. Get it from developer.nvidia.com/cuda-12-8-1-download-archive, or run setup.bat -NoTexture.' }
  }
  Info "CUDA: $cudaHome"

  # c) Build, inside the C++ tools' environment.
  $src = Join-Path $HunyuanDir 'hy3dgen\texgen\custom_rasterizer'
  $uvExe = (Get-Command uv).Source
  # A little batch file: quoting a whole command line through PowerShell into
  # cmd is fragile, and vcvars64.bat has to run in the same cmd session.
  $bat = Join-Path $Root 'build-texture.bat'
  @(
    '@echo off',
    "call `"$vcvars`" >nul || exit /b 1",
    'set "DISTUTILS_USE_SDK=1"',
    "set `"CUDA_HOME=$cudaHome`"",
    "set `"PATH=$cudaHome\bin;%PATH%`"",
    "set `"TORCH_CUDA_ARCH_LIST=$cap`"",
    'set "NVCC_APPEND_FLAGS=-allow-unsupported-compiler"',
    "`"$uvExe`" pip install --python `"$Py`" --no-build-isolation `"$src`""
  ) | Set-Content -Path $bat -Encoding ASCII
  Info 'compiling (a few minutes)'
  cmd /c "`"$bat`"" | Out-Host
  if ($LASTEXITCODE -ne 0) { return 'Building the texture kernel failed; the error is above. You can still use make3d without textures: setup.bat -NoTexture.' }
  & $Py -c "import custom_rasterizer; print('  texture kernel ready')" | Out-Host
  if ($LASTEXITCODE -ne 0) { return 'The texture kernel built but will not load.' }
  return $null
}
$TextureProblem = $null
# find_spec, not import: a failed import prints a traceback that PowerShell shows as an error.
& $Py -c "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('custom_rasterizer') else 1)"
if ($LASTEXITCODE -eq 0) { Info 'already built' }
elseif ($NoTexture) { Info 'skipped (-NoTexture); make3d will make untextured models' }
else {
  $TextureProblem = Build-TextureKernel
  if ($TextureProblem) {
    Write-Host "  Texture step not ready: $TextureProblem" -ForegroundColor Yellow
    Write-Host '  Carrying on: make3d will make untextured models until this is fixed and setup is run again.' -ForegroundColor Yellow
  }
}

# ---------------------------------------------------------------- 6. Node.js
Step 6 'Node.js (runs the rigging step)'
$node = Join-Path $Vendor 'node\node.exe'
if (Test-Path $node) { Info ('already installed: ' + (& $node --version)) }
elseif (Get-Command node -ErrorAction SilentlyContinue) { Info ('using the system Node.js ' + (& node --version)) }
else {
  try { $sums = (Invoke-WebRequest -Uri 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -UseBasicParsing -ErrorAction Stop).Content } catch { Fail "could not reach nodejs.org ($_)" }
  $file = ($sums -split "`n" | Where-Object { $_ -match 'node-v[\d.]+-win-x64\.zip' } | ForEach-Object { ($_ -split '\s+')[1] } | Select-Object -First 1)
  if (-not $file) { Fail 'could not find the Node.js download.' }
  $zip = Join-Path $Vendor $file
  Download "https://nodejs.org/dist/latest-v22.x/$file" $zip
  Unzip $zip $Vendor
  Rename-Item -Path (Join-Path $Vendor ($file -replace '\.zip$', '')) -NewName 'node' -ErrorAction Stop
  Remove-Item $zip
  Info ('installed ' + (& $node --version))
}

# ---------------------------------------------------------------- 7. Models
Step 7 "Downloading AI models once ($Models) - several GB, this takes a while"
$texFlag = if ($NoTexture) { '0' } else { '1' }
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
& $Py (Join-Path $Here 'fetch_models.py') $Models $texFlag
Check 'Downloading models'

# ---------------------------------------------------------------- 8. Check
Step 8 'Checking everything'
$env:HF_HUB_OFFLINE = '1'
& $Py (Join-Path $Here 'make3d.py') --doctor
Write-Host ""
if ($TextureProblem) { Write-Host "Setup finished WITHOUT textures: $TextureProblem" -ForegroundColor Yellow }
Write-Host 'Setup finished. Drag a picture onto make3d.bat, or run:  make3d.bat mypicture.png' -ForegroundColor Green
Stop-Transcript | Out-Null
