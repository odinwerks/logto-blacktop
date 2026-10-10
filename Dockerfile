# syntax=docker/dockerfile:1.7

###### [STAGE] Build ######
FROM node:22-alpine AS builder
WORKDIR /etc/logto
ENV CI=true

# No need for Docker build
ENV PUPPETEER_SKIP_DOWNLOAD=true

### Install toolchain ###
RUN npm add --location=global pnpm@12.10.1
# https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md#node-gyp-alpine
RUN apk add --no-cache python3 make g++ rsync git

COPY . .

### Ensure git submodules are populated ###
# `.dockerignore` strips `.git`, so non-recursive build contexts leave submodule
# directories empty. Ensure the ubill connector submodule is present before dependency
# installation. No-op when the build context already populated it (e.g. via
# `git clone --recurse-submodules` or `git submodule update --init` before `docker build`).
# Pinned to the submodule gitlink commit — keep in sync with
# `git ls-tree HEAD packages/connectors/connector-ubill-sms`. A mutable branch ref would
# make the build non-reproducible and let remote changes ship unreviewed.
ARG ubill_connector_sha=d897a31519cd15257d6f0678a56f33dc5488345b
RUN if [ ! -f packages/connectors/connector-ubill-sms/package.json ]; then \
      echo "Submodule 'packages/connectors/connector-ubill-sms' not in build context; fetching pinned revision"; \
      mkdir -p packages/connectors/connector-ubill-sms; \
      git -C packages/connectors/connector-ubill-sms init -q; \
      git -C packages/connectors/connector-ubill-sms remote add origin \
        https://github.com/odinwerks/connector-ubill-sms.git; \
      git -C packages/connectors/connector-ubill-sms fetch -q --depth 1 origin "$ubill_connector_sha"; \
      git -C packages/connectors/connector-ubill-sms checkout -q --detach FETCH_HEAD; \
    fi

### Install dependencies and build ###
# Reuse the pnpm store between BuildKit runs to reduce duplicate downloads/writes.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm i

### Set if dev features enabled ###
ARG dev_features_enabled
ENV DEV_FEATURES_ENABLED=${dev_features_enabled}

# Build-time only: the value may be inlined into built assets by `pnpm -r build` and is
# visible in `docker history` for the builder stage. It is NOT carried into the final
# image's environment (the `app` stage below does not set it). Treat it as public
# configuration, not a secret.
ARG applicationinsights_connection_string
ENV APPLICATIONINSIGHTS_CONNECTION_STRING=${applicationinsights_connection_string}

ARG logto_oss_survey_endpoint=
ENV LOGTO_OSS_SURVEY_ENDPOINT=${logto_oss_survey_endpoint}

RUN pnpm -r build

### Add official connectors ###
ARG additional_connector_args
ENV ADDITIONAL_CONNECTOR_ARGS=${additional_connector_args}
RUN pnpm cli connector link $ADDITIONAL_CONNECTOR_ARGS -p .

### Prune dependencies for production ###
# Keep prune + production install in one layer to avoid extra transient disk usage.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  rm -rf node_modules packages/**/node_modules && NODE_ENV=production pnpm i

### Clean up ###
RUN rm -rf .scripts pnpm-*.yaml packages/cloud

###### [STAGE] Seal ######
FROM node:22-alpine AS app
WORKDIR /etc/logto
ARG logto_oss_survey_endpoint=
ARG private_key_rotation_grace_period=0
# Default to empty so external survey relaying stays opt-in for controlled builds/environments.
ENV LOGTO_OSS_SURVEY_ENDPOINT=${logto_oss_survey_endpoint}
ENV PRIVATE_KEY_ROTATION_GRACE_PERIOD=${private_key_rotation_grace_period}
COPY --from=builder /etc/logto .
RUN mkdir -p /etc/logto/packages/cli/alteration-scripts && chmod g+w /etc/logto/packages/cli/alteration-scripts
EXPOSE 3001
ENTRYPOINT ["npm", "run"]
CMD ["start"]
