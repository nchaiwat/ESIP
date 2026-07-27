# ESIP GitHub setup

Repository: https://github.com/nchaiwat/ESIP.git

## 1. Check the local workspace

This copied workspace currently has an empty `.git` folder. If `git status` says
`not a git repository`, initialize it again:

```powershell
cd D:\Python\ESIP
git init
git branch -M main
git remote add origin https://github.com/nchaiwat/ESIP.git
```

If the remote already exists:

```powershell
git remote set-url origin https://github.com/nchaiwat/ESIP.git
```

## 2. Confirm ignored business data

Before the first commit, run:

```powershell
git status --short
```

Do not commit real files from:

- `.env`
- `SourceFiles/**/incoming`
- `MasterData/**/incoming`
- `ReferenceFiles`
- `output`
- local databases, logs, backups, and preview archives

These paths are ignored by `.gitignore` so GitHub receives source code,
configuration templates, schemas, scripts, docs, and UI only.

## 3. First push

```powershell
git add .
git status --short
git commit -m "Initial ESIP workspace"
git push -u origin main
```

If Git asks for login, use GitHub browser login or a GitHub Personal Access
Token with repository write access.

## 4. Daily development flow

```powershell
git pull --rebase origin main
git status --short
git add .
git commit -m "Describe the ESIP change"
git push
```

## 5. Validation before push

For backend changes:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src tests scripts --exclude build_daily_raw_preview.mjs
```

For PWA changes:

```powershell
cd D:\Python\ESIP\pwa
npm.cmd run lint
npm.cmd run build
```

Use `npm.cmd` on this Windows machine because PowerShell may block `npm.ps1`
depending on execution policy.
