#!/usr/bin/env pwsh

# Azure部署脚本
param(
    [string]$ResourceGroupName = "draw-and-guess-rg",
    [string]$Location = "EastAsia",
    [string]$AppServicePlan = "draw-and-guess-plan",
    [string]$WebAppName = "draw-and-guess-app-" + (Get-Random),
    [string]$NodeVersion = "20-lts"
)

Write-Host "开始部署draw-and-guess应用到Azure..." -ForegroundColor Green

# 检查Azure CLI是否已安装
if (!(Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI未安装。请先安装Azure CLI。"
    exit 1
}

# 登录Azure（如果未登录）
try {
    az account show --output table
} catch {
    Write-Host "请登录到Azure账户..." -ForegroundColor Yellow
    az login
}

Write-Host "创建资源组: $ResourceGroupName" -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location

Write-Host "创建App Service计划: $AppServicePlan" -ForegroundColor Yellow
az appservice plan create --name $AppServicePlan --resource-group $ResourceGroupName --sku B1 --is-linux

Write-Host "创建Web应用: $WebAppName" -ForegroundColor Yellow
az webapp create --resource-group $ResourceGroupName --plan $AppServicePlan --name $WebAppName --runtime "NODE|$NodeVersion" --deployment-local-git

Write-Host "启用WebSocket支持..." -ForegroundColor Yellow
az webapp config set --resource-group $ResourceGroupName --name $WebAppName --web-sockets-enabled true

Write-Host "设置应用设置..." -ForegroundColor Yellow
az webapp config appsettings set --resource-group $ResourceGroupName --name $WebAppName --settings WEBSOCKETS_ENABLED=1

Write-Host "打包并部署应用..." -ForegroundColor Yellow
Compress-Archive -Path ".\*" -DestinationPath "draw-and-guess.zip" -Update

az webapp deployment source config-zip --resource-group $ResourceGroupName --name $WebAppName --src draw-and-guess.zip

Write-Host "部署完成！" -ForegroundColor Green
Write-Host "你的应用将在以下URL可用: https://$WebAppName.azurewebsites.net" -ForegroundColor Cyan

Write-Host "要查看应用日志，请运行以下命令:" -ForegroundColor Yellow
Write-Host "az webapp log tail --name $WebAppName --resource-group $ResourceGroupName" -ForegroundColor White