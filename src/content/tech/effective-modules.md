---
title: 'Effective Modules'
subtitle: 'A more ergonomic way to write Effective code'
description: 'Making Effect More Ergonomic'
pubDate: 'April 19 2026'
heroImage: './effective-modules-splash.png'
---

(Note: this article assumes familiarity with TypeScript, Effect, and SOLID).  
To jump straight to the tool I built, [click here](#module-declaration)

Since late 2025, I've been moving all my personal projects over to Effect, along with several work projects at Flexport (before getting laid off a couple months ago). I've come to largely agree with the premise that Effect is

> the missing TypeScript standard library

- [algebraic data types](https://doc.rust-lang.org/std/keyword.enum.html)
- [return types encoding error information](https://doc.rust-lang.org/std/result/index.html)
- [exhaustive pattern matching](https://doc.rust-lang.org/book/ch06-02-match.html)
- [first-class dependency injection](https://www.reddit.com/r/react/comments/1njcicg/comment/neunray/?utm_source=share&utm_medium=web3x&utm_name=web3xcss&utm_term=1&utm_content=share_button)
- [type-safe schema decoding](http://zod.dev/)

In 2026, serious developers who understand the value of a strongly-typed language consider all these table stakes for a robust, type-safe programming platform. All these are missing from vanilla TypeScript. A comprehensive standard library *should* include all these features, and Effect has done it for the TypeScript ecosystem, arguably *outdoing* the ecosystem alternatives on every front. Effect has brought DI into the type system. That is, there is a **compile-time failure** when required dependencies aren't provided. In general, few DI systems across all major programming languages offer this highest level of correctness.

So Effect seems like the right choice for writing TypeScript at scale. However, as I adopt Effect conventions like services, context, and layers across my projects, I keep running into some awkward developer experiences.

## Headaches

#### 1. Decoupling Impl from Interface

In Effect v3, were [encouraged](https://effect.website/docs/requirements-management/layers/#simplifying-service-definitions-with-effectservice) to use the `Effect.Service` utility to improve code succinctness. Provide a default implementation of a service and its interface gets inferred.

```ts twoslash
import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node"

class Cache extends Effect.Service<Cache>()("app/Cache", {
  // Define how to create the service
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lookup = (key: string) => fs.readFileString(`cache/${key}`);
    return { lookup } as const;
  }),
  // Specify dependencies
  dependencies: [NodeFileSystem.layer]
}) {}


Effect.gen(function*() {
    const cache = yield* Cache;
    yield* cache.lookup("some key");
    //           ^?
});
```

While this does improve readability (compared to declaring the tag and layer separately), the trade-off is violating a sacred SOLID pillar, the [Dependency Inversion principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle), which mandates that maintainable code ought to depend on abstractions, not concretions. If a bug is introduced into the implementation, a compiler error should ideally appear *in* the implementation block and the interface should not change. But with `Effect.Service` an error may instead appear in clients of the service because changing the implementation might also change the interface.

```ts twoslash
// @errors: 2551
import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node"
// ---cut---
class Cache extends Effect.Service<Cache>()("app/Cache", {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    // Accidentally changed the spelling of "lookup" to "lockup"
    const lockup = (key: string) => fs.readFileString(`cache/${key}`);
    //    ^^^^^^
    return { lockup } as const;
  }),
  dependencies: [NodeFileSystem.layer]
}) {}

Effect.gen(function*() {
    const cache = yield* Cache;
    yield* cache.lookup("some key");
});
```

I deem Effect v3's `Effect.Service` an anti-pattern, but if it's so problematic why was it introduced at all?

#### 2. Awkward Interface Syntax

`Effect.Service` was introduced because the right way to do things *sucks*. In Effect, declaring an interface (tag) looks like this

```ts twoslash
// @errors: 2507 2558
import { Effect, Context } from "effect";
import { PlatformError } from "@effect/platform/Error";
// ---cut---
type ICache = {
  lookup(key: string): Effect.Effect<string, PlatformError, never>
}

class Cache extends Context.Tag<Cache, ICache>("app/Cache") {}
```

Oh wait no it's

```ts twoslash
// @errors: 2558 2554
import { Effect, Context } from "effect";
import { PlatformError } from "@effect/platform/Error";
type ICache = {
  lookup(key: string): Effect.Effect<string, PlatformError, never>
}
// ---cut---
class Cache extends Context.Tag<Cache, ICache>()("app/Cache") {}
```

Still not it. Maybe

```ts twoslash
import { Effect, Context } from "effect";
import { PlatformError } from "@effect/platform/Error";
type ICache = {
  lookup(key: string): Effect.Effect<string, PlatformError, never>
}
// ---cut---
class Cache extends Context.Tag("app/Cache")<Cache, ICache>() {}
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

Seeing the whole function light up as incorrect is not conducive to productively finding and fixing the bug. Ideally only the `resolveAccessToken` line would be highlighted as wrong, prompting me to pipe a provided context containing the required service.

When one runs into this kind of issue frequently, it becomes tempting to take the path of least resistance. Often times that looks like handling all possible errors after the entire effect's body rather than handling each error at the line which produces it; over time this leads to brittle and confusing code.

#### 4. Verbose Dependency Passing

Building on that `resolveAccessToken` example, when you want to call an effect which depends on 1+ services you need to either define that effect within the layer implementation's closure so there's access to services yielded at layer construction time, or you need to create a custom context and provide it to the effect before yielding.

Here's an example of the first option

```ts twoslash
import { Effect, Context, Layer } from "effect";
// ---cut---
class ServiceOne extends Context.Tag("ServiceOne")<ServiceOne, {
  serviceOneMethod(someInput: number): Effect.Effect<string, never, never>;
}>() {};

class ServiceTwo extends Context.Tag("ServiceTwo")<ServiceTwo, {
  serviceTwoMethod(someInput: number): Effect.Effect<string, never, never>; 
}>() {};

const ServiceTwoImpl = Layer.effect(ServiceTwo, Effect.gen(function*() {
  const serviceOne = yield* ServiceOne;
  const helperFn = Effect.fn(function*(someInput: number) {
    //  ^?
    // By placing helperFn inside the layer, it can access serviceOne directly
    const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
    // Do something complex with result before returning it.
    const complexResult = serviceOneResult;
    return complexResult;
  });
  return {
    serviceTwoMethod: Effect.fn(function*(someInput) {
      return yield* helperFn(someInput);
    })
  }
}));
```

And here's option two

```ts twoslash
import { Effect, Context, Layer, pipe } from "effect";

class ServiceOne extends Context.Tag("ServiceOne")<ServiceOne, {
  serviceOneMethod(someInput: number): Effect.Effect<string, never, never>;
}>() {};

class ServiceTwo extends Context.Tag("ServiceTwo")<ServiceTwo, {
  serviceTwoMethod(someInput: number): Effect.Effect<string, never, never>; 
}>() {};
// ---cut---
const helperFn = Effect.fn(function*(someInput: number) {
  //  ^?
  const serviceOne = yield* ServiceOne;
  const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
  // Do something complex with result before returning it.
  const complexResult = serviceOneResult;
  return complexResult;
});

const ServiceTwoImpl = Layer.effect(ServiceTwo, Effect.gen(function*() {
  const serviceOne = yield* ServiceOne;
  const context = pipe(
    Context.empty(),
    Context.add(ServiceOne, serviceOne)
  );
  return {
    serviceTwoMethod: Effect.fn(function*(someInput) {
      // Because helperFn lives outside the impl, we have to pass a context or
      // eject from DI entirely and pass all services as function params
      return yield* helperFn(someInput).pipe(Effect.provide(context));
    })
  }
}));
```

As we get into 5+ services territory the code for specifying dependencies and adding them all to a context starts to smell like unnecessary boilerplate.

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

*This* is what we're calling state-of-the-art TypeScript in 2026?

#### 5. Confusing Naming Conventions

Lastly, I've always been bothered by Effect's use of the term "service". To me, "service" alludes to some outside entity which my code can invoke via some network call, but in Effect a service is basically a singleton instance which encapsulates some common internal logic. "Tag" is also confusing compared to a well-known term like "interface". I'm aware that Effect is following conventions established by other DI frameworks like [ZIO](https://zio.dev/reference/di/) or [Angular](https://angular.dev/guide/di#what-are-services), but from my POV defaults should be sensible and names [shouldn't be surprising](https://en.wikipedia.org/wiki/Principle_of_least_astonishment).

## Effective Modules

All these headaches had me searching for ways to make Effect feel more self-explanatory and intuitive. Enough experimentation eventually led to something packageable as its own library. I'm calling it [Effective Modules](https://github.com/ozyman42/effective-modules). Perhaps some of these ideas / patterns might make their way into Effect at some point.

#### Effective?

I'm coining the word "Effective" here to mean idiomatic, elegant Effect code. "Effective" is to Effect as "Pythonic" is to Python. Not to be confused with ["Effectful"](https://idiomaticsoft.com/post/2024-01-02-effect-systems/).

#### Modules?

Modules is my word of choice over "tag" or "service". Module typically refers to some group of encapsulated code which is internal to a project. Module also implies a grouping of related functionality, and when [Uncle Bob first described the Dependency Inversion Principle](https://ebooks.karbust.me/Technology/Agile.Software.Development.Principles.Patterns.and.Practices.Pearson.pdf#:~:text=Somebody%20has%20to%20create%20the%20instances%20of%20the%20concrete%20classes,%20and%20whatever%20module%20does%20that%20will%20depend%20on%20them) he used "class" and "module" interchangeably when referring to code building blocks that depend on each other. The wiki article on DIP [does this too](https://en.wikipedia.org/wiki/Dependency_inversion_principle#:~:text=modules%20should%20not%20import%20anything%20from).

I confess to substituting one overloaded term for another with "modules"
- folders or files can be called modules (e.g. [ES Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) or [Rust modules](https://doc.rust-lang.org/rust-by-example/mod/split.html))
- libraries can be modules (e.g. [Go Modules](https://go.dev/blog/using-go-modules))
- modules can simply mean a group of code (e.g. [NestJS modules](https://docs.nestjs.com/modules))

The commonality here is that "module" in all these cases refers to code that's internal, encapsulated, and logically grouped under a namespace. So that word seems like a more sensible fit than "service". I'd love to see a rebuttal.

#### Module Declaration

With Effective Modules, we return to the plain interface.

:::compare
```ts twoslash
import { Context, Data, Effect } from "effect";
class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
// ---cut---
class Users extends Context.Tag("Users")<
  Users,
  {
    createUser(
      username: string,
      signature: string
    ): Effect.Effect<{token: string}, BadSignature>;
    
    authenticate(
      username: string,
      signature: string
    ): Effect.Effect<{token: string}, BadSignature>;
  }
>() {}
```

```ts twoslash
import { Data, Effect } from "effect";
class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
// ---cut---
interface IUsers {
  createUser(
    username: string,
    signature: string
  ): Effect.fn.Return<{token: string}, BadSignature>;
  
  authenticate(
    username: string,
    signature: string
  ): Effect.fn.Return<{token: string}, BadSignature>;
}
```
:::

Tags are implicitly created by mapping each module name to an interface.

```ts twoslash
import { Data, Effect, Option } from "effect";

class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
class InvalidToken extends Data.TaggedError("InvalidToken")<{}> {}
class NoSuchTask extends Data.TaggedError("NoSuchTask")<{}> {}

interface IUsers {
  createUser(username: string, signature: string): Effect.fn.Return<{token: string}, BadSignature>;
  authenticate(username: string, signature: string): Effect.fn.Return<{token: string}, BadSignature>;
}

interface ITodos {
  getTasks(token: string): Effect.fn.Return<{task: string; id: string;}[], InvalidToken>
  createTask(token: string, task: string): Effect.fn.Return<{task: string; id: string;}, InvalidToken>
  completeTask(token: string, id: string): Effect.fn.Return<void, NoSuchTask | InvalidToken>;
}

interface IDatabase {
  get(key: string): Effect.fn.Return<Option.Option<string>>;
  set(key: string, value: string): Effect.fn.Return<void>;
}
// ---cut---
import { interfaces } from "effective-modules";

export enum Modules {
  Users = "Users",
  Todos = "Todos",
  Database = "Database"
}

export const modules = interfaces<Modules, {
  Users: IUsers;
  Todos: ITodos;
  Database: IDatabase;
}>(Modules);

modules;
//^?
```

The string enum members are used as the tags' identifier type, bypassing the need for the verbose class syntax [mentioned earlier](#2-awkward-interface-syntax). A nice property of string enums is that their members are nominal types, meaning typescript will treat two modules with the same name as distinct. 

```ts twoslash
// @errors: 2322 1005
import { Effect } from "effect";
import { interfaces } from "effective-modules";
// ---cut---
enum ModuleSetOne {
  Users = "Users",
  Database = "Database"
}

const moduleSetOne = interfaces<ModuleSetOne, {
  Users: {};
  Database: {};
}>(ModuleSetOne);

enum ModuleSetTwo {
  Users = "Users",
  Database = "Database"
}

const moduleSetTwo = interfaces<ModuleSetTwo, {
  Users: {};
  Database: {};
}>(ModuleSetTwo);

function* program(): Effect.fn.Return<void, never, ModuleSetTwo.Users> {
  yield* moduleSetTwo.Users;
  yield* moduleSetOne.Users;
}
```

We'll dive into this [a bit more later](#precise-error-location), but notice how we've managed to get an error at a specific line rather than the [entire generator function being marked as incorrect](#3-error-noise). This due to explicitly typing the return of the generator function using `Effect.fn.Return` rather than using the prescribed `Effect.gen` or `Effect.fn`.

#### Module Implementation

In Effective Modules, you create a class which implements an interface.

:::compare
```ts twoslash
import { Data, Effect, Option, Layer } from "effect";

class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
class InvalidToken extends Data.TaggedError("InvalidToken")<{}> {}
class NoSuchTask extends Data.TaggedError("NoSuchTask")<{}> {}

interface IUsers {
  login(username: string, signature: string): Effect.Effect<{token: string}, BadSignature>;
  validateToken(token: string): Effect.fn.Return<Option.Option<{username: string}>>;
}

interface ITodos {
  getTasks(token: string): Effect.Effect<{task: string; id: string;}[], InvalidToken>
  createTask(token: string, task: string): Effect.Effect<{task: string; id: string;}, InvalidToken>
  completeTask(token: string, id: string): Effect.Effect<void, NoSuchTask | InvalidToken>;
}

interface IDatabase {
  getAll(table: string, username: string): Effect.Effect<{key: string, value: string}[]>;
  get(table: string, username: string, key: string): Effect.fn.Return<Option.Option<string>>;
  set(table: string, username: string, value: string, key?: string): Effect.fn.Return<{key: string}>;
  delete(table: string, username: string, key: string): Effect.fn.Return<void>;
}

import { interfaces } from "effective-modules";

export enum Modules {
  Users = "Users",
  Todos = "Todos",
  Database = "Database"
}

export const modules = interfaces<Modules, {
  Users: IUsers;
  Todos: ITodos;
  Database: IDatabase;
}>(Modules);
// ---cut---
export const TodosLive = Layer.effect(
  modules.Todos,
  Effect.gen(function*() {
    const users = yield* modules.Users;
    const db = yield* modules.Database;
    const TASKS_TABLE = "tasks";
    const validateTokenOrError = Effect.fn(function*(token: string) {
      const maybeUsername = yield* users.validateToken(token);
      if (Option.isNone(maybeUsername)) {
        return yield* new InvalidToken();
      }
      return maybeUsername.value.username;
    });
    return {
      getTasks: Effect.fn(function*(token) {
        const username = yield* validateTokenOrError(token);
        const items = yield* db.getAll(TASKS_TABLE, username);
        return items.map(({key, value}) => ({id: key, task: value}));
      }),
      createTask: Effect.fn(function*(token, task) {
        const username = yield* validateTokenOrError(token);
        const { key } = yield* db.set(TASKS_TABLE, username, task);
        return {id: key, task};
      }),
      completeTask: Effect.fn(function* (token, id) {
        const username = yield* validateTokenOrError(token);
        const exists = Option.isSome(yield* db.get(TASKS_TABLE, username, id));
        if (!exists) return yield* new NoSuchTask();
        yield* db.delete(TASKS_TABLE, username, id);
      })
    };
  })
)

TodosLive
// ^?
```

```ts twoslash
import { Data, Effect, Option, Layer } from "effect";

class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
class InvalidToken extends Data.TaggedError("InvalidToken")<{}> {}
class NoSuchTask extends Data.TaggedError("NoSuchTask")<{}> {}

interface IUsers {
  login(username: string, signature: string): Effect.fn.Return<{token: string}, BadSignature>;
  validateToken(token: string): Effect.fn.Return<Option.Option<{username: string}>>;
}

interface ITodos {
  getTasks(token: string): Effect.fn.Return<{task: string; id: string;}[], InvalidToken>
  createTask(token: string, task: string): Effect.fn.Return<{task: string; id: string;}, InvalidToken>
  completeTask(token: string, id: string): Effect.fn.Return<void, NoSuchTask | InvalidToken>;
}

interface IDatabase {
  getAll(table: string, username: string): Effect.fn.Return<{key: string, value: string}[]>;
  get(table: string, username: string, key: string): Effect.fn.Return<Option.Option<string>>;
  set(table: string, username: string, value: string, key?: string): Effect.fn.Return<{key: string}>;
  delete(table: string, username: string, key: string): Effect.fn.Return<void>;
}

import { interfaces } from "effective-modules";

export enum Modules {
  Users = "Users",
  Todos = "Todos",
  Database = "Database"
}

export const modules = interfaces<Modules, {
  Users: IUsers;
  Todos: ITodos;
  Database: IDatabase;
}>(Modules);
// ---cut---
import { Implementing } from "effective-modules";

class TodosImpl extends Implementing(modules.Todos).Uses(modules.Database, modules.Users) implements ITodos {
  private static readonly TASKS_TABLE = "tasks";

  *getTasks(token: string): Effect.fn.Return<{ task: string; id: string; }[], InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const items = yield* this.dependencies.Database.getAll(
      TodosImpl.TASKS_TABLE, username
    );
    return items.map(({key, value}) => ({id: key, task: value}));
  }

  *createTask(token: string, task: string): Effect.fn.Return<{ task: string; id: string; }, InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const { key } = yield* this.dependencies.Database.set(
      TodosImpl.TASKS_TABLE, username, task
    );
    return {id: key, task};
  }

  *completeTask(token: string, id: string): Effect.fn.Return<void, NoSuchTask | InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const exists = Option.isSome(yield* this.dependencies.Database.get(
      TodosImpl.TASKS_TABLE, username, id
    ));
    if (!exists) return yield* new NoSuchTask();
    yield* this.dependencies.Database.delete(
      TodosImpl.TASKS_TABLE, username, id
    );
  }

  private *validateTokenOrError(token: string): Effect.fn.Return<string, InvalidToken> {
    const maybeUsername = yield* this.dependencies.Users.validateToken(token);
    if (Option.isNone(maybeUsername)) {
      return yield* new InvalidToken();
    }
    return maybeUsername.value.username;
  }
}

export const TodosLive = TodosImpl.Layer;
//           ^?
```
:::

The superclass `Implementing(modules.Todos)` created the `dependencies` structure automatically, and IDE autocomplete tooling for classes implementing an interface will generate method stubs so you don't need to type out the method signatures manually. Generator methods are used directly rather than wrapping in `Effect.fn` because that allows us to cleanly access `this.dependencies` and `this.context`.

#### Precise Error Location

If you get nothing else from this article take this away: explicitly annotating your generator functions with a return type of `Effect.fn.Return<A, E, R>` will enable exact error locations. This is an alias type that Effect ships to represent essentially a Generator of an effect.

Here's the same `ensureLoggedIn` example [from earlier](#3-error-noise) but now we have a clear error on the `resolveAccessToken` call.

![](./effective-modules-issue-highlighted.png)

Let's see this in action in our Todo example where we'll yield an unexpected error from the `validateTokenOrError` method.

:::compare
```ts twoslash
// @errors: 2345 2322
import { Data, Effect, Option, Layer } from "effect";

class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
class InvalidToken extends Data.TaggedError("InvalidToken")<{}> {}
class NoSuchTask extends Data.TaggedError("NoSuchTask")<{}> {}

interface IUsers {
  login(username: string, signature: string): Effect.Effect<{token: string}, BadSignature>;
  validateToken(token: string): Effect.fn.Return<Option.Option<{username: string}>>;
}

interface ITodos {
  getTasks(token: string): Effect.Effect<{task: string; id: string;}[], InvalidToken>
  createTask(token: string, task: string): Effect.Effect<{task: string; id: string;}, InvalidToken>
  completeTask(token: string, id: string): Effect.Effect<void, NoSuchTask | InvalidToken>;
}

interface IDatabase {
  getAll(table: string, username: string): Effect.Effect<{key: string, value: string}[]>;
  get(table: string, username: string, key: string): Effect.fn.Return<Option.Option<string>>;
  set(table: string, username: string, value: string, key?: string): Effect.fn.Return<{key: string}>;
  delete(table: string, username: string, key: string): Effect.fn.Return<void>;
}

import { interfaces } from "effective-modules";

export enum Modules {
  Users = "Users",
  Todos = "Todos",
  Database = "Database"
}

export const modules = interfaces<Modules, {
  Users: IUsers;
  Todos: ITodos;
  Database: IDatabase;
}>(Modules);
// ---cut---
export const TodosLive = Layer.effect(
  modules.Todos,
  Effect.gen(function*() {
    const users = yield* modules.Users;
    const db = yield* modules.Database;
    const TASKS_TABLE = "tasks";
    const validateTokenOrError = Effect.fn(function*(token: string) {
      const maybeUsername = yield* users.validateToken(token);
      if (Option.isNone(maybeUsername)) {
        return yield* new InvalidToken();
      }
      if (token.length) {
        return yield* new BadSignature();
      }
      return maybeUsername.value.username;
    });
    return {
      getTasks: Effect.fn(function*(token) {
        const username = yield* validateTokenOrError(token);
        const items = yield* db.getAll(TASKS_TABLE, username);
        return items.map(({key, value}) => ({id: key, task: value}));
      }),
      createTask: Effect.fn(function*(token, task) {
        const username = yield* validateTokenOrError(token);
        const { key } = yield* db.set(TASKS_TABLE, username, task);
        return {id: key, task};
      }),
      completeTask: Effect.fn(function* (token, id) {
        const username = yield* validateTokenOrError(token);
        const exists = Option.isSome(yield* db.get(TASKS_TABLE, username, id));
        if (!exists) return yield* new NoSuchTask();
        yield* db.delete(TASKS_TABLE, username, id);
      })
    };
  })
)
```

```ts twoslash
// @errors: 2345 2322
import { Data, Effect, Option, Layer } from "effect";

class BadSignature extends Data.TaggedError("BadSignature")<{}> {}
class InvalidToken extends Data.TaggedError("InvalidToken")<{}> {}
class NoSuchTask extends Data.TaggedError("NoSuchTask")<{}> {}

interface IUsers {
  login(username: string, signature: string): Effect.fn.Return<{token: string}, BadSignature>;
  validateToken(token: string): Effect.fn.Return<Option.Option<{username: string}>>;
}

interface ITodos {
  getTasks(token: string): Effect.fn.Return<{task: string; id: string;}[], InvalidToken>
  createTask(token: string, task: string): Effect.fn.Return<{task: string; id: string;}, InvalidToken>
  completeTask(token: string, id: string): Effect.fn.Return<void, NoSuchTask | InvalidToken>;
}

interface IDatabase {
  getAll(table: string, username: string): Effect.fn.Return<{key: string, value: string}[]>;
  get(table: string, username: string, key: string): Effect.fn.Return<Option.Option<string>>;
  set(table: string, username: string, value: string, key?: string): Effect.fn.Return<{key: string}>;
  delete(table: string, username: string, key: string): Effect.fn.Return<void>;
}

import { interfaces } from "effective-modules";

export enum Modules {
  Users = "Users",
  Todos = "Todos",
  Database = "Database"
}

export const modules = interfaces<Modules, {
  Users: IUsers;
  Todos: ITodos;
  Database: IDatabase;
}>(Modules);
// ---cut---
import { Implementing } from "effective-modules";

class TodosImpl extends Implementing(modules.Todos).Uses(modules.Database, modules.Users) implements ITodos {
  private static readonly TASKS_TABLE = "tasks";

  *getTasks(token: string): Effect.fn.Return<{ task: string; id: string; }[], InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const items = yield* this.dependencies.Database.getAll(
      TodosImpl.TASKS_TABLE, username
    );
    return items.map(({key, value}) => ({id: key, task: value}));
  }

  *createTask(token: string, task: string): Effect.fn.Return<{ task: string; id: string; }, InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const { key } = yield* this.dependencies.Database.set(
      TodosImpl.TASKS_TABLE, username, task
    );
    return {id: key, task};
  }

  *completeTask(token: string, id: string): Effect.fn.Return<void, NoSuchTask | InvalidToken> {
    const username = yield* this.validateTokenOrError(token);
    const exists = Option.isSome(yield* this.dependencies.Database.get(
      TodosImpl.TASKS_TABLE, username, id
    ));
    if (!exists) return yield* new NoSuchTask();
    yield* this.dependencies.Database.delete(
      TodosImpl.TASKS_TABLE, username, id
    );
  }

  private *validateTokenOrError(token: string): Effect.fn.Return<string, InvalidToken> {
    const maybeUsername = yield* this.dependencies.Users.validateToken(token);
    if (Option.isNone(maybeUsername)) {
      return yield* new InvalidToken();
    }
    if (token.length) {
      return yield* new BadSignature();
    }
    return maybeUsername.value.username;
  }
}

export const TodosLive = TodosImpl.Layer;
```
:::

In Effect's current canon, the entire implementation gets marked as invalid, which isn't helpful when trying to pinpoint the issue.

#### dependencies, context

As mentioned before, the `Implementing` utility returns an abstract superclass that provides a `dependencies` structure. The superclass also provides a `context` structure to avoid the problem of [repeating yourself](#:~:text=state%2Dof%2Dthe%2Dart%20TypeScript) when creating a context to pass dependencies to effects outside of the implementation. Revisiting our early example we have

:::compare
```ts twoslash
import { Effect, Context, Layer, pipe } from "effect";

class ServiceOne extends Context.Tag("ServiceOne")<ServiceOne, {
  serviceOneMethod(someInput: number): Effect.Effect<string, never, never>;
}>() {};

class ServiceTwo extends Context.Tag("ServiceTwo")<ServiceTwo, {
  serviceTwoMethod(someInput: number): Effect.Effect<string, never, never>; 
}>() {};
// ---cut---
const helperFn = Effect.fn(function*(someInput: number) {
  const serviceOne = yield* ServiceOne;
  const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
  // Do something complex with result before returning it.
  const complexResult = serviceOneResult;
  return complexResult;
});

const ServiceTwoImpl = Layer.effect(ServiceTwo, Effect.gen(function*() {
  const serviceOne = yield* ServiceOne;
  const context = pipe(
    Context.empty(),
    Context.add(ServiceOne, serviceOne)
  );
  return {
    serviceTwoMethod: Effect.fn(function*(someInput) {
      // Because helperFn lives outside the impl, we have to pass a context or
      // eject from DI entirely and pass all services as function params
      return yield* pipe(
        helperFn(someInput),
        Effect.provide(context)
      );
    })
  }
}));
```
```ts twoslash
import { Effect, Context, Layer, pipe } from "effect";

interface IServiceOne {
  serviceOneMethod(someInput: number): Effect.fn.Return<string, never, never>;
}

interface IServiceTwo {
  serviceTwoMethod(someInput: number): Effect.fn.Return<string, never, never>; 
}

enum Modules {
  ServiceOne = "ServiceOne",
  ServiceTwo = "ServiceTwo"
}

import { interfaces, Implementing } from "effective-modules";

const modules = interfaces<Modules, {
  ServiceOne: IServiceOne;
  ServiceTwo: IServiceTwo;
}>(Modules);

// ---cut---
const helperFn = Effect.fn(function*(someInput: number): Effect.fn.Return<string, never, Modules.ServiceOne> {
  const serviceOne = yield* modules.ServiceOne;
  const serviceOneResult = yield* serviceOne.serviceOneMethod(someInput);
  // Do something complex with result before returning it.
  const complexResult = serviceOneResult;
  return complexResult;
});

class ServiceTwoImpl extends Implementing(modules.ServiceTwo).Uses(modules.ServiceOne) implements IServiceTwo {
  *serviceTwoMethod(someInput: number): Effect.fn.Return<string, never, never> {
    // Because helperFn lives outside the impl, we have to pass a context or
    // eject from DI entirely and pass all services as function params
    return yield* pipe(
      helperFn(someInput),
      Effect.provide(this.context)
    );
  }
}
```
:::

Notice how in the Effective Modules sample, there's no need to manually create the context

#### Custom Initializer

To allow for complex construction behavior, one can pass a 

#### effunct 

## What would make this better?
