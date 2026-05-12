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
