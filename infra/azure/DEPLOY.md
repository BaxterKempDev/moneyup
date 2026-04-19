# Deploy MoneyUp to Azure App Service (Free F1)

Use this only if you are happy with Azure’s account terms (often a card on file) and you keep the **F1 Free** plan—do not scale the plan up unless you intend to pay.

## Prerequisites

1. **Azure account** — [Create one](https://azure.microsoft.com/free/) if needed.
2. **Azure CLI** — [Install](https://learn.microsoft.com/cli/azure/install-azure-cli), then run `az login`.
3. A **globally unique app name** (letters, numbers, hyphens), e.g. `moneyup-yourname`. It becomes `https://<name>.azurewebsites.net`.

## Step 1 — Pick region and names

- **Resource group**: e.g. `moneyup-rg`
- **Region**: e.g. `australiaeast` (or another [supported region](https://azure.microsoft.com/global-infrastructure/services/?products=app-service))
- **App name**: your globally unique name from above

## Step 2 — Create the resource group

```bash
az group create --name moneyup-rg --location australiaeast
```

(Change names/region to match Step 1.)

## Step 3 — Deploy the Bicep template (Free tier only)

From the **repo root** (`moneyup/`):

```bash
az deployment group create \
  --resource-group moneyup-rg \
  --template-file infra/azure/main.bicep \
  --parameters appName=YOUR-GLOBALLY-UNIQUE-NAME
```

Replace `YOUR-GLOBALLY-UNIQUE-NAME` with your app name. When it finishes, note the **default hostname** in the output (or open the app in [Azure Portal](https://portal.azure.com) → your Web App → **Overview**).

## Step 4 — Deploy your Next.js code

The template turns on **Oryx build on deploy**. Easiest path: connect the Web App to **GitHub** in the Portal (**Deployment Center**) and point it at this repo, with:

- **Build**: runs `npm install` / `npm run build` on Azure  
- **Startup**: should run `npm start` (set **Startup Command** in **Configuration → General settings** if needed: `npm start`)

Alternatively use **GitHub Actions** (publish profile or OIDC)—add a workflow later if you want CI/CD.

## Step 5 — Environment variables (if needed)

In Portal: **Web App → Settings → Environment variables** (or **Configuration**). Add any secrets your app needs (e.g. API keys). **Do not commit secrets** to git.

## Step 6 — Smoke test

Open `https://YOUR-GLOBALLY-UNIQUE-NAME.azurewebsites.net` and confirm the app loads.

## If something fails

- **Name taken**: pick another `appName` and redeploy or create a new site name in Portal.
- **Build fails on Azure**: check **Deployment Center → Logs** and **Log stream**; ensure Node 20 matches `package.json` / `engines`.
- **Accidental cost**: in Portal, confirm **App Service plan** is still **F1 (Free)** and you did not add paid add-ons or other paid services in the same subscription unintentionally.
