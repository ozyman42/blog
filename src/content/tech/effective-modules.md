---
title: 'Effective Modules'
subtitle: 'A more ergonomic way to write Effective code'
description: 'Making Effect More Ergonomic'
pubDate: 'April 19 2026'
heroImage: './effective-modules-splash.png'
---

Since late 2025, I've been moving all my personal projects over to Effect, along with several work projects at Flexport (before getting laid off last month). I've come to largely agree with the premise that Effect is

> the missing TypeScript standard library

- [algebraic data types](https://doc.rust-lang.org/std/keyword.enum.html)
- [return types encoding error information](https://doc.rust-lang.org/std/result/index.html)
- [exhaustive pattern matching](https://doc.rust-lang.org/book/ch06-02-match.html)
- [first-class dependency injection](https://www.reddit.com/r/react/comments/1njcicg/comment/neunray/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [type-safe schema decoding](http://zod.dev/)

In 2026, serious developers who understand the value of a strongly-typed language consider all these table stakes for a robust, type-safe programming platform, and all these are missing from vanilla TypeScript. A comprehensive standard library *should* include all these features, and Effect has done it for the TypeScript ecosystem, arguably *outdoing* the ecosystem alternatives on every front. Effect has brought DI into the type system, as in there is a **compile-time failure** when required dependencies aren't provided; in general, few DI systems across all major programming languages offer this highest level of correctness.

So Effect seems like the right choice for writing robust TypeScript. However, as I gradually adopt Effect conventions like Services, Context, and Layers across my projects, I keep having awkward developer experiences.

# Headaches

#### Decoupling Impl from Interface

In the Effect v3 docs, we are [encouraged](https://effect.website/docs/requirements-management/layers/#simplifying-service-definitions-with-effectservice) to use the `Effect.Service` utility to make code less verbose, providing a default implementation of a Tag from which the service's interface is inferred:

```ts twoslash
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
    const cache = yield* Cache;
    yield* cache.lookup("some key");
    //           ^?
})
```

While this does improve readability (compared to always declaring both the Tag and the Layer separately), the trade-off is violation of a sacred SOLID pillar: [the Dependency Inversion principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle) which mandates that maintainable code ought to depend on abstractions not concretions. If a bug is introduced into the implementation, a compiler error should appear *in* the implementation block and the interface should not change. But with `Effect.Service` we may see an error appear in clients of the service.

```ts twoslash
// @errors: 2551
import * as e from "effect";
import * as ep from "@effect/platform";
import * as epn from "@effect/platform-node"

class Cache extends e.Effect.Service<Cache>()("app/Cache", {
  effect: e.Effect.gen(function* () {
    const fs = yield* ep.FileSystem.FileSystem
    // Accidentally changed the spelling of "lookup" to "lockup"
    const lockup = (key: string) => fs.readFileString(`cache/${key}`)
    return { lockup } as const
  }),
  dependencies: [epn.NodeFileSystem.layer]
}) {}

e.Effect.gen(function*() {
    const cache = yield* Cache;
    yield* cache.lookup("some key");
})
```

I deem Effect v3's `Effect.Service` an anti-pattern, but if it's so problematic why was it introduced at all?

### Awkward Interface Syntax

It was introduced because the right way to do things sucks. In Effect, declaring an interface looks like this



### Error Noise

### Verbosity When Passing Around Requirements

### Confusing Name Choices

# My Solution

### “Effective”

I'm coining the word "Effective" here to mean idomatic Effect code which complements the nuances of Effect; it looks good and accomplishes the goals of the code in a maintainable way utilizing the tools made available by Effect; it's best practice. "Effective" code is to Effect as "Pythonic" code is to Python.

### Effective Modules



My annoyances found me continuously trying to make utilities to make Effect feel a little nicer / more intuitive. Eventually I had built enough of these utilities that I realized a companion library to effect was warranted.

Enter Effective Modules.

I'm coining "Effective" as Effect's analog to what "Pythonic" means to Python developers; basically code which works well with Effect's conventions. Technically I'm breaking standard Effect convention here to create a new pattern, but the point stands & it'd be fun if the word catches on.

### Module Declaration

Anyways, with Effective Modules, I've gone back to having interfaces declared as 

### More Natural, Less Cluttered Declaration And Usage

```ts twoslash
// @errors: 2304
interface Database {

}

interface Permissions {
  isAuthorized: (user: User, action: Action) => GenEffect<boolean>; 
}
```

### More Precise, Less Noisy IDE Errors


### The GenEffect type


### Helpful instance properties (dependencies, context)

### Custom Initializer

## What would make this better?



## Feedback

## Type Inference Annotations

Hover over the variables below to see their inferred types:

```ts twoslash
interface User {
  id: number;
  name: string;
  email: string;
}

function getUser(): User {
  return { id: 1, name: 'Alice', email: 'alice@example.com' };
}

const user = getUser();
//    ^?

const userName = user.name;
//    ^?

const ids = [1, 2, 3].map(n => n * 2);
//    ^?
```

The `^?` annotations reveal what TypeScript infers for each binding — no guessing required.

## TypeScript Errors

Twoslash also surfaces real compiler errors inline:

```ts twoslash
// @errors: 2322 2339
interface Product {
  id: number;
  title: string;
  price: number;
}

const product: Product = {
  id: 'not-a-number',
  title: 'Widget',
  price: 9.99,
};

console.log(product.rating);
```

The red squiggles come from the actual TypeScript compiler — the same errors you'd see in your IDE.
