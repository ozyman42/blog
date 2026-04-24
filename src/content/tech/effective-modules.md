---
title: 'Effective Modules'
subtitle: 'A more ergonomic way to write Effective code'
description: 'Making Effect More Ergonomic'
pubDate: 'April 19 2026'
heroImage: './effective-modules-splash.png'
---

(Note: this article assumes familiarity with TypeScript, Effect, and SOLID).  
To jump straight to the tool I built, [click here](#module-declaration)

Since late 2025, I've been moving all my personal projects over to Effect, along with several work projects at Flexport (before getting laid off last month). I've come to largely agree with the premise that Effect is

> the missing TypeScript standard library

- [algebraic data types](https://doc.rust-lang.org/std/keyword.enum.html)
- [return types encoding error information](https://doc.rust-lang.org/std/result/index.html)
- [exhaustive pattern matching](https://doc.rust-lang.org/book/ch06-02-match.html)
- [first-class dependency injection](https://www.reddit.com/r/react/comments/1njcicg/comment/neunray/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [type-safe schema decoding](http://zod.dev/)

In 2026, serious developers who understand the value of a strongly-typed language consider all these table stakes for a robust, type-safe programming platform. All these are missing from vanilla TypeScript. A comprehensive standard library *should* include all these features, and Effect has done it for the TypeScript ecosystem, arguably *outdoing* the ecosystem alternatives on every front. Effect has brought DI into the type system. That is, there is a **compile-time failure** when required dependencies aren't provided. In general, few DI systems across all major programming languages offer this highest level of correctness.

So Effect seems like the right choice for writing TypeScript at scale. However, as I adopt Effect conventions like services, context, and layers across my projects, I keep having awkward developer experiences.

## Headaches

#### 1. Decoupling Impl from Interface

In the Effect v3 docs, we are [encouraged](https://effect.website/docs/requirements-management/layers/#simplifying-service-definitions-with-effectservice) to use the `Effect.Service` utility to improve code succinctness, providing a default implementation of a service from which its interface is inferred:

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

While this does improve readability (compared to declaring the tag and layer separately), the trade-off is violating a sacred SOLID pillar, the [Dependency Inversion principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle), which mandates that maintainable code ought to depend on abstractions not concretions. If a bug is introduced into the implementation, a compiler error will ideally appear *in* the implementation block and the interface will not change. But with `Effect.Service` an error may instead appear in clients of the service because changing the implementation can change the interface.

```ts twoslash
// @errors: 2551
import * as e from "effect";
import * as ep from "@effect/platform";
import * as epn from "@effect/platform-node"
// ---cut---
class Cache extends e.Effect.Service<Cache>()("app/Cache", {
  effect: e.Effect.gen(function* () {
    const fs = yield* ep.FileSystem.FileSystem
    // Accidentally changed the spelling of "lookup" to "lockup"
    const lockup = (key: string) => fs.readFileString(`cache/${key}`)
    //    ^^^^^^
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

#### 2. Awkward Interface Syntax

It was introduced because the right way to do things sucks. In Effect, declaring an interface (tag) looks like this

```ts twoslash
// @errors: 2507 2558
import * as e from "effect";
import * as ep from "@effect/platform";
// ---cut---
type ICache = {
  lookup(key: string): e.Effect.Effect<string, ep.Error.PlatformError, never>
}

class Cache extends e.Context.Tag<Cache, ICache>("app/Cache") {}
```

Oh wait no it's

```ts twoslash
// @errors: 2558 2554
import * as e from "effect";
import * as ep from "@effect/platform";
type ICache = {
  lookup(key: string): e.Effect.Effect<string, ep.Error.PlatformError, never>
}
// ---cut---
class Cache extends e.Context.Tag<Cache, ICache>()("app/Cache") {}
```

Still not it. Maybe

```ts twoslash
import * as e from "effect";
import * as ep from "@effect/platform";
type ICache = {
  lookup(key: string): e.Effect.Effect<string, ep.Error.PlatformError, never>
}
// ---cut---
class Cache extends e.Context.Tag("app/Cache")<Cache, ICache>() {}
```

there we go.

... this syntax is hieroglyphic. When defining a new tag I typically fight with the compiler for a minute or so because the syntax just doesn't commit to memory. It's repetitive and cluttered.
- Why am I creating a class?
- Why am I passing the class in as a parameter?
- Why am I repeating the name of my interface 5 times?
- What are all these function calls for?

There are, as one might expect, reasonably good answers to these questions. Effect needs a way to uniquely identify a tag at compile time such that two tags with overlapping shapes can't be mistakenly substituted for one another due to structural typing. The string ID (`"app/Cache"` in this case) is set as the type for a `key` field, ensuring uniqueness similarly to how the `_tag` field works in Effect discriminated union types like `Option`, `Effect`, or `TaggedError`. Additionally, since classes are both types and runtime values, the class declaration & type parameter of a tag (`Cache` in this case) is used as a reference to the tag in effect types: you'll see the class type in the requirements channel of any layers and effects which depend on the tag (e.g. `Effect<void, never, Cache>`).

All this to say, Effect's service tags had me yearning for the simplicity of pure interfaces and wondering if it might be possible to get the same properties that Effect is looking for without the unreadable and repetitive syntax.

#### 3. Error Noise

This biggest headache I experience when working with Effect is my IDE becoming unusable whenever I introduce a bug into an effect implementation that changes its error or requirements channel. This happens a lot during refactors, especially when working on one service leads me to update the shape of a dependent service.

In this example from one of my own projects, this is what happens when I change the type signature of the `github` service's `resolveAccessToken` method to yield an additional requirement while `ensureLoggedIn` is typed to have `never` in the requirements channel:

![](./effective-modules-entire-impl-wrong.png)

This is not conducive to productively finding and fixing the bug. The entire service's body is highlighted as incorrect now just because of a bug in one method. Ideally only the `resolveAccessToken` line would be highlighted as wrong, prompting me to pipe a provided context containing the required service.

When one runs into this kind of issue frequently, it becomes tempting to take the path of least resistance. Often times this looks like handling all possible errors after the entire effect's body rather than handling each error at the line which produces it; over time this leads to brittle and confusing code.

#### 4. Verbose Dependency Passing

Building on that `resolveAccessToken`, when you want to call an effect which depends on 1+ services you need to either define that effect within the layer implementation's closure so it has access to services yielded at layer construction time, or you need to create a custom context and provide it to the effect before yielding.

Here's an example of the first option

```ts twoslash
import * as e from "effect";
// ---cut---
class ServiceOne extends e.Context.Tag("ServiceOne")<ServiceOne, {
  serviceOneMethod(someInput: number): e.Effect.Effect<string, never, never>;
}>() {};

class ServiceTwo extends e.Context.Tag("ServiceTwo")<ServiceTwo, {
  serviceTwoMethod(someInput: number): e.Effect.Effect<string, never, never>; 
}>() {};

const ServiceTwoImpl = e.Layer.effect(ServiceTwo, e.Effect.gen(function*() {
  const serviceOne = yield* ServiceOne;
  const helperFn = e.Effect.fn(function*(someInput: number) {
    // By placing helperFn inside the layer, it can access serviceOne directly
    const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
    // Do something complex with result before returning it.
    const complexResult = serviceOneResult;
    return complexResult;
  });
  return {
    serviceTwoMethod: e.Effect.fn(function*(someInput) {
      return yield* helperFn(someInput);
    })
  }
}));
```

And here's option two

```ts twoslash
import * as e from "effect";

class ServiceOne extends e.Context.Tag("ServiceOne")<ServiceOne, {
  serviceOneMethod(someInput: number): e.Effect.Effect<string, never, never>;
}>() {};

class ServiceTwo extends e.Context.Tag("ServiceTwo")<ServiceTwo, {
  serviceTwoMethod(someInput: number): e.Effect.Effect<string, never, never>; 
}>() {};
// ---cut---
const helperFn = e.Effect.fn(function*(someInput: number) {
  const serviceOne = yield* ServiceOne;
  const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
  // Do something complex with result before returning it.
  const complexResult = serviceOneResult;
  return complexResult;
});

const ServiceTwoImpl = e.Layer.effect(ServiceTwo, e.Effect.gen(function*() {
  const serviceOne = yield* ServiceOne;
  const context = e.pipe(
    e.Context.empty(),
    e.Context.add(ServiceOne, serviceOne)
  );
  return {
    serviceTwoMethod: e.Effect.fn(function*(someInput) {
      // Because helperFn lives outside the impl, we have to pass a context or
      // eject from DI entirely and pass all services as function params
      return yield* helperFn(someInput).pipe(e.Effect.provide(context));
    })
  }
}));
```

As we get into 5+ services territory the code for specifying dependencies and adding them all to a context starts to feel like a lot of unnecessary boilerplate.

```ts
const serviceOne = yield* ServiceOne;
const serviceTwo = yield* ServiceTwo;
const serviceThree = yield* ServiceThree;
const serviceFour = yield* ServiceFour;
const serviceFive = yield* ServiceFive;
const context = e.pipe(
  e.Context.empty(),
  e.Context.add(ServiceOne, serviceOne),
  e.Context.add(ServiceTwo, serviceTwo),
  e.Context.add(ServiceThree, serviceThree),
  e.Context.add(ServiceFour, serviceFour),
  e.Context.add(ServiceFive, serviceFive)
)
```

Are we really going to refer to this as state-of-the-art TypeScript in 2026?

#### 5. Confusing Naming Conventions

Lastly, I've always been bothered by the term "service" in Effect. To me, "service" alludes to something running outside the project which my code invokes via some network call, but in Effect a service is basically a singleton instance which encapsulates some common internal logic. "Tag" is also confusing compared to a well-known term like "interface". I know that Effect is simply conforming to conventions established by other DI frameworks like ZIO or Angular, but from my point of view defaults should be sensible and names shouldn't be surprising.

## Effective Modules

All these headaches had me searching for ways to make Effect feel more self-explanatory and intuitive. Enough experimentation eventually led to something packageable as its own library. Enter Effective Modules.

#### Effective?

I'm coining the word "Effective" here to mean idiomatic, elegant Effect code. "Effective" is to Effect as "Pythonic" is to Python.

#### Modules?

Modules is my word of choice over "tag" or "service". Module typically refers to some group of encapsulated code which is internal to a project. Module also implies a grouping of related functionality, and when [Uncle Bob first described the Dependency Inversion Principle](https://ebooks.karbust.me/Technology/Agile.Software.Development.Principles.Patterns.and.Practices.Pearson.pdf#:~:text=Somebody%20has%20to%20create%20the%20instances%20of%20the%20concrete%20classes,%20and%20whatever%20module%20does%20that%20will%20depend%20on%20them) he used "class" and "module" interchangeably when referring to code building blocks that depend on each other. The wiki article on DIP [does this too](https://en.wikipedia.org/wiki/Dependency_inversion_principle#:~:text=modules%20should%20not%20import%20anything%20from). In Effective Modules you declare classes and call them module implementations, but they're really just factories for creating Effect services/layers. 

I confess to substituting one overloaded term for another with "modules"
- folders or files can be called modules (e.g. [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) or [Rust modules](https://doc.rust-lang.org/rust-by-example/mod/split.html))
- libraries can be modules (e.g. [Go Modules](https://go.dev/blog/using-go-modules))
- modules can simply mean a group of code (e.g. [NestJS modules](https://docs.nestjs.com/modules))

but the commonality here is that "module" in all those above examples refers to code that's internal, encapsulated, and logically grouped under a namespace. So that word seems like is a sensible fit for Effect services than "service" is.

#### Module Declaration

With Effective Modules, we return to the plain interface.

:::compare
```ts
class MyService extends Context.Tag("MyService")<
  MyService,
  {
    methodOne(input: number): Effect<string>;
  }
>() {}
```

```ts
interface IMyService {
  methodOne(input: number): GenEffect<string>;
}
```
:::

Tags are implicitly created when we define a module registry using a string enum for module ID uniqueness.

```ts
import {interfaces} from "effective-modules";

export enum Module {
  ServiceOne = "ServiceOne",
  ServiceTwo = "ServiceTwo"
}

export const modules = interfaces<Module, {
  [Module.ServiceOne]: IServiceOne;
  [Module.ServiceTwo]: IServiceTwo;
}>()
```

`modules` here is a value, not a type. We need a type for each module to represent it in an effect requirements channel. For that we utilize the key of the object type passed into `interfaces`, the members of the `Module` enum. A notable feature of `Effect<string, never, Module.ServiceOne>` is that `Effect<string, never, "ServiceOne">` is not assignable for it, nor is an effect requiring a service with the same name but from a different module set. For instance

```ts
enum ModuleTwo {
  ServiceOne = "ServiceOne";
}

const otherModules = interfaces<ModuleTwo, {
  [ModuleTwo.ServiceOne]: IServiceOne;
}>

declare const effectOne: Effect<string, never, Module.ServiceOne>;
// Type error
const effectTwo: Effect<string, never, ModuleTwo.ServiceOne> = effectOne;

```

This module ID uniqueness, despite the underlying string being the same, is a result of string enum members being nominal types.

#### Module Implementation

With Effective Modules we return to classes which implement the interface.

:::compare
```ts
const MyServiceImpl = Layer.effect(
  IMyService,
  Effect.gen(function*() {
    const otherService = yield* OtherService;
    return {
      methodOne: Effect.fn(function*(input) {
        const result = yield* otherService
          .doSomething(input);
        return result.toString();
      })
    }
  })
)

export const live = pipe(
  MyServiceImpl,
  Layer.provideMerge(OtherServiceImpl)
);
```

```ts
import {Implementing} from "effective-modules";

const { myService, otherService } = modules;

class MyServiceImpl extends 
  Implementing(myService).Uses(otherService) 
  implements IMyService {
  *methodOne(input: number): GenEffect<string> {
    const result = yield* this.dependencies
      .otherService
      .doSomething(input);
    return result.toString();
  }
}

export const live = pipe(
  MyServiceImpl.Layer,
  Layer.provideMerge(OtherServiceImpl.Layer)
);
```
:::

The superclass of `MyServiceImpl` created the `dependencies` structure automatically, and IDE autocomplete tooling for classes will generate method stubs for the class. But these semantics improvements on their own wouldn't have been enough to justify creating Effective Modules.

#### Precise Error Location

In Effective Modules the return type of generator functions is explicitly typed, meaning we get a targeted compilation error for any yield which requires services which the Effect is not supposed to depend on or which produces errors the Effect is not supposed to produce. Here's the same `ensureLoggedIn` example from earlier but now we have a clear error on the `resolveAccessToken` call.

![](./effective-modules-issue-highlighted.png)

This is thanks to the `GenEffect<>` type which was marked as the return type for the generator function.

#### The GenEffect type


#### dependencies, context

```ts twoslash
// @errors: 2322 2345
import * as e from "effect";

class NoSauceError extends e.Data.TaggedError("NoSauceError") {}
class NotCookedError extends e.Data.TaggedError("NotCookedError") {}
class LeftTableError extends e.Data.TaggedError("LeftTableError") {}

declare const eatFood: e.Effect.Effect<{satisfied: boolean}, NoSauceError>;

const goToRestaurant: () => e.Effect.Effect<{tip: number}, LeftTableError> = () => {
  return e.Effect.gen(function*() {
    // ... get served ...
    const {satisfied} = yield* eatFood;
    return false;
  })
}

class IThing extends e.Context.Tag("IThing")<IThing, {
  onePunch(): e.Effect.Effect<boolean, LeftTableError, never>;
}>() {}

const ThingImpl = e.Layer.effect(IThing, e.Effect.gen(function*() {
  return {
    onePunch() {
      return e.Effect.gen(function*() {
        return 5;
      })
    }
  }
}))

```

### Custom Initializer

## What would make this better?


