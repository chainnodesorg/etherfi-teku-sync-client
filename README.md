# EtherFi teku Sync Client

This docker container fetches, decrypts and stores validator keys of won bids for ether.fi validators.

Teku supports hot reloads, which means this package simply creates and stores validator keys in the specified directory.
Teku will reload when new files are detected.

It is recommended to use the keys directory solely for ether.fi keys as we make some assumptions about the names of the key files.
Teku supports multiple directories for keys, so please use an empty one for this project and the resulting ether.fi keys.

Password files are stored in the same directory as keystore files, which is recommended. Configure Teku accordingly.

## Setup instructions

You can either add this docker container to your existing `docker-compose.yml` or create a new compose project only for the syncer.
Files are shared by creating them into a given directory (docker volume).

If using k8s you will need to mount a volume with multi read and write permissions (`ReadWriteMany`, see [here](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) for more information). You will need to mount the volume to your Teku container and to this container.

You will need to expose your docker.sock to this container in order to automatically reload teku when new files arrive.
This has not been tested with k8s. To reload with k8s, implement your own logic or create a PR.

Here is a sample `docker-compose.yml`:

```yaml
version: "3.9"

services:
  etherfi-syncing-client:
    image: chainnodes/etherfi-teku-sync-client:latest
    volumes:
      - ./keys:/_storage_
      - ./teku_proposer_config.json:/teku_proposer_config.json
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    env_file:
      - .env

```

In this example, we assume that a directory `./keys` is added to Teku to search for validator keys and password files. Please read Teku documentation for more information on this.

You can pass environment variables directly in the docker-compose or use a `.env` file like in the sample above. Please refer to the `.env.example` for required environment variables.

Here is a sample:

```
ETHERFI_SC_IPFS_GATEWAY=https://ether-fi-goerli.infura-ipfs.io/ipfs
ETHERFI_SC_BIDDER=0xF88866238ecE28A41e050b04360423a5d1181d49
ETHERFI_SC_GRAPH_URL=https://api.studio.thegraph.com/query/41778/goerli-dressrehearsal-1/0.0.4
ETHERFI_SC_PRIVATE_KEYS_FILE_LOCATION=/_storage_/input/privateEtherfiKeystore-1681911458600.json
ETHERFI_SC_OUTPUT_LOCATION=/_storage_
ETHERFI_SC_PASSWORD=Password123!
ETHERFI_SC_TEKU_PROPOSER_FILE=/teku_proposer_config.json
# docker, kubernetes or none
ETHERFI_SC_RESTART_MODE=docker
# excluded ids or validator public keys
ETHERFI_SC_EXCLUDED_VALIDATORS=0xa,0xb,0xc
```

Make sure to set `validators-proposer-config-refresh-enabled` to true in your teku (either teku_config.yml or command line).
Otherwise the updated proposer config will not be reloaded when new validators come in.

If running in a kubernetes pod, you will need to set `shareProcessNamespace: true` in order for the sighup reload to work properly.
You also need to set the `SYS_PTRACE` capability for this to work.
