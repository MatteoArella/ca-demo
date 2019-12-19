#!/bin/bash
ca_service_host=$1
cat <<EOF > docker-compose.yml
#######################################################
#                 AUTO-GENERATED FILE                 #
#                 NEVER EDIT IT MANUALLY              #
#######################################################
version: '3.1'
services:
  visualizer:
    image: dockersamples/visualizer:stable
    ports:
      - "8080:8080"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    deploy:
      placement:
        constraints: [node.role == manager]
    networks:
      - local
  ca:
    image: 127.0.0.1:5000/ca-image:latest
    ports:
      - "80:8000"
    deploy:
      placement:
        constraints: [node.role == manager]
    networks:
      - local
    secrets:
      - CA_KEY_PASS
  request:
    image: 127.0.0.1:5000/request-image:latest
    ports:
      - "81:8000"
    environment: 
      CA_SERVICE_HOST: $ca_service_host
    deploy:
      placement:
        constraints: [node.role == worker]
      mode: replicated
      replicas: 2
    networks:
      - local
    secrets:
      - REQ_KEY_PASS
networks:
  local:
    driver: overlay
secrets:
  CA_KEY_PASS:
    external: true
  REQ_KEY_PASS:
    external: true
EOF