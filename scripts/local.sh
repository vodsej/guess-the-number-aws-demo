#!/usr/bin/env bash
# Deploys the stack to Floci (https://floci.io), a local AWS emulator, and runs the e2e tests against it.
#
#   scripts/local.sh up     start Floci, bootstrap CDK, deploy the stack, print the API URL
#   scripts/local.sh e2e    run the e2e test suite against the local stack
#   scripts/local.sh down   stop Floci (all local state is discarded)
set -euo pipefail

CONTAINER=floci
IMAGE=docker.io/floci/floci:2.2.0
ENDPOINT=http://localhost:4566
OUTPUTS=cdk.out/local-outputs.json

# Exported only inside this script, so the fake credentials never reach a real AWS deploy.
export AWS_ENDPOINT_URL=$ENDPOINT AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test

cd "$(dirname "$0")/.."

start_floci() {
  if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    return
  fi

  # Floci runs each Lambda in its own container, so it needs the container engine's socket.
  if docker --version | grep -qi podman; then
    # Podman: use the user socket, allow the mount under SELinux, and share a network
    # between Floci and the Lambda containers so they can reach each other.
    local socket="${XDG_RUNTIME_DIR}/podman/podman.sock"
    [[ -S $socket ]] || { echo "Podman socket not found; run: systemctl --user start podman.socket" >&2; exit 1; }
    docker network exists floci || docker network create floci >/dev/null
    docker run -d --rm --name "$CONTAINER" -p 4566:4566 -u root \
      --network floci --security-opt label=disable \
      -e FLOCI_HOSTNAME=floci -e FLOCI_SERVICES_LAMBDA_DOCKER_NETWORK=floci \
      -v "$socket:/var/run/docker.sock" "$IMAGE" >/dev/null
  else
    docker run -d --rm --name "$CONTAINER" -p 4566:4566 -u root \
      -v /var/run/docker.sock:/var/run/docker.sock "$IMAGE" >/dev/null
  fi

  until curl -sf "$ENDPOINT/_floci/health" >/dev/null; do sleep 1; done
}

# Floci serves a deployed API at /execute-api/<api-id>/<stage>/ instead of the AWS hostname.
api_url() {
  node -p "'$ENDPOINT/execute-api/' + new URL(require('./$OUTPUTS').GuessTheNumberStack.ApiUrl).hostname.split('.')[0] + '/v1/'"
}

case "${1:-}" in
  up)
    start_floci
    npx cdk bootstrap
    npx cdk deploy --require-approval never --outputs-file "$OUTPUTS"
    echo "Local API: $(api_url)"
    ;;
  e2e)
    API_URL="$(api_url)" npx vitest run --project e2e
    ;;
  down)
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    # Floci starts helper containers (e.g. its ECR registry) that outlive it.
    helpers=$(docker ps -aq --filter "name=^floci-")
    [[ -z $helpers ]] || docker rm -f $helpers >/dev/null
    ;;
  *)
    echo "usage: $0 up|e2e|down" >&2
    exit 1
    ;;
esac
