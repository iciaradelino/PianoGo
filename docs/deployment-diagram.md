# Deployment

Every resource is in the resource group `rg-iadelino-ieu2024` (region `francecentral`) of my Azure for Students subscription, created once by `infra/setup-azure.sh`. After that, only the pipeline changes them (ADR-8, ADR-9).

```mermaid
flowchart LR
  DEV["Developer<br/>branch → pull request"]

  subgraph GH["GitHub: iciaradelino/PianoGo"]
    REPO["Repository<br/>main + branches"]
    subgraph ACT["GitHub Actions"]
      CI["CI (ci.yml), every push and PR<br/>lint · typecheck · tests + 70% coverage on SQL Server container<br/>ui build · system.yaml + OpenAPI · cross-seam (compose)<br/>build both images"]
      CD["CD (cd.yml), push to main<br/>runs CI → push images → deploy → upload UI → /health = SHA"]
    end
    SECRETS["Secrets: AZURE_CLIENT_ID / TENANT_ID / SUBSCRIPTION_ID<br/>LIBRARY_DB_PASSWORD · PROCESSING_DB_PASSWORD<br/>Variables: PREFIX · RESOURCE_GROUP · UI_STORAGE"]
  end

  GHCR[("GitHub Container Registry<br/>ghcr.io/iciaradelino/pianogo-library:&lt;sha&gt;<br/>ghcr.io/iciaradelino/pianogo-processing:&lt;sha&gt;")]

  subgraph AZ["Azure: rg-iadelino-ieu2024 (francecentral)"]
    MI["Managed identity iadelino-ieu2024-github<br/>federated credential for GitHub OIDC<br/>Contributor on the resource group"]
    subgraph ENV["Container Apps environment iadelino-ieu2024-env (Consumption)"]
      LAPP["Container App iadelino-ieu2024-library<br/>0–1 replicas · 0.5 vCPU · 1 GiB<br/>secret database-url"]
      PAPP["Container App iadelino-ieu2024-processing<br/>0–1 replicas · 0.5 vCPU · 1 GiB<br/>secret database-url · LIBRARY_URL"]
    end
    LOGS[("Log Analytics workspace<br/>(console logs of both apps)")]
    subgraph SQL["Azure SQL server iadelino-ieu2024-sql"]
      LDB[("iadelino-ieu2024-library-db<br/>serverless, free offer, auto-pause")]
      PDB[("iadelino-ieu2024-processing-db<br/>serverless, free offer, auto-pause")]
    end
    WEB[("Storage account iadelinoieu2024ui<br/>static website ($web)")]
  end

  USER["Browser<br/>https://iadelinoieu2024ui.z28.web.core.windows.net"]

  DEV -- "git push" --> REPO
  REPO --> CI
  REPO -- "merge to main" --> CD
  CD -- "calls" --> CI
  CI -- "docker push (main only)" --> GHCR
  CD -- "azure/login with OIDC" --> MI
  SECRETS -.-> CD
  CD -- "az containerapp update --image :sha" --> LAPP
  CD -- "az containerapp update --image :sha" --> PAPP
  CD -- "az storage blob upload-batch<br/>ui/out + config.js" --> WEB
  CD -- "GET /health until version = sha" --> LAPP
  CD -- "GET /health until version = sha" --> PAPP
  LAPP -- "pull image" --> GHCR
  PAPP -- "pull image" --> GHCR
  LAPP -- "library_user" --> LDB
  PAPP -- "processing_user" --> PDB
  PAPP -- "GET /sheets/{id}/file" --> LAPP
  LAPP -.-> LOGS
  PAPP -.-> LOGS
  USER -- "static files" --> WEB
  USER -- "API calls (CORS)" --> LAPP
  USER -- "API calls (CORS)" --> PAPP
```

| Resource | Name | Billing |
| --- | --- | --- |
| Container Apps environment | `iadelino-ieu2024-env` | Consumption: per vCPU-second and GiB-second while a replica runs, with a monthly free grant |
| Container Apps | `iadelino-ieu2024-library`, `iadelino-ieu2024-processing` | as above, scale to zero |
| Azure SQL server | `iadelino-ieu2024-sql` | no charge on its own |
| Azure SQL databases | `iadelino-ieu2024-library-db`, `iadelino-ieu2024-processing-db` | serverless free offer: free up to its monthly limit, auto-pause after 60 idle minutes |
| Storage account (static website) | `iadelinoieu2024ui` | per GB stored and per request |
| Managed identity | `iadelino-ieu2024-github` | free |
| Log Analytics workspace | created with the environment | per GB ingested, first 5 GB a month free |
| Image registry | `ghcr.io/iciaradelino` (GitHub) | free for public images |
