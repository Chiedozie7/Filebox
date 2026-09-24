# CI and Pxxl deployment

The `Backend CI` workflow runs on every push, pull request, and manual workflow dispatch. It installs the backend from `fb-backend/package-lock.json`, checks JavaScript syntax, and runs the backend's rate-limit, queue, cleanup, health/logging, and mocked R2 tests. It uses no real Cloudflare credentials.

## Pxxl deployment options

This repository has a GitHub remote but no Pxxl project configuration, project ID, or Pxxl API key. GitHub Actions therefore runs CI only.

The cleanest no-secret option is to connect the GitHub repository as the Pxxl project's source and deploy `main` after CI passes. Enable automatic deployments for that branch in the Pxxl project if available, and configure GitHub branch protection so `Backend CI / Backend checks` must pass before changes can merge into `main`. Pxxl documents connecting GitHub projects and deploying future commits in its [deployment source guide](https://docs.pxxl.app/deploy/sources).

If deployment must be triggered by the workflow itself after CI, add a narrowly scoped `PXXL_API_KEY` as a GitHub Actions secret and provide the Pxxl project deployment configuration. Pxxl's [CLI documentation](https://docs.pxxl.app/api/pxxl-cli) documents `PXXL_API_KEY` and scripted deploy/redeploy commands. Those account-specific values are intentionally not included in the repository or workflow.
