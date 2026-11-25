#!/usr/bin/env bash
# One-time Azure setup for PianoGo (deployment guide, steps 2-7 and 9).
# After this, only the CD workflow (.github/workflows/cd.yml) changes Azure.
#
# Run it from the repository root, in Bash (Git Bash on Windows, or Linux/macOS):
#   az login            # then pick "Azure for Students"
#   gh auth login
#   bash infra/setup-azure.sh
#
# Needs az, gh, openssl and curl, and either sqlcmd or Docker (it then runs
# sqlcmd from the SQL Server image). It is safe to run again: what exists is
# kept, and every database password is generated again and updated everywhere
# it is used (database user, Container App secret, GitHub secret).
#
# No password is printed or written to a file. They are generated here and go
# straight to Azure and to GitHub Actions secrets.

set -euo pipefail

# Git Bash on Windows rewrites arguments that look like Unix paths, which
# breaks Azure resource ids (/subscriptions/...). Turn that off.
export MSYS_NO_PATHCONV=1

PREFIX=iadelino-ieu2024
LOCATION=francecentral          # on this subscription's allowed list, with the free SQL offer
GH_REPO=iciaradelino/PianoGo
SUBSCRIPTION="Azure for Students"

RG=rg-$PREFIX
UI_STORAGE=${PREFIX//-/}ui      # iadelinoieu2024ui
SQL_SERVER=$PREFIX-sql
SQL_ADMIN=pianogoadmin
CONTAINER_ENV=$PREFIX-env
IDENTITY=$PREFIX-github
PLACEHOLDER_IMAGE=mcr.microsoft.com/k8se/quickstart:latest
PROFESSORS=(amartini@faculty.ie.edu bserra@faculty.ie.edu)
declare -A PORTS=([library]=8001 [processing]=8002)
SERVICES=(library processing)

# On Windows, az is az.cmd and may not be on Git Bash's PATH.
if ! command -v az >/dev/null 2>&1; then
  for candidate in "/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin/az.cmd" \
                   "/c/Program Files (x86)/Microsoft SDKs/Azure/CLI2/wbin/az.cmd"; do
    [[ -x "$candidate" ]] && az() { "$candidate" "$@"; } && break
  done
fi
command -v gh >/dev/null || { echo "gh is not installed" >&2; exit 1; }

step() { printf '\n== %s\n' "$*"; }

# A password Azure SQL accepts (upper, lower, digit, symbol), with no
# characters that need escaping in a connection string or in SQL.
new_password() { echo "Pg-$(openssl rand -hex 16)-X9"; }

# sqlcmd against one database, as the server admin. SQL may use $(VAR)
# variables, read from the environment variables passed after the database.
sql() {
  local database=$1 query=$2; shift 2
  if command -v sqlcmd >/dev/null 2>&1; then
    env "$@" SQLCMDPASSWORD="$SQL_ADMIN_PASSWORD" sqlcmd -S "tcp:$SQL_SERVER.database.windows.net,1433" \
      -d "$database" -U "$SQL_ADMIN" -N -b -Q "$query"
  else
    local env_args=(-e SQLCMDPASSWORD="$SQL_ADMIN_PASSWORD")
    for pair in "$@"; do env_args+=(-e "$pair"); done
    MSYS_NO_PATHCONV=1 docker run --rm "${env_args[@]}" mcr.microsoft.com/mssql/server:2022-latest \
      /opt/mssql-tools18/bin/sqlcmd -S "tcp:$SQL_SERVER.database.windows.net,1433" \
      -d "$database" -U "$SQL_ADMIN" -N -b -Q "$query"
  fi
}

connection_string() { # service password
  echo "Server=$SQL_SERVER.database.windows.net,1433;Database=$PREFIX-$1-db;User Id=$1_user;Password=$2;Encrypt=true;TrustServerCertificate=false"
}

step "1. Subscription"
az account set --subscription "$SUBSCRIPTION"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "subscription $SUBSCRIPTION_ID, region $LOCATION"

step "2. Providers and resource group"
for provider in Microsoft.App Microsoft.OperationalInsights Microsoft.Sql Microsoft.Storage Microsoft.ManagedIdentity; do
  az provider register --namespace "$provider" --wait
done
az extension add --name containerapp --upgrade --yes --only-show-errors
az group create --name "$RG" --location "$LOCATION" --output none
RG_ID=$(az group show --name "$RG" --query id -o tsv)

step "3. The UI: Storage static website $UI_STORAGE"
az storage account create --name "$UI_STORAGE" --resource-group "$RG" --location "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --output none
UI_KEY=$(az storage account keys list --account-name "$UI_STORAGE" --resource-group "$RG" --query "[0].value" -o tsv)
az storage blob service-properties update --account-name "$UI_STORAGE" --account-key "$UI_KEY" \
  --static-website --index-document index.html --404-document 404.html --output none
UI_ORIGIN=$(az storage account show --name "$UI_STORAGE" --resource-group "$RG" --query primaryEndpoints.web -o tsv)
UI_ORIGIN=${UI_ORIGIN%/}
echo "UI address: $UI_ORIGIN"

step "4. SQL server $SQL_SERVER and one serverless database per service"
SQL_ADMIN_PASSWORD=$(new_password)
if az sql server show --name "$SQL_SERVER" --resource-group "$RG" --output none 2>/dev/null; then
  az sql server update --name "$SQL_SERVER" --resource-group "$RG" --admin-password "$SQL_ADMIN_PASSWORD" --output none
else
  az sql server create --name "$SQL_SERVER" --resource-group "$RG" --location "$LOCATION" \
    --admin-user "$SQL_ADMIN" --admin-password "$SQL_ADMIN_PASSWORD" --minimal-tls-version 1.2 --output none
fi
az sql server firewall-rule create --server "$SQL_SERVER" --resource-group "$RG" \
  --name AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output none

for service in "${SERVICES[@]}"; do
  database=$PREFIX-$service-db
  if ! az sql db show --name "$database" --server "$SQL_SERVER" --resource-group "$RG" --output none 2>/dev/null; then
    # The free offer fixes auto-pause (60 min) and size (32 GB): no
    # --auto-pause-delay or --max-size (guide, step 4).
    az sql db create --name "$database" --server "$SQL_SERVER" --resource-group "$RG" \
      --edition GeneralPurpose --compute-model Serverless --family Gen5 \
      --min-capacity 0.5 --capacity 1 --backup-storage-redundancy Local \
      --use-free-limit true --free-limit-exhaustion-behavior AutoPause --output none
  fi
done

# Contained users, one per database, created over this machine's IP. The
# firewall rule for it is removed again at the end, even if this fails.
MY_IP=$(curl -fsS https://api.ipify.org)
az sql server firewall-rule create --server "$SQL_SERVER" --resource-group "$RG" \
  --name setup-machine --start-ip-address "$MY_IP" --end-ip-address "$MY_IP" --output none
trap 'az sql server firewall-rule delete --server "$SQL_SERVER" --resource-group "$RG" --name setup-machine --output none' EXIT

declare -A DB_PASSWORDS
for service in "${SERVICES[@]}"; do
  DB_PASSWORDS[$service]=$(new_password)
  # Only in its own database, so it can't open the other one. Not db_owner:
  # it can run migrations but not manage users or permissions (ADR-6).
  sql "$PREFIX-$service-db" "
    IF USER_ID(N'${service}_user') IS NULL
      CREATE USER ${service}_user WITH PASSWORD = N'\$(DB_USER_PASSWORD)';
    ELSE
      ALTER USER ${service}_user WITH PASSWORD = N'\$(DB_USER_PASSWORD)';
    ALTER ROLE db_datareader ADD MEMBER ${service}_user;
    ALTER ROLE db_datawriter ADD MEMBER ${service}_user;
    ALTER ROLE db_ddladmin ADD MEMBER ${service}_user;" \
    DB_USER_PASSWORD="${DB_PASSWORDS[$service]}"
  echo "user ${service}_user ready in $PREFIX-$service-db"
done

step "5. Container Apps environment $CONTAINER_ENV and one app per service"
if ! az containerapp env show --name "$CONTAINER_ENV" --resource-group "$RG" --output none 2>/dev/null; then
  # Also creates the Log Analytics workspace for the containers' logs.
  az containerapp env create --name "$CONTAINER_ENV" --resource-group "$RG" --location "$LOCATION" --output none
fi

app_url() { echo "https://$(az containerapp show --name "$PREFIX-$1" --resource-group "$RG" --query properties.configuration.ingress.fqdn -o tsv)"; }

for service in "${SERVICES[@]}"; do
  app=$PREFIX-$service
  url=$(connection_string "$service" "${DB_PASSWORDS[$service]}")
  env_vars=(PORT="${PORTS[$service]}" DATABASE_URL=secretref:database-url ALLOWED_ORIGIN="$UI_ORIGIN")
  if [[ $service == processing ]]; then
    env_vars+=(LIBRARY_URL="$(app_url library)" LIBRARY_TIMEOUT_S=10)
  fi
  if az containerapp show --name "$app" --resource-group "$RG" --output none 2>/dev/null; then
    az containerapp secret set --name "$app" --resource-group "$RG" --secrets database-url="$url" --output none
    az containerapp update --name "$app" --resource-group "$RG" --set-env-vars "${env_vars[@]}" --output none
  else
    # CORS is handled in the services (ALLOWED_ORIGIN), not by the ingress,
    # whose CORS setting rejects JSON preflights (guide, step 5).
    az containerapp create --name "$app" --resource-group "$RG" --environment "$CONTAINER_ENV" \
      --image "$PLACEHOLDER_IMAGE" --ingress external --target-port "${PORTS[$service]}" \
      --min-replicas 0 --max-replicas 1 --cpu 0.5 --memory 1.0Gi \
      --secrets database-url="$url" --env-vars "${env_vars[@]}" --output none
  fi
  echo "$app: $(app_url "$service")"
done

step "6. The pipeline's identity $IDENTITY (OIDC, no secret)"
if ! az identity show --name "$IDENTITY" --resource-group "$RG" --output none 2>/dev/null; then
  az identity create --name "$IDENTITY" --resource-group "$RG" --location "$LOCATION" --output none
fi
CLIENT_ID=$(az identity show --name "$IDENTITY" --resource-group "$RG" --query clientId -o tsv)
PRINCIPAL_ID=$(az identity show --name "$IDENTITY" --resource-group "$RG" --query principalId -o tsv)
# Looked up by scope, not --assignee: that needs the directory (Microsoft
# Graph), where a just-created identity may not show up yet.
if [[ -z $(az role assignment list --scope "$RG_ID" \
      --query "[?principalId=='$PRINCIPAL_ID' && roleDefinitionName=='Contributor'].id" -o tsv) ]]; then
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role Contributor --scope "$RG_ID" --output none
fi

# GitHub may send the subject with names or with numeric ids: register both.
OWNER_ID=$(gh api "repos/$GH_REPO" --jq .owner.id)
REPO_ID=$(gh api "repos/$GH_REPO" --jq .id)
declare -A SUBJECTS=(
  [github-main]="repo:$GH_REPO:ref:refs/heads/main"
  [github-main-ids]="repo:${GH_REPO%%/*}@$OWNER_ID/${GH_REPO##*/}@$REPO_ID:ref:refs/heads/main"
)
for name in "${!SUBJECTS[@]}"; do
  if ! az identity federated-credential show --name "$name" --identity-name "$IDENTITY" --resource-group "$RG" --output none 2>/dev/null; then
    az identity federated-credential create --name "$name" --identity-name "$IDENTITY" --resource-group "$RG" \
      --issuer https://token.actions.githubusercontent.com --audiences api://AzureADTokenExchange \
      --subject "${SUBJECTS[$name]}" --output none
  fi
  echo "federated credential: ${SUBJECTS[$name]}"
done

step "7. GitHub Actions secrets and variables on $GH_REPO"
gh secret set AZURE_CLIENT_ID --repo "$GH_REPO" --body "$CLIENT_ID"
gh secret set AZURE_TENANT_ID --repo "$GH_REPO" --body "$TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID --repo "$GH_REPO" --body "$SUBSCRIPTION_ID"
gh secret set LIBRARY_DB_PASSWORD --repo "$GH_REPO" --body "${DB_PASSWORDS[library]}"
gh secret set PROCESSING_DB_PASSWORD --repo "$GH_REPO" --body "${DB_PASSWORDS[processing]}"
gh variable set PREFIX --repo "$GH_REPO" --body "$PREFIX"
gh variable set RESOURCE_GROUP --repo "$GH_REPO" --body "$RG"
gh variable set UI_STORAGE --repo "$GH_REPO" --body "$UI_STORAGE"

step "9. Reader access for the professors"
for professor in "${PROFESSORS[@]}"; do
  if [[ -z $(az role assignment list --scope "$RG_ID" \
        --query "[?principalName=='$professor' && roleDefinitionName=='Reader'].id" -o tsv) ]]; then
    az role assignment create --assignee "$professor" --role Reader --scope "$RG_ID" --output none
  fi
  echo "Reader: $professor"
done

step "Done"
echo "Public address (system.yaml public_url): $UI_ORIGIN"
echo "The SQL admin password was not stored. To use it again, reset it with az sql server update --admin-password."
