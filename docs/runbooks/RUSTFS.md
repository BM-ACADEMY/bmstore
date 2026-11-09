# RustFS (bundled media storage)

MinIO's public images are gone, so the bundled S3 store is [RustFS](https://github.com/rustfs/rustfs)
(`rustfs/rustfs:1.0.4`, pinned). The compose profile is still called `minio` (`COMPOSE_PROFILES=minio`).
The API's S3 code is unchanged: `S3_ENDPOINT=http://rustfs:9000`, path-style addressing (`S3_FORCE_PATH_STYLE=1`).

| Piece | Where |
|---|---|
| `rustfs` service (S3 API :9000, console :9001, data volume `rustfsdata` at `/data`, uid 10001) | `deploy/docker-compose.prod.yml` |
| `rustfs-init` one-off: creates the bucket and sets an anonymous `s3:GetObject` policy (AWS CLI image) | same file; run by `deploy/deploy.sh` |
| `media.<ROOT_DOMAIN>` → GET/HEAD of `/<S3_BUCKET>/*` only, everything else 404 | `infra/caddy/Caddyfile` (+ `.wildcard`) |
| Credentials: `S3_ACCESS_KEY` / `S3_SECRET_KEY` are also RustFS' root credentials | `/etc/bmstore/production.env` |

## Admin console (never public)
No Caddy site routes to it. It listens on the server's loopback only:
```bash
ssh -L 9001:127.0.0.1:9001 deploy@SERVER_IP
```
then open http://localhost:9001 and sign in with `S3_ACCESS_KEY` / `S3_SECRET_KEY`.

## Verify after the first deploy
```bash
./deploy/compose.sh ps                      # rustfs: running (healthy); rustfs-init: exited 0
./deploy/compose.sh logs rustfs-init        # "bucket ... ready (public read)"
echo hi > /tmp/t.txt
./deploy/compose.sh run --rm --no-deps -v /tmp/t.txt:/t.txt rustfs-init \
  'aws --endpoint-url http://rustfs:9000 s3 cp /t.txt s3://$S3_BUCKET/t.txt'
curl -i https://media.store.bmtechx.in/bmstore-media/t.txt                 # 200 (anonymous read)
curl -i https://media.store.bmtechx.in/bmstore-media/                      # 404 (no listing)
curl -i -X PUT --data x https://media.store.bmtechx.in/bmstore-media/x     # 404 (no writes)
curl -i https://minio.store.bmtechx.in/                                    # not served (no console host)
```

## Migrating from MinIO
Fresh installs only need the steps above. If a MinIO volume (`miniodata`) exists, copy it out with
`rclone`/`aws s3 sync` from a running MinIO (or from the weekly media backup in the backup bucket) into RustFS via
`./deploy/compose.sh run --rm backup shell` (`rclone sync bk:$BACKUP_S3_BUCKET/media/current media:$S3_BUCKET`).
