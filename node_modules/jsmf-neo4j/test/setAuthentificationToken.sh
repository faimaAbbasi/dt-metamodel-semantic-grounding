#!/bin/bash
curl -vvv X POST -d '{"password" : "neo4j", "new_authorization_token" : "6f188d2408a34c0785e3032e69e94a92"}' -H 'Content-Type: application/json' -i http://127.0.0.1:7474/user/neo4j/authorization_token


