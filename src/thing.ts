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


e.Context.empty().pipe(
  e.Context.add(IThing, {})
)