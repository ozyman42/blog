import * as e from "effect";
import * as ep from "@effect/platform";
import * as epn from "@effect/platform-node"

class Cache extends e.Effect.Service<Cache>()("app/Cache", {
  // Define how to create the service
  effect: e.Effect.gen(function* () {
    const fs = yield* ep.FileSystem.FileSystem
    const lookup = (key: string) => fs.readFileString(`cache/${key}`)
    return { lookup } as const
  }),
  // Specify dependencies
  dependencies: [epn.NodeFileSystem.layer]
}) {}


e.Effect.gen(function*() {
    const cacheInstance = yield* Cache;
})