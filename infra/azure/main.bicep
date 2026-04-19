// Azure App Service — FREE tier only (F1 / tier "Free").
//
// This file does NOT create anything until YOU run Azure CLI against your subscription.
// Before deploying: confirm pricing for your region at
// https://azure.microsoft.com/pricing/details/app-service/linux/
//
// Hypothetical cost triggers to avoid in Azure (outside this template):
// - Changing the App Service Plan SKU away from F1
// - Enabling paid add-ons (custom SSL on some tiers, backups, always-on on tiers that charge, etc.)
// - Pay-as-you-go usage beyond always-free allowances; new accounts often get time-limited credits
//
// Deploy (review the plan name and SKU in Azure Portal after):
//   az group create -n <resource-group> -l <region>
//   az deployment group create -g <resource-group> -f infra/azure/main.bicep -p appName=<globally-unique-name>

@description('Globally unique name used for the default *.azurewebsites.net hostname (letters, numbers, hyphens).')
param appName string

@description('Azure region for resources (e.g. australiaeast).')
param location string = resourceGroup().location

// --- Free Linux App Service Plan (F1) — do not change sku if you require zero App Service charge.
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${appName}-plan'
  location: location
  sku: {
    name: 'F1'
    tier: 'Free'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: appName
  location: location
  kind: 'app'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Runtime + Oryx build hints for git-based deploy (optional; adjust if you deploy pre-built artifacts).
resource webAppSettings 'Microsoft.Web/sites/config@2023-01-01' = {
  name: 'appsettings'
  parent: webApp
  properties: {
    WEBSITE_NODE_DEFAULT_VERSION: '~20'
    // Build on deploy when using Azure git/GitHub Actions Oryx — set false if you upload a built package only.
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
    ENABLE_ORYX_BUILD: 'true'
    NODE_ENV: 'production'
  }
}

output defaultHostname string = webApp.properties.defaultHostName
output webAppName string = webApp.name
