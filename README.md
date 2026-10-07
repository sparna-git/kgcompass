# KGCompass

KGCompass is the "MCP-over-SPARQL" server: it lets an AI agent find its way in a knowledge graph it does not know, through the [Model Context Protocol](https://modelcontextprotocol.io). `schema_overview` is the map, `discover_nodeshapes` is the detailed terrain, `reconcile_entities` marks the landmarks, and `query_sparql` runs the final query.

Each knowledge graph is a project of the config file: a SPARQL endpoint, the SHACL shapes that describe it, and the way its entities are reconciled.

## Running locally

1. `npm install`
2. Check the projects declared in `config/config.yaml`
3. `npm start`
4. Connect an MCP client to `http://localhost:3001/mcp/<projectKey>` (Streamable HTTP)

The port comes from the `PORT` environment variable and defaults to 3001. A `.env` file is read if there is one.

The config file is the one given by `--config=` in the `start` script. The paths written in it are relative to the directory the server is started from, so start it from the root of the project.

## Tools

For a project named `ep`, the server exposes `ep_schema_overview`, `ep_get_few_shots`, `ep_discover_nodeshapes`, `ep_reconcile_entities` and `ep_query_sparql`. It also exposes a `healthcheck` tool and a `sparql-query-guide` prompt.

## Config file

```yaml
log:
  level: info # optional
projects:
  my-project: # projectKey
    shacl: ./config/my-project/shapes.ttl # SHACL file
    sparqlEndpoint: https://example.org/sparql
    reconciliation:
      implementation: LunrReconcileService # service of reconciliation
      indexCachePath: ./cache/my-project/lunr-index.json # cache index file
```

| Key              | Role                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `shacl`          | The SHACL files that describe the graph. Several paths are separated by spaces.                                          |
| `sparqlEndpoint` | The endpoint the queries are sent to.                                                                                    |
| `shaclTypes`     | Optional. The values accepted by the `type` parameter of the reconciliation. Defaults to the IRIs of all the NodeShapes. |
| `useCases`       | Optional. The rows (`title`, `entryPoint`, `joins`) of the use case table in the schema overview.                        |
| `fewShotsFile`   | Optional. A JSON file of `question` and `sparql` pairs, returned by `get_few_shots`.                                     |
| `reconciliation` | Optional. One service, or a list of services tried in order until one returns candidates.                                |

The reconciliation services, to put in `implementation`:

- `SparqlReconcileService`: exact match on the labels, with SPARQL queries. Used when `reconciliation` is absent.
- `SparqlReconcileServiceV13`: the same, for the v13 structure of the Sparnatural queries.
- `LunrReconcileService`: prefix and fuzzy search in a Lunr index, built from the queries listed in `sparqlQueries`.
- `LuceneGraphDBReconcileService`: search through a Lucene connector of GraphDB, named by `luceneIndexName`.
- `IsidoreApiReconcileService`: calls the suggest API of ISIDORE.

They accept `cacheSize` and `maxResults`, except the last one.

### Lunr index

The first start builds the index from the SPARQL endpoint and saves it in the file given by `indexCachePath`. The next starts load that file instead of building the index again. Delete it to rebuild the index.

## Using the reconciliation from another project

Pack KGCompass, then install the tarball in the other project:

```sh
# in kgcompass
npm pack

# in the other project
npm install ../kgcompass/kgcompass-0.1.0.tgz
```

```ts
import { getReconcileService, warmUpLunrIndexes } from "kgcompass";

// once the host server is listening
warmUpLunrIndexes();

const service = getReconcileService("my-project");
const candidates = await service.reconcileQueries(
  { q0: { query: "X" } }, // replace X by the entity searching for
  false,
);
```

Two things to know:

- KGCompass reads the YAML file given by `--config=` to the host process. It takes the `sparqlEndpoint`, `shacl`, `shaclTypes` and `reconciliation` keys of the project. Without `--config=`, it reads `config.yaml` in the working directory.
- Get the services from `getReconcileService()`. Do not register the service classes in the tsyringe container of the host: it fails with `TypeInfo not known` as soon as the host has its own copy of tsyringe, which is the case when KGCompass is installed as a linked folder.
