@echo off
REM Lanceur double-clic de l'auto-pull. Passe les arguments (ex: -IntervalSeconds 15).
title auto-pull main (FillSell)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-pull.ps1" %*
